/**
 * Scheduled daily cache refresh — runs at 2:00 PM UTC = midnight AEST (Sydney standard time).
 * During daylight saving (AEDT, UTC+11) this fires at 1 AM Sydney — close enough.
 *
 * Calls Mindbody directly (same logic as the individual endpoints) rather than
 * HTTP-calling the other functions, which would create a timeout chain.
 */
import { getBlobStore } from './utils/blob-store.js';
import { getStaffToken, mbGet } from './utils/mb-auth.js';
import {
  subDays, format, parseISO,
  startOfWeek, endOfWeek, subWeeks,
  startOfMonth, endOfMonth, subMonths,
  eachDayOfInterval,
} from 'date-fns';

export const config = {
  schedule: '0 14 * * *',  // 2pm UTC = midnight Sydney (AEST)
};

// ─── Minimal versions of each data fetch ───────────────────────────────────

async function fetchAttendance(token) {
  const now   = new Date();
  const start = subDays(now, 6);
  const startStr = format(start, "yyyy-MM-dd'T'00:00:00");
  const endStr   = format(now,   "yyyy-MM-dd'T'23:59:59");

  let allClasses = [], offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, { StartDateTime: startStr, EndDateTime: endStr, Limit: 200, Offset: offset });
    allClasses = allClasses.concat(data.Classes || []);
    if ((data.Classes || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }

  const byDate = {}, byDow = {};
  for (const cls of allClasses) {
    if (!cls.StartDateTime) continue;
    const d = parseISO(cls.StartDateTime);
    byDate[format(d, 'yyyy-MM-dd')] = (byDate[format(d, 'yyyy-MM-dd')] || 0) + (cls.TotalBooked || 0);
    byDow[format(d, 'EEE')]         = (byDow[format(d, 'EEE')]         || 0) + (cls.TotalBooked || 0);
  }

  const days  = eachDayOfInterval({ start, end: now });
  const daily = days.map((d) => ({ date: format(d, 'yyyy-MM-dd'), label: format(d, 'MMM d'), visits: byDate[format(d, 'yyyy-MM-dd')] || 0 }));
  const total = daily.reduce((s, d) => s + d.visits, 0);
  const peak  = daily.reduce((m, d) => d.visits > m.visits ? d : m, { visits: 0, label: '–' });

  return {
    period: '7days', daily,
    byDow: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => ({ day, visits: byDow[day] || 0 })),
    stats: { total7: total, avgDaily: Math.round(total / daily.length), peakDay: peak.label, peakVisits: peak.visits, dateRange: `${format(start,'dd MMM')} – ${format(now,'dd MMM yyyy')}` },
  };
}

async function fetchRevenue(token) {
  const now = new Date();
  const periods = {
    thisWeek:  { start: startOfWeek(now, { weekStartsOn: 1 }), end: now },
    lastWeek:  { start: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), end: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) },
    thisMonth: { start: startOfMonth(now), end: now },
    lastMonth: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
  };

  let allSales = [], offset = 0;
  const fetchStart = format(periods.lastMonth.start, "yyyy-MM-dd'T'00:00:00");
  const fetchEnd   = format(now, "yyyy-MM-dd'T'23:59:59");
  while (true) {
    const data = await mbGet('/sale/sales', token, { StartSaleDateTime: fetchStart, EndSaleDateTime: fetchEnd, Limit: 200, Offset: offset });
    allSales = allSales.concat(data.Sales || []);
    if ((data.Sales || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }

  const totals = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };
  const counts = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };
  for (const sale of allSales) {
    if (!sale.SaleDate) continue;
    const amount = (sale.PurchasedItems || []).reduce((s, i) => i.Returned ? s : s + (i.TotalAmount || 0), 0);
    if (amount <= 0) continue;
    for (const [key, range] of Object.entries(periods)) {
      const d = parseISO(sale.SaleDate);
      if (d >= range.start && d <= range.end) { totals[key] += amount; counts[key]++; }
    }
  }
  const r = (n) => Math.round(n * 100) / 100;
  return {
    thisWeek:  { total: r(totals.thisWeek),  count: counts.thisWeek  },
    lastWeek:  { total: r(totals.lastWeek),  count: counts.lastWeek  },
    thisMonth: { total: r(totals.thisMonth), count: counts.thisMonth },
    lastMonth: { total: r(totals.lastMonth), count: counts.lastMonth },
  };
}

