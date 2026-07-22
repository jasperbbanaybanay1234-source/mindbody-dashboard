/**
 * GET /api/mb-pt-analytics
 *
 * Returns data for the Personal Training tab:
 *   stats         – PT and SP session counts across 4 time windows
 *   ptReds        – clients who had PT/SP last week but not this week
 *   openGym       – clients with 1+ open-gym sessions this week
 *   unchecked     – past PT/SP sessions still in "Booked" status
 *   sessionCredits– clients with accumulated unused PT/SP session credits
 *
 * Mindbody appointment objects carry only SessionTypeId (not a name), so we
 * fetch /site/sessiontypes first to build an id→name lookup for classification.
 * Client names are fetched in bulk via /client/clients.
 */
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import {
  subDays, format, parseISO,
  startOfMonth, endOfMonth, endOfDay, subMonths,
} from 'date-fns';

const SKIP_STATUS  = new Set(['NoShow', 'LateCancelled', 'Cancelled']);
const CREDIT_BATCH = 10;
const CLIENT_BATCH = 20; // Mindbody caps ClientIds at 20 per request

// ─── Session-type classifier ─────────────────────────────────────────────────
// SP check must come BEFORE PT — "Semi Private Personal Training" contains
// "personal train" so would wrongly match pt first.
function classify(name = '') {
  const s = name.toLowerCase();
  if (/semi.?private/.test(s) || /\bsp\b/.test(s) || /\bsp\d/.test(s) || /small.?private/.test(s) || /partner.?train/.test(s) || /2:1/.test(s) || /3:1/.test(s)) return 'sp';
  if (/personal\s*train/.test(s) || /\bpt\b/.test(s) || /\bpt\d/.test(s) || /1[:\s]1/.test(s) || /1on1/.test(s) || /individual\s*(coach|program)/.test(s)) return 'pt';
  if (/open.?gym/.test(s) || /open.?train/.test(s) || /gym.?access/.test(s) || s === 'open gym') return 'gym';
  return 'other';
}

// ─── Session type map: SessionTypeId → name ───────────────────────────────────
async function fetchSessionTypeMap(token) {
  try {
    const data = await mbGet('/site/sessiontypes', token, { OnlineOnly: false });
    const types = data.SessionTypes || [];
    const map = {};
    for (const t of types) map[t.Id] = t.Name || '';
    console.log('[mb-pt-analytics] session types:', types.map(t => `${t.Id}=${t.Name}`).join(', '));
    return map;
  } catch (e) {
    console.warn('[mb-pt-analytics] could not fetch session types:', e.message);
    return {};
  }
}

// ─── Client info map: clientId → { name, email, phone } ──────────────────────
// Returns { map, _firstRawClient, _firstResponseKeys } for debug
async function fetchClientMap(token, clientIds) {
  if (!clientIds.length) return { map: {}, _firstRawClient: null, _firstResponseKeys: [], _error: null };
  const map = {};
  let _firstRawClient = null;
  let _firstResponseKeys = [];
  let _error = null;
  for (let i = 0; i < clientIds.length; i += CLIENT_BATCH) {
    const batch = clientIds.slice(i, i + CLIENT_BATCH);
    try {
      const data = await mbGet('/client/clients', token, {
        ClientIds: batch,   // max 20 per request
        Limit:     CLIENT_BATCH,
      });
      if (_firstResponseKeys.length === 0) _firstResponseKeys = Object.keys(data);
      const clients = data.Clients || data.clients || [];
      if (_firstRawClient === null && clients.length > 0) _firstRawClient = clients[0];
      for (const c of clients) {
        const id = String(c.UniqueId || c.Id || '');
        if (id) map[id] = {
          name:  `${c.FirstName || ''} ${c.LastName || ''}`.trim() || `Client ${id}`,
          email: c.Email || '',
          phone: formatPhone(c.MobilePhone || c.HomePhone),
        };
      }
    } catch (e) {
      _error = e.message;
      console.warn('[mb-pt-analytics] client batch error:', e.message);
    }
  }
  return { map, _firstRawClient, _firstResponseKeys, _error };
}

