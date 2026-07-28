/**
 * GET /api/mb-celebrations
 *
 * Returns clients with birthdays or gym anniversaries in the next 30 days.
 *   birthdaysActive   – active members, sorted by days_until asc
 *   birthdaysInactive – lapsed/inactive members (conversation opportunity)
 *   anniversaries     – active members only, sorted by days_until asc
 *   milestones        – active members within 10 sessions of a lifetime
 *                       session-count milestone (50, 100, … 1000)
 */
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';

const WINDOW_DAYS = 30;

// ─── Session milestones ─────────────────────────────────────────────────────
// 50, 100, 150 … 1000
const MILESTONES = Array.from({ length: 20 }, (_, i) => (i + 1) * 50);

// "Approaching" = current total is within this many sessions below the milestone
const MILESTONE_BUFFER = 10;

// Parallelism for the per-client lifetime visit-count lookups
const BATCH = 15;

// Safety cap so an unusually large member base can't blow the function timeout
const MILESTONE_MAX_CLIENTS = 800;

// Earliest date we look back to when counting lifetime visits
const LIFETIME_START = '2000-01-01';

function nextMilestone(total) {
  for (const m of MILESTONES) if (total <= m) return m;
  return null;   // past 1000 — nothing left to chase
}

/**
 * Lifetime visit count for one client.
 *
 * Mindbody Public API v6 has no "total visits" field on /client/clients, so we
 * ask /client/clientvisits for a single record over an all-time date range and
 * read PaginationResponse.TotalResults — one cheap call per client.
 */
async function getLifetimeVisitCount(token, clientId, endDate) {
  try {
    const data = await mbGet('/client/clientvisits', token, {
      clientId,
      startDate: LIFETIME_START,
      endDate,
      limit:  1,
      offset: 0,
    });
    const total = data?.PaginationResponse?.TotalResults;
    if (typeof total === 'number') return total;
    return (data?.Visits || []).length;
  } catch {
    return null;
  }
}

function daysUntilNext(month, day) {
  const now  = new Date();
  const year = now.getFullYear();
  let next   = new Date(year, month - 1, day);
  if (next <= now) next = new Date(year + 1, month - 1, day);
  return Math.ceil((next - now) / (1000 * 60 * 60 * 24));
}

function fmtDate(month, day) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[month - 1]}`;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();

    // Fetch ALL clients (active + inactive) so we can segment birthdays
    let allClients = [];
    let offset = 0;
    while (true) {
      const data = await mbGet('/client/clients', token, {
        ActiveOnly: false,
        Limit:      200,
        Offset:     offset,
      });
      const clients = data.Clients || [];
      allClients = allClients.concat(clients);
      if (clients.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    const birthdaysActive   = [];
    const birthdaysInactive = [];
    const anniversaries     = [];
    const activeClients     = [];

    for (const c of allClients) {
      const name     = `${c.FirstName || ''} ${c.LastName || ''}`.trim();
      if (!name) continue;
      const isActive = c.Active !== false && (c.Status || '').toLowerCase() === 'active';

      if (isActive) {
        activeClients.push({
          id:    String(c.Id),
          name,
          email: c.Email || '',
          phone: formatPhone(c.MobilePhone || c.HomePhone),
        });
      }

      // ── Birthdays (all clients, segmented by active status) ───────────────
      if (c.BirthDate) {
        const bd = new Date(c.BirthDate);
        if (!isNaN(bd.getTime()) && bd.getFullYear() > 1900) {
          const month = bd.getMonth() + 1;
          const day   = bd.getDate();
          const days  = daysUntilNext(month, day);
          if (days <= WINDOW_DAYS) {
            const now      = new Date();
            const nextYear = new Date(now.getFullYear(), month - 1, day) <= now
              ? now.getFullYear() + 1
              : now.getFullYear();
            const entry = {
              id:        String(c.Id),
              name,
              email:     c.Email || '',
              phone:     c.MobilePhone || c.HomePhone || '',
              date:      fmtDate(month, day),
              daysUntil: days,
              age:       nextYear - bd.getFullYear(),
              isToday:   days === 0,
            };
            if (isActive) birthdaysActive.push(entry);
            else          birthdaysInactive.push(entry);
          }
        }
      }

      // ── Anniversaries (active clients only) ────────────────────────────────
      if (isActive && c.CreationDate) {
        const cd = new Date(c.CreationDate);
        if (!isNaN(cd.getTime())) {
          const month = cd.getMonth() + 1;
          const day   = cd.getDate();
          const days  = daysUntilNext(month, day);
          if (days <= WINDOW_DAYS) {
            const now      = new Date();
            const nextYear = new Date(now.getFullYear(), month - 1, day) <= now
              ? now.getFullYear() + 1
              : now.getFullYear();
            const years = nextYear - cd.getFullYear();
            if (years < 1) continue;
            anniversaries.push({
              id:        String(c.Id),
              name,
              email:     c.Email || '',
              phone:     c.MobilePhone || c.HomePhone || '',
              date:      fmtDate(month, day),
              daysUntil: days,
              years,
              isToday:   days === 0,
            });
          }
        }
      }
    }

    birthdaysActive.sort((a, b)   => a.daysUntil - b.daysUntil);
    birthdaysInactive.sort((a, b) => a.daysUntil - b.daysUntil);
    anniversaries.sort((a, b)     => a.daysUntil - b.daysUntil);

    // ── Session-count milestones (active clients only) ──────────────────────
    const endDate    = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const candidates = activeClients.slice(0, MILESTONE_MAX_CLIENTS);
    const milestones = [];

    console.log(`[mb-celebrations] Counting lifetime visits for ${candidates.length} active clients…`);

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch   = candidates.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((c) => getLifetimeVisitCount(token, c.id, endDate))
      );

      batch.forEach((c, idx) => {
        const total = results[idx].status === 'fulfilled' ? results[idx].value : null;
        if (total === null || total === undefined) return;

        const milestone = nextMilestone(total);
        if (milestone === null) return;

        const sessionsAway = milestone - total;
        if (sessionsAway < 0 || sessionsAway > MILESTONE_BUFFER) return;

        milestones.push({
          id:           c.id,
          name:         c.name,
          email:        c.email,
          phone:        c.phone,
          totalSessions: total,
          milestone,
          sessionsAway,
        });
      });
    }

    // Closest to their milestone first
    milestones.sort((a, b) => a.sessionsAway - b.sessionsAway || a.name.localeCompare(b.name));

    console.log(`[mb-celebrations] ${milestones.length} clients approaching a milestone`);

    return ok({ birthdaysActive, birthdaysInactive, anniversaries, milestones });
  } catch (e) {
    console.error('mb-celebrations:', e);
    return err(e.message);
  }
};