// ─── Session milestones (moved here from mb-celebrations.js) ───────────────
// This needs one Mindbody call per active client, which is too slow to run
// inside a normal HTTP-triggered function (see mb-celebrations.js note) — so
// it's computed here, in the scheduled/background function, and cached.
const MILESTONES          = Array.from({ length: 20 }, (_, i) => (i + 1) * 50);
const MILESTONE_BUFFER    = 1; // tightened for easy live spot-checking (was 10)
const MILESTONE_MAX_CLIENTS = 800;
const LIFETIME_START      = '2000-01-01';
const MILESTONE_BATCH     = 15;

function nextMilestone(total) {
  for (const m of MILESTONES) if (total <= m) return m;
  return null;
}

async function getLifetimeVisitCount(token, clientId, endDate) {
  try {
    const data = await mbGet('/client/clientvisits', token, {
      clientId, startDate: LIFETIME_START, endDate, limit: 1, offset: 0,
    });
    const total = data?.PaginationResponse?.TotalResults;
    if (typeof total === 'number') return total;
    return (data?.Visits || []).length;
  } catch {
    return null;
  }
}

async function fetchMilestones(token) {
  let allClients = [], offset = 0;
  while (true) {
    const data = await mbGet('/client/clients', token, { ActiveOnly: true, Limit: 200, Offset: offset });
    const clients = data.Clients || [];
    allClients = allClients.concat(clients);
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }

  const candidates = allClients.slice(0, MILESTONE_MAX_CLIENTS).map((c) => ({
    id:    String(c.Id),
    name:  `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
    email: c.Email || '',
    phone: c.MobilePhone || c.HomePhone || '',
  }));

  const endDate   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const milestones = [];

  for (let i = 0; i < candidates.length; i += MILESTONE_BATCH) {
    const batch   = candidates.slice(i, i + MILESTONE_BATCH);
    const results = await Promise.allSettled(batch.map((c) => getLifetimeVisitCount(token, c.id, endDate)));
    batch.forEach((c, idx) => {
      const total = results[idx].status === 'fulfilled' ? results[idx].value : null;
      if (total === null || total === undefined) return;
      const milestone = nextMilestone(total);
      if (milestone === null) return;
      const sessionsAway = milestone - total;
      if (sessionsAway < 0 || sessionsAway > MILESTONE_BUFFER) return;
      milestones.push({ id: c.id, name: c.name, email: c.email, phone: c.phone, totalSessions: total, milestone, sessionsAway });
    });
  }

  milestones.sort((a, b) => a.sessionsAway - b.sessionsAway || a.name.localeCompare(b.name));
  return milestones;
}

const BASE_URL = process.env.URL || 'http://localhost:8888';

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async () => {
  console.log('[scheduled-daily-refresh] Starting at', new Date().toISOString());
  try {
    const token = await getStaffToken();
    const store = getBlobStore('dashboard-cache');

    // Read yesterday's snapshot first so a single failed fetch tonight
    // doesn't wipe out otherwise-good cached data for that section.
    const prevRaw = await store.get('dashboard-snapshot');
    const prev    = prevRaw ? JSON.parse(prevRaw) : {};

    // Attendance + revenue: fetched inline (simpler logic, avoids HTTP chain)
    // clientAnalytics + payments: delegate to their own endpoints (complex N+1 logic)
    // milestones: computed inline too (see fetchMilestones above) — an HTTP
    // delegate to mb-celebrations would hit the same per-client timeout risk.
    const [att, rev, ana, pay, mil] = await Promise.allSettled([
      fetchAttendance(token),
      fetchRevenue(token),
      fetch(`${BASE_URL}/api/mb-client-analytics`).then(r => r.json()),
      fetch(`${BASE_URL}/api/mb-payments`).then(r => r.json()),
      fetchMilestones(token),
    ]);

    const snapshot = {
      attendance:      att.status === 'fulfilled' ? att.value : (prev.attendance ?? null),
      revenue:         rev.status === 'fulfilled' ? rev.value : (prev.revenue ?? null),
      clientAnalytics: ana.status === 'fulfilled' ? ana.value : (prev.clientAnalytics ?? null),
      payments:        pay.status === 'fulfilled' ? pay.value : (prev.payments ?? null),
      milestones:      mil.status === 'fulfilled' ? mil.value : (prev.milestones ?? []),
      cachedAt:        new Date().toISOString(),
    };

    await store.set('dashboard-snapshot', JSON.stringify(snapshot));
    console.log(
      '[scheduled-daily-refresh] Done.',
      `att=${att.status} rev=${rev.status} ana=${ana.status} pay=${pay.status} mil=${mil.status}`,
    );
  } catch (e) {
    console.error('[scheduled-daily-refresh] Failed:', e.message);
  }
  return { statusCode: 200 };
};
