/**
 * 28-day rolling window, split into 4 weekly buckets.
 * Supports ?period=7days (default) or ?period=calendarWeek (last Mon–Sun)
 *
 * Returns:
 *   reds        – visited W2–W4 but NOT W1 (Red's List = inactive + churning)
 *   fringe      – visited W1, segmented by count (atRisk/engaged)
 *                 each client carries: sessionsThisWeek, trend, service, isFullyUtilising
 *   noShows     – clients with unsigned bookings in W1 window
 *   suspensions – clients with active SuspensionInfo or hold-type status
 *                 (excludes Terminated, Expired, Non Member)
 */
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import { subDays, endOfDay, format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

const BATCH = 15;

// Statuses that are NOT a suspension — exclude from suspensions list
// 'declined' is handled separately under finances
const EXCLUDED_SUSPENSION_STATUSES = new Set([
  'active', 'terminated', 'expired', 'non member', 'non-member', 'declined',
]);

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

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token  = await getStaffToken();
    const now    = new Date();
    const period = event.queryStringParameters?.period || '7days';

    // ── W1 window ──────────────────────────────────────────────────────────
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

    const startStr = format(b28,   "yyyy-MM-dd'T'00:00:00");
    const endStr   = format(w1End, "yyyy-MM-dd'T'23:59:59");

    const allClasses = await getClasses(token, startStr, endStr);

    // Per-client data structures
    const weeks         = {};  // id → { w1, w2, w3, w4 }
    const services      = {};  // id → most-recent service name
    const noShowMap     = {};  // id → [{ className, day, time, staffName }]
    const lastVisitDate = {};  // id → most recent signed-in Date

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch   = allClasses.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map((cls) => getVisits(token, cls.Id)));

      batch.forEach((cls, idx) => {
        if (results[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);

        // Determine week bucket
        const inW1 = classDate >= w1Start && classDate <= w1End;
        const inW2 = !inW1 && classDate > b14;
        const inW3 = !inW1 && !inW2 && classDate > b21;
        const inW4 = !inW1 && !inW2 && !inW3 && classDate > b28;

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

    function enrichClient(id, extra = {}) {
      const c   = clientMap[id] || { id, name: `Client ${id}`, email: '', phone: '' };
      const svc = services[id] || '';
      const w   = weeks[id]   || { w1: 0, w2: 0, w3: 0, w4: 0 };
      const t   = trend(w.w1, w.w2, w.w3, w.w4);
      const is2x        = svc.toLowerCase().includes('2x');
      const isFullyUtil = is2x && (extra.sessionsThisWeek ?? w.w1) >= 2;
      const lastDate          = lastVisitDate[id] ? format(lastVisitDate[id], 'yyyy-MM-dd') : null;
      const weeklyAttendance  = { w1: w.w1, w2: w.w2, w3: w.w3, w4: w.w4 };
      return { ...c, service: svc, trend: t, is2xMember: is2x, isFullyUtilising: isFullyUtil, lastSessionDate: lastDate, weeklyAttendance, ...extra };
    }

    // Red's List: visited W2–W4 but NOT W1, active contract only, not suspended
    const visitedW1   = new Set(Object.keys(weeks).filter((id) => weeks[id].w1 > 0));
    const visitedPrev = new Set(
      Object.keys(weeks).filter((id) => weeks[id].w2 > 0 || weeks[id].w3 > 0 || weeks[id].w4 > 0)
    );
    const reds = [...visitedPrev]
      .filter((id) => !visitedW1.has(id))
      .filter((id) => {
        const c = clientMap[id];
        if (!c) return false;
        // Active contract members only
        if ((c.status || '').toLowerCase() !== 'active') return false;
        // Exclude anyone on a suspension / hold
        if (c.suspensionInfo && Object.keys(c.suspensionInfo).length > 0) return false;
        return true;
      })
      .map((id) => enrichClient(id, { sessionsThisWeek: 0 }))
      // Sort: most recently seen first → longest absent last
      .sort((a, b) => {
        if (!a.lastSessionDate && !b.lastSessionDate) return 0;
        if (!a.lastSessionDate) return 1;
        if (!b.lastSessionDate) return -1;
        return b.lastSessionDate.localeCompare(a.lastSessionDate);
      });

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

    return ok({
      period,
      reds:           reds.slice(0, 150),
      fringeSegments,
      noShows,
      suspensions,
      declinedClients,
      summary: {
        redsCount:        reds.length,
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