// ─── Appointment fetcher ──────────────────────────────────────────────────────
async function fetchAppointments(token, startDate, endDate) {
  let all = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/appointment/staffappointments', token, {
      StartDate: startDate,
      EndDate:   endDate,
      Limit:     200,
      Offset:    offset,
    });
    const appts = data.Appointments || [];
    all = all.concat(appts);
    if (appts.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

// ─── Client services fetcher (remaining PT/SP credits) ───────────────────────
async function fetchClientServices(token, clientId) {
  try {
    const data = await mbGet('/client/clientservices', token, {
      clientId,
      ActiveOnly: true,
      Limit: 50,
    });
    return data.ClientServices || [];
  } catch {
    return [];
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now   = new Date();

    // ── Date windows ──────────────────────────────────────────────────────
    const yesterday = endOfDay(subDays(now, 1));

    const w1End   = yesterday;
    const w1Start = subDays(w1End, 6);

    const w2End   = endOfDay(subDays(w1Start, 1));
    const w2Start = subDays(w2End, 6);

    const w3End   = endOfDay(subDays(w2Start, 1));
    const w3Start = subDays(w3End, 6);

    const w4End   = endOfDay(subDays(w3Start, 1));
    const w4Start = subDays(w4End, 6);

    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd   = yesterday;
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd   = endOfMonth(subMonths(now, 1));

    const fetchStart = format(lastMonthStart, "yyyy-MM-dd'T'00:00:00");
    const fetchEnd   = format(yesterday,      "yyyy-MM-dd'T'23:59:59");

    // ── Fetch session types + appointments in parallel ────────────────────
    const [sessionTypeMap, raw] = await Promise.all([
      fetchSessionTypeMap(token),
      fetchAppointments(token, fetchStart, fetchEnd),
    ]);

    // ── Classify & enrich (names placeholder — filled after client fetch) ─
    const appts = raw.map(a => ({
      ...a,
      _typeName:  sessionTypeMap[a.SessionTypeId] || '',
      _type:      classify(sessionTypeMap[a.SessionTypeId] || ''),
      _date:      parseISO(a.StartDateTime),
      _id:        String(a.ClientId),
      _name:      `Client ${a.ClientId}`,
      _email:     '',
      _phone:     '',
      _staffName: `${a.Staff?.FirstName || ''} ${a.Staff?.LastName || ''}`.trim(),
    }));

    // ── Fetch client names for all PT/SP clients ──────────────────────────
    const ptspAppts = appts.filter(a => a._type === 'pt' || a._type === 'sp');
    const ptspIds   = [...new Set(ptspAppts.map(a => a._id))];
    const { map: clientMap, _firstRawClient, _firstResponseKeys, _error: _clientError } = await fetchClientMap(token, ptspIds);

    // Back-fill names/email/phone
    for (const a of appts) {
      const info = clientMap[a._id];
      if (info) { a._name = info.name; a._email = info.email; a._phone = info.phone; }
    }

    const ptAppts  = appts.filter(a => a._type === 'pt');
    const spAppts  = appts.filter(a => a._type === 'sp');
    const ptsp     = appts.filter(a => a._type === 'pt' || a._type === 'sp');
    const gymAppts = appts.filter(a => a._type === 'gym');

    // ── Helpers ───────────────────────────────────────────────────────────
    function countIn(arr, start, end) {
      return arr.filter(a => !SKIP_STATUS.has(a.Status) && a._date >= start && a._date <= end).length;
    }

    function clientsIn(arr, start, end) {
      return new Set(
        arr.filter(a => !SKIP_STATUS.has(a.Status) && a._date >= start && a._date <= end).map(a => a._id)
      );
    }

    function weekCounts(arr, clientId) {
      const f = (s, e) => arr.filter(a => a._id === clientId && !SKIP_STATUS.has(a.Status) && a._date >= s && a._date <= e).length;
      return { w1: f(w1Start, w1End), w2: f(w2Start, w2End), w3: f(w3Start, w3End), w4: f(w4Start, w4End) };
    }

    // ── Stats ─────────────────────────────────────────────────────────────
    const stats = {
      pt: {
        thisWeek:  countIn(ptAppts, w1Start, w1End),
        lastWeek:  countIn(ptAppts, w2Start, w2End),
        thisMonth: countIn(ptAppts, thisMonthStart, thisMonthEnd),
        lastMonth: countIn(ptAppts, lastMonthStart, lastMonthEnd),
      },
      sp: {
        thisWeek:  countIn(spAppts, w1Start, w1End),
        lastWeek:  countIn(spAppts, w2Start, w2End),
        thisMonth: countIn(spAppts, thisMonthStart, thisMonthEnd),
        lastMonth: countIn(spAppts, lastMonthStart, lastMonthEnd),
      },
    };

    // ── PT Red's List ──────────────────────────────────────────────────────
    const thisWeekClients = clientsIn(ptsp, w1Start, w1End);
    const lastWeekClients = clientsIn(ptsp, w2Start, w2End);

    const ptReds = [...lastWeekClients]
      .filter(id => !thisWeekClients.has(id))
      .map(id => {
        const clientAppts = ptsp.filter(a => a._id === id).sort((a, b) => b._date - a._date);
        const last = clientAppts[0];
        return {
          id,
          name:             last._name,
          email:            last._email,
          phone:            last._phone,
          service:          last._typeName,
          staffName:        last._staffName,
          lastSession:      format(last._date, 'yyyy-MM-dd'),
          weeklyAttendance: weekCounts(ptsp, id),
        };
      })
      .sort((a, b) => b.lastSession.localeCompare(a.lastSession));

    // ── Open Gym (this week, 1+) ──────────────────────────────────────────
    const gymMap = {};
    for (const a of gymAppts) {
      if (SKIP_STATUS.has(a.Status) || a._date < w1Start || a._date > w1End) continue;
      if (!gymMap[a._id]) gymMap[a._id] = { id: a._id, name: a._name, email: a._email, count: 0 };
      gymMap[a._id].count++;
    }
    const openGym = Object.values(gymMap).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

    // ── Unchecked Sessions ────────────────────────────────────────────────
    // Past PT/SP sessions (last 7 days) not marked Completed or legitimately
    // cancelled — trainer hasn't signed them off yet
    const DONE_STATUS = new Set(['Completed', 'Cancelled', 'LateCancelled']);
    const unchecked = ptsp
      .filter(a => a._date >= w1Start && a._date < now && !DONE_STATUS.has(a.Status))
      .map(a => ({
        id:         String(a.Id),
        clientId:   a._id,
        clientName: a._name,
        service:    a._typeName,
        staffName:  a._staffName,
        startTime:  a.StartDateTime,
        type:       a._type,
      }))
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    // ── Session Credits ───────────────────────────────────────────────────
    const recentIds = [...new Set(
      ptsp.filter(a => a._date >= w4Start).map(a => a._id)
    )].slice(0, 60);

    const creditMap = {};
    for (let i = 0; i < recentIds.length; i += CREDIT_BATCH) {
      const batch = recentIds.slice(i, i + CREDIT_BATCH);
      const results = await Promise.allSettled(
        batch.map(async id => ({ id, services: await fetchClientServices(token, id) }))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') creditMap[r.value.id] = r.value.services;
      }
    }

    const sessionCredits = [];
    for (const [clientId, services] of Object.entries(creditMap)) {
      const ptSvcs = services.filter(s => {
        const t = classify(s.Name || s.ServiceName || '');
        return (t === 'pt' || t === 'sp') && (s.Remaining || 0) > 0;
      });
      if (ptSvcs.length === 0) continue;
      const total = ptSvcs.reduce((sum, s) => sum + (s.Remaining || 0), 0);
      const info  = clientMap[clientId];
      sessionCredits.push({
        id:       clientId,
        name:     info?.name || `Client ${clientId}`,
        email:    info?.email || '',
        credits:  total,
        services: ptSvcs.map(s => ({ name: s.Name || s.ServiceName || '', remaining: s.Remaining || 0 })),
      });
    }
    sessionCredits.sort((a, b) => b.credits - a.credits);

    // ── Debug ─────────────────────────────────────────────────────────────
    const sampleTypes = Object.entries(sessionTypeMap).map(([id, name]) => `${id}=${name}`);
    console.log(`[mb-pt-analytics] total=${raw.length} pt=${ptAppts.length} sp=${spAppts.length} gym=${gymAppts.length}`);

    return ok({
      stats, ptReds, openGym, unchecked, sessionCredits,
      _debug: {
        sampleTypes,
        totalRaw: raw.length,
        counts: { pt: ptAppts.length, sp: spAppts.length, gym: gymAppts.length },
        fetchStart, fetchEnd,
        clientFetch: {
          queriedIds:     ptspIds.slice(0, 5),
          mapSize:        Object.keys(clientMap).length,
          mapKeySample:   Object.keys(clientMap).slice(0, 5),
          responseKeys:   _firstResponseKeys,
          firstRawClient: _firstRawClient,
          error:          _clientError,
        },
      },
    });

  } catch (e) {
    console.error('mb-pt-analytics:', e);
    return err(e.message);
  }
};
