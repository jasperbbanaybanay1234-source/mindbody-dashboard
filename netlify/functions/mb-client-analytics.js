/**
 * 28-day rolling window, split into 4 weekly buckets — drives fringe / no-shows / stats.
 * Supports ?period=7days (default) or ?period=calendarWeek (last Mon–Sun).
 *
 * Red Flag List and Orange Flag List are NOT computed on this live path. They are
 * generated on a fixed Sydney-time schedule (Red: Mondays at 1am; Orange: every
 * morning at 1am) and persisted to Netlify Blobs. Every normal request — including
 * a manual "Sync" — just reads whatever snapshot is currently frozen there. See
 * `maybeRefreshFlagLists()` below for the generation logic itself.
 *
 * Returns:
 *   reds/orangeFlag  – read from frozen Blobs snapshots (see header notes above)
 *   fringe           – visited W1, segmented by count (atRisk/engaged)
 *                       each client carries: sessionsThisWeek, trend, service, isFullyUtilising
 *   noShows          – clients with unsigned bookings in W1 window
 *   suspensions      – clients with active SuspensionInfo or hold-type status
 *                       (excludes Terminated, Expired, Non Member)
 */
import { getBlobStore } from './utils/blob-store.js';
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import { subDays, addDays, endOfDay, format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

// Runs every hour so the 1am-Sydney check below stays correct across DST
// transitions (a fixed UTC cron time would drift by an hour twice a year).
export const config = {
  schedule: '0 * * * *',
};

const BATCH = 40; // raised from 15 - classvisits calls are the real bottleneck on real data volume

// Statuses that are NOT a suspension — exclude from suspensions list
// 'declined' is handled separately under finances
const EXCLUDED_SUSPENSION_STATUSES = new Set([
  'active', 'terminated', 'expired', 'non member', 'non-member', 'declined',
]);

// ─── Red Flag List / Orange Flag List — memberships + Netlify Blobs storage ───

const FLAG_STORE = 'flag-lists';
const RED_KEY    = 'red-flag-snapshot';
const ORANGE_KEY = 'orange-flag-snapshot';

// Only these 4 membership categories are eligible for either flag list.
// Real Mindbody contract names carry pricing/formatting noise the spec names
// don't — e.g. "G3 Unlimited Membership| $69.95 Weekly" or "G3 3 x Sessions
// Per Week | $57.95 Weekly" — so classification is by keyword, not literal
// string equality. Anything else, including any "x2"/"2x sessions" pass,
// returns null and is excluded.

// Safety cap on how many zero-visit clients we run contract lookups for in a
// single generation run (1 API call each) — generous, but bounded.
const FLAG_MAX_CONTRACT_LOOKUPS = 500;

function classifyMembership(rawName) {
  const n = String(rawName || '').toLowerCase();

  // "G3 3 x Sessions Per Week" / "G3 3x Sessions Per Week" (either spacing)
  if (/3\s*x\s*sessions?\s*per\s*week/.test(n)) {
    return 'G3 3x Sessions Per Week';
  }

  // Unlimited memberships, distinguished by billing frequency
  if (n.includes('unlimited')) {
    if (n.includes('weekly'))      return 'Unlimited Membership - Weekly';
    if (n.includes('fortnightly')) return 'Unlimited Class Pass - Fortnightly';
    if (n.includes('monthly'))     return 'Unlimited Class Pass - Monthly';
  }

  return null;
}

// Active, non-suspended, non-cancelled members only.
function isEligibleMember(c) {
  if (!c) return false;
  if ((c.status || '').toLowerCase() !== 'active') return false;
  // Mindbody always returns a SuspensionInfo object for active clients, even
  // when not suspended (e.g. {BookingSuspended:false, ...}) — only the
  // BookingSuspended flag itself indicates an actual, current suspension.
  if (c.suspensionInfo?.BookingSuspended === true) return false;
  return true;
}

async function getClientContractsList(token, clientId) {
  try {
    const data = await mbGet('/client/clientcontracts', token, { clientId, Limit: 50 });
    return data.ClientContracts || data.Contracts || [];
  } catch {
    return [];
  }
}

function contractName(c = {}) {
  return (
    c.ContractName || c.contractName ||
    c.Name         || c.name         ||
    c.ContractDescription || c.contractDescription ||
    c.Description  || c.description ||
    ''
  );
}

function contractStartDate(c = {}) {
  const raw =
    c.StartDate       || c.startDate       ||
    c.AgreementDate   || c.agreementDate   ||
    c.ActiveDate      || c.activeDate      ||
    c.OriginationDate || c.originationDate ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function contractEndDate(c = {}) {
  const raw = c.ExpirationDate || c.expirationDate || c.EndDate || c.endDate || null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// Picks the contract that's currently active as of `asOf`; falls back to the
// most recently started contract if none cleanly straddle that date.
function currentMembershipName(contracts, asOf) {
  let active = null;
  for (const c of contracts) {
    const start = contractStartDate(c);
    const end   = contractEndDate(c);
    if (start && start > asOf) continue;
    if (end && end < asOf) continue;
    if (!active || (start && (!active.start || start > active.start))) {
      active = { start, name: contractName(c) };
    }
  }
  if (active) return active.name;

  let latest = null;
  for (const c of contracts) {
    const start = contractStartDate(c);
    if (!latest || (start && (!latest.start || start > latest.start))) {
      latest = { start, name: contractName(c) };
    }
  }
  return latest ? latest.name : '';
}

async function readFlagSnapshot(key) {
  try {
    const store = getBlobStore(FLAG_STORE);
    const raw   = await store.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeFlagSnapshot(key, snapshot) {
  try {
    const store = getBlobStore(FLAG_STORE);
    await store.set(key, JSON.stringify(snapshot));
  } catch (e) {
    console.error(`[mb-client-analytics] Failed to persist ${key}:`, e.message);
  }
}

// ─── Sydney time helpers ────────────────────────────────────────────────────
// Only "now" (the instant the function runs) needs real timezone conversion —
// Intl handles AEST/AEDT automatically. Window boundaries are then built from
// plain calendar-day arithmetic (safe across DST) and rendered the same
// UTC-as-wall-clock way the rest of this file already uses.

const WEEKDAY_NUM = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function sydneyNow(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    year:    Number(parts.year),
    month:   Number(parts.month),
    day:     Number(parts.day),
    hour:    Number(parts.hour === '24' ? '0' : parts.hour),
    minute:  Number(parts.minute),
    weekday: parts.weekday, // 'Mon' | 'Tue' | ... | 'Sun'
  };
}

function calShift(year, month, day, deltaDays) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dateAt(y, m, d, hh = 0, mm = 0, ss = 0) {
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
}

function dateKey(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Red Flag window = the most recently completed Monday–Sunday, Sydney time.
function computeRedFlagWindow(now = new Date()) {
  const p = sydneyNow(now);
  const wd = WEEKDAY_NUM[p.weekday];
  const thisMonday = calShift(p.year, p.month, p.day, -(wd - 1));
  const lastMonday = calShift(thisMonday.year, thisMonday.month, thisMonday.day, -7);
  const lastSunday = calShift(thisMonday.year, thisMonday.month, thisMonday.day, -1);
  const nextMonday = calShift(thisMonday.year, thisMonday.month, thisMonday.day, 7);
  return {
    key:         dateKey(lastMonday.year, lastMonday.month, lastMonday.day),
    windowStart: dateAt(lastMonday.year, lastMonday.month, lastMonday.day, 0, 0, 0),
    windowEnd:   dateAt(lastSunday.year, lastSunday.month, lastSunday.day, 23, 59, 59),
    nextRefresh: dateAt(nextMonday.year, nextMonday.month, nextMonday.day, 1, 0, 0),
  };
}

// Orange Flag window = the previous 2 full days, Sydney time
// (e.g. a Wednesday 1am run covers Monday + Tuesday).
function computeOrangeFlagWindow(now = new Date()) {
  const p = sydneyNow(now);
  const dayBefore = calShift(p.year, p.month, p.day, -2);
  const yesterday = calShift(p.year, p.month, p.day, -1);
  const tomorrow  = calShift(p.year, p.month, p.day, 1);
  return {
    key:         dateKey(p.year, p.month, p.day),
    windowStart: dateAt(dayBefore.year, dayBefore.month, dayBefore.day, 0, 0, 0),
    windowEnd:   dateAt(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59),
    nextRefresh: dateAt(tomorrow.year, tomorrow.month, tomorrow.day, 1, 0, 0),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getClasses(token, startStr, endStr) {
  let all = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, {
      StartDateTime: startStr,
      EndDateTime: endStr,
      Limit: 200,
      Offset: offset,
    });
    const classes = (data.Classes || []).filter((c) => (c.TotalBooked || 0) > 0);
    all = all.concat(classes);
    if ((data.Classes || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getVisits(token, classId) {
  try {
    const data = await mbGet('/class/classvisits', token, { ClassID: classId });
    return data.Class?.Visits || [];
  } catch {
    return [];
  }
}

// Fetch active contracts for a client and return the soonest future resume date
async function getContractResumeDate(token, clientId) {
  try {
    const data = await mbGet('/client/clientcontracts', token, { clientId, Limit: 20 });
    const contracts = data.ClientContracts || data.Contracts || [];
    let earliest = null;
    for (const c of contracts) {
      // Try all field name variants MB might use
      const raw =
        c.ResumeDate    || c.resumeDate    ||
        c.SuspendedUntil|| c.suspendedUntil||
        c.HoldEndDate   || c.holdEndDate   ||
        c.EndSuspension || c.endSuspension ||
        null;
      if (!raw) continue;
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      if (!earliest || d < earliest) earliest = d;
    }
    // Log the full contract array once so we can see the actual field names
    if (contracts.length > 0) {
      console.log(`[mb-analytics] contract sample for ${clientId}:`, JSON.stringify(contracts[0]));
    }
    return earliest;
  } catch {
    return null;
  }
}

async function getAllClients(token) {
  const map = {};
  let offset = 0;
  while (true) {
    const data = await mbGet('/client/clients', token, {
      ActiveOnly: false,
      Limit: 200,
      Offset: offset,
    });
    const clients = data.Clients || [];
    for (const c of clients) {
      map[String(c.Id)] = {
        id:             String(c.Id),
        name:           `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
        email:          c.Email || '',
        phone:          formatPhone(c.MobilePhone || c.HomePhone),
        status:         c.Status || 'Active',
        suspensionInfo: c.SuspensionInfo || null,
        active:         c.Active !== false,
      };
    }
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return map;
}

function trend(w1, w2, w3, w4) {
  const prevWeeks = [w2, w3, w4];
  const nonZero   = prevWeeks.filter((w) => w > 0);
  if (!nonZero.length) return { avg: 0, direction: 'new' };
  const avg     = prevWeeks.reduce((s, w) => s + w, 0) / 3;
  const rounded = Math.round(avg * 10) / 10;
  if (w1 > avg + 0.4) return { avg: rounded, direction: 'up' };
  if (w1 < avg - 0.4) return { avg: rounded, direction: 'down' };
  return { avg: rounded, direction: 'stable' };
}

// ─── Red Flag List / Orange Flag List generation ───────────────────────────

async function fetchVisitedSet(token, windowStart, windowEnd) {
  const startStr = format(windowStart, "yyyy-MM-dd'T'00:00:00");
  const endStr   = format(windowEnd,   "yyyy-MM-dd'T'23:59:59");
  const classes  = await getClasses(token, startStr, endStr);
  const visited  = new Set();
  for (let i = 0; i < classes.length; i += BATCH) {
    const batch   = classes.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((cls) => getVisits(token, cls.Id)));
    results.forEach((r) => {
      if (r.status !== 'fulfilled') return;
      for (const visit of r.value) {
        if (visit.SignedIn === true && !visit.LateCancelled) {
          const id = String(visit.ClientId || '');
          if (id) visited.add(id);
        }
      }
    });
  }
  return visited;
}

// Shared generator for both lists — the only difference between Red and
// Orange is which window is passed in.
async function generateFlagList(token, windowInfo) {
  const { windowStart, windowEnd, nextRefresh, key } = windowInfo;

  const [clientMap, visitedSet] = await Promise.all([
    getAllClients(token),
    fetchVisitedSet(token, windowStart, windowEnd),
  ]);

  // Zero signed-in visits in the window + still an active, non-suspended member.
  const zeroVisitEligible = Object.values(clientMap).filter(
    (c) => isEligibleMember(c) && !visitedSet.has(c.id)
  );

  const capped  = zeroVisitEligible.slice(0, FLAG_MAX_CONTRACT_LOOKUPS);
  const asOf    = new Date();
  const clients = [];

  for (let i = 0; i < capped.length; i += BATCH) {
    const batch   = capped.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((c) => getClientContractsList(token, c.id)));
    batch.forEach((c, idx) => {
      const contracts     = results[idx].status === 'fulfilled' ? results[idx].value : [];
      const rawMembership = currentMembershipName(contracts, asOf);
      const membership    = classifyMembership(rawMembership);
      if (!membership) return; // only the 4 allowed membership categories qualify
      clients.push({
        id:         c.id,
        name:       c.name,
        email:      c.email,
        phone:      c.phone,
        membership,
      });
    });
  }

  clients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return {
    key,
    windowStart: windowStart.toISOString(),
    windowEnd:   windowEnd.toISOString(),
    generatedAt: new Date().toISOString(),
    nextRefresh: nextRefresh.toISOString(),
    clients,
  };
}

// Called on every hourly scheduled invocation; only actually regenerates
// anything during the 1am-Sydney hour, and only once per due cycle (guarded
// by comparing the stored snapshot's `key` to the freshly computed window's
// `key`, so a retry within the same hour is a no-op).
async function maybeRefreshFlagLists(token) {
  const now = new Date();
  const p   = sydneyNow(now);
  if (p.hour !== 1) return;

  // Orange Flag List — every morning.
  const orangeWindow   = computeOrangeFlagWindow(now);
  const existingOrange = await readFlagSnapshot(ORANGE_KEY);
  if (existingOrange?.key !== orangeWindow.key) {
    const snapshot = await generateFlagList(token, orangeWindow);
    await writeFlagSnapshot(ORANGE_KEY, snapshot);
    console.log(`[mb-client-analytics] Orange Flag List regenerated for ${orangeWindow.key} (${snapshot.clients.length} clients)`);
  }

  // Red Flag List — Mondays only.
  if (p.weekday === 'Mon') {
    const redWindow   = computeRedFlagWindow(now);
    const existingRed = await readFlagSnapshot(RED_KEY);
    if (existingRed?.key !== redWindow.key) {
      const snapshot = await generateFlagList(token, redWindow);
      await writeFlagSnapshot(RED_KEY, snapshot);
      console.log(`[mb-client-analytics] Red Flag List regenerated for ${redWindow.key} (${snapshot.clients.length} clients)`);
    }
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();

    // Netlify's scheduler invokes this function via POST. Do only the
    // Red/Orange Flag List check-and-regenerate here, and nothing else —
    // every other metric on this dashboard is unaffected by this branch.
    if (event.httpMethod === 'POST') {
      await maybeRefreshFlagLists(token);
      return ok({ scheduled: true, checkedAt: new Date().toISOString() });
    }

    // Manual test trigger — e.g. GET /api/mb-client-analytics?forceFlags=both
    // Bypasses the 1am/Monday schedule so the lists can be spot-checked without
    // waiting for the next real run. Normal page loads never send this param,
    // so day-to-day behaviour (frozen snapshots, untouched by Sync) is unchanged.
    const forceFlags = event.queryStringParameters?.forceFlags;
    if (forceFlags === 'red' || forceFlags === 'both') {
      await writeFlagSnapshot(RED_KEY, await generateFlagList(token, computeRedFlagWindow()));
    }
    if (forceFlags === 'orange' || forceFlags === 'both') {
      await writeFlagSnapshot(ORANGE_KEY, await generateFlagList(token, computeOrangeFlagWindow()));
    }

    const now    = new Date();
    const period = event.queryStringParameters?.period || '7days';

    // ── W1 window (period-driven — drives fringe, no-shows and stats) ──────
    let w1Start, w1End;
    if (period === 'calendarWeek') {
      w1Start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      w1End   = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 1 });
    } else {
      // default: rolling last 7 days, ending yesterday (today excluded)
      w1Start = subDays(now, 7);
      w1End   = endOfDay(subDays(now, 1)); // 23:59:59.999 yesterday
    }

    // ── W2–W4 boundaries (7-day buckets going back from w1Start) ───────────
    const b14 = subDays(w1Start, 7);
    const b21 = subDays(w1Start, 14);
    const b28 = subDays(w1Start, 21);

    const startStr = format(b28,  "yyyy-MM-dd'T'00:00:00");
    const endStr   = format(w1End, "yyyy-MM-dd'T'23:59:59");

    const allClasses = await getClasses(token, startStr, endStr);

    // Per-client data structures
    const weeks         = {};  // id → { w1, w2, w3, w4 }  (period-driven buckets)
    const services      = {};  // id → most-recent service name
    const noShowMap     = {};  // id → [{ className, day, time, staffName }]
    const lastVisitDate = {};  // id → most recent signed-in Date

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch   = allClasses.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map((cls) => getVisits(token, cls.Id)));

      batch.forEach((cls, idx) => {
        if (results[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);

        // Determine week bucket (period-driven windows)
        const inW1 = classDate >= w1Start && classDate <= w1End;
        const inW2 = !inW1 && classDate > b14  && classDate <= w1End;
        const inW3 = !inW1 && !inW2 && classDate > b21 && classDate <= w1End;
        const inW4 = !inW1 && !inW2 && !inW3 && classDate > b28 && classDate <= w1End;

        for (const visit of results[idx].value) {
          const id = String(visit.ClientId || '');
          if (!id) continue;

          if (!weeks[id]) weeks[id] = { w1: 0, w2: 0, w3: 0, w4: 0 };

          if (visit.SignedIn === true && !visit.LateCancelled) {
            if (inW1) weeks[id].w1++;
            if (inW2) weeks[id].w2++;
            if (inW3) weeks[id].w3++;
            if (inW4) weeks[id].w4++;

            // Track the most recent service name (W1 priority)
            if (inW1 && visit.ServiceName) services[id] = visit.ServiceName;
            else if (!services[id] && visit.ServiceName) services[id] = visit.ServiceName;

            // Track most recent signed-in visit date across all windows
            if (!lastVisitDate[id] || classDate > lastVisitDate[id]) {
              lastVisitDate[id] = classDate;
            }
          }

          // No-show: booked but didn't sign in (W1 window)
          if (inW1 && visit.SignedIn === false && !visit.LateCancelled) {
            if (!noShowMap[id]) noShowMap[id] = [];
            noShowMap[id].push({
              className: cls.ClassDescription?.Name || cls.Name || 'Class',
              day:       format(classDate, 'EEE d MMM'),
              time:      format(classDate, 'h:mm a'),
              staffName: `${cls.Staff?.FirstName || ''} ${cls.Staff?.LastName || ''}`.trim(),
            });
          }
        }
      });
    }

    // Fetch all clients for enrichment
    const clientMap = await getAllClients(token);

    function enrichClient(id, extra = {}, weekSource = weeks) {
      const c   = clientMap[id] || { id, name: `Client ${id}`, email: '', phone: '' };
      const svc = services[id] || '';
      const w   = weekSource[id] || { w1: 0, w2: 0, w3: 0, w4: 0 };
      const t   = trend(w.w1, w.w2, w.w3, w.w4);
      const is2x        = svc.toLowerCase().includes('2x');
      const isFullyUtil = is2x && (extra.sessionsThisWeek ?? w.w1) >= 2;
      const lastDate          = lastVisitDate[id] ? format(lastVisitDate[id], 'yyyy-MM-dd') : null;
      const weeklyAttendance  = { w1: w.w1, w2: w.w2, w3: w.w3, w4: w.w4 };
      // `membership` is an alias of `service` (the most recent booked service /
      // package name) so lists can label it as the client's membership.
      return { ...c, service: svc, membership: svc, trend: t, is2xMember: is2x, isFullyUtilising: isFullyUtil, lastSessionDate: lastDate, weeklyAttendance, ...extra };
    }

    // Existing period-driven W1 sets (fringe / stats)
    const visitedW1 = new Set(Object.keys(weeks).filter((id) => weeks[id].w1 > 0));

    // Fringe (visited W1): atRisk = 1–2, engaged = 3+
    const byCount = (min, max) =>
      [...visitedW1]
        .filter((id) => { const c = weeks[id].w1; return c >= min && c <= max; })
        .map((id) => enrichClient(id, { sessionsThisWeek: weeks[id].w1 }));

    const atRisk  = byCount(1, 2);
    const engaged = byCount(3, 99);

    const fringeSegments = {
      atRisk:  { count: atRisk.length,  clients: atRisk.slice(0, 50)  },
      engaged: { count: engaged.length, clients: engaged.slice(0, 50) },
    };

    // No-shows
    const noShows = Object.entries(noShowMap)
      .map(([id, sessions]) => ({ ...enrichClient(id), noShowCount: sessions.length, sessions }))
      .sort((a, b) => b.noShowCount - a.noShowCount)
      .slice(0, 50);

    // Suspensions — only include actual holds/suspensions
    // Excludes: Active, Terminated, Expired, Non Member, Declined (Declined goes to Finances)
    const rawSuspensions = Object.values(clientMap)
      .filter((c) => {
        const statusLower = (c.status || '').toLowerCase();
        if (EXCLUDED_SUSPENSION_STATUSES.has(statusLower)) return false;
        if (c.suspensionInfo && Object.keys(c.suspensionInfo).length > 0) return true;
        if (c.status && c.status !== 'Active') return true;
        return false;
      })
      .slice(0, 50);

    // Log suspension info structure so we can see what MB actually returns
    if (rawSuspensions.length > 0) {
      console.log('[mb-analytics] suspensionInfo sample:', JSON.stringify(rawSuspensions[0].suspensionInfo));
    }

    // Fetch resume dates from client contracts (suspension dates live on contracts, not client profiles)
    const contractResumes = await Promise.allSettled(
      rawSuspensions.map((c) => getContractResumeDate(token, c.id))
    );

    const suspensions = rawSuspensions.map((c, i) => {
      const contractResume = contractResumes[i].status === 'fulfilled' ? contractResumes[i].value : null;

      // Also check the SuspensionInfo on the client object for dates
      const info = c.suspensionInfo || {};
      const infoResume =
        info.ResumeDate    || info.resumeDate    ||
        info.EndDate       || info.endDate       ||
        info.SuspensionEnd || info.suspensionEnd ||
        null;

      // Prefer the contract resume date; fall back to client-level SuspensionInfo date
      const resumeDate = contractResume
        ? contractResume.toISOString()
        : infoResume || null;

      return {
        id:             c.id,
        name:           c.name,
        email:          c.email,
        phone:          c.phone,
        status:         c.status,
        suspensionInfo: c.suspensionInfo,
        resumeDate,     // ISO string or null
      };
    });

    // Declined clients — payment-declined status, shown under Finances
    const declinedClients = Object.values(clientMap)
      .filter((c) => (c.status || '').toLowerCase() === 'declined')
      .map((c) => ({
        id:     c.id,
        name:   c.name,
        email:  c.email,
        phone:  c.phone,
        status: c.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 100);

    // Red Flag List / Orange Flag List — read whatever is currently frozen in
    // Blobs. Never (re)computed on this live path, so a manual Sync or page
    // load never changes these two lists.
    const [redSnap, orangeSnap] = await Promise.all([
      readFlagSnapshot(RED_KEY),
      readFlagSnapshot(ORANGE_KEY),
    ]);

    return ok({
      period,
      reds:           redSnap?.clients    || [],
      orangeFlag:     orangeSnap?.clients || [],
      fringeSegments,
      noShows,
      suspensions,
      declinedClients,
      redsWindow: redSnap ? {
        start:       redSnap.windowStart,
        end:         redSnap.windowEnd,
        generatedAt: redSnap.generatedAt,
        nextRefresh: redSnap.nextRefresh,
      } : null,
      orangeFlagWindow: orangeSnap ? {
        start:       orangeSnap.windowStart,
        end:         orangeSnap.windowEnd,
        generatedAt: orangeSnap.generatedAt,
        nextRefresh: orangeSnap.nextRefresh,
      } : null,
      summary: {
        redsCount:        redSnap?.clients?.length    || 0,
        orangeFlagCount:  orangeSnap?.clients?.length  || 0,
        visitedThisWeek:  visitedW1.size,
        noShowCount:      noShows.length,
        suspensionCount:  suspensions.length,
        declinedCount:    declinedClients.length,
        totalTracked:     Object.keys(weeks).length,
      },
    });
  } catch (e) {
    console.error('mb-client-analytics:', e);
    return err(e.message);
  }
};