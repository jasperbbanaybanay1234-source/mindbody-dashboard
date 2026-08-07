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
import { getBlobStore } from './utils/blob-store.js';
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';

const WINDOW_DAYS = 30;

// Milestones need one Mindbody call PER active client to get a lifetime visit
// count, which is too slow to compute inside a normal, HTTP-triggered function
// (30+ seconds on a few hundred members — reliably times out). So this data is
// instead computed once a night by scheduled-daily-refresh.js and cached in the
// same Netlify Blobs store the rest of the dashboard's snapshot uses. This
// function just reads it back out. See scheduled-daily-refresh.js for the
// actual computation.
async function getCachedMilestones() {
  try {
    const store = getBlobStore('dashboard-cache');
    const raw   = await store.get('dashboard-snapshot');
    if (!raw) return [];
    const snapshot = JSON.parse(raw);
    return snapshot.milestones || [];
  } catch {
    return [];
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

    // ── Session-count milestones ─────────────────────────────────────────────
    // Read from last night's cached snapshot instead of computed live — see
    // getCachedMilestones() above for why.
    const milestones = await getCachedMilestones();

    return ok({ birthdaysActive, birthdaysInactive, anniversaries, milestones });
  } catch (e) {
    console.error('mb-celebrations:', e);
    return err(e.message);
  }
};
