/**
 * Scheduled daily cache refresh — runs at 2:00 PM UTC = midnight AEST (Sydney standard time).
 * During daylight saving (AEDT, UTC+11) this fires at 1 AM Sydney — close enough.
 *
 * Calls Mindbody directly (same logic as the individual endpoints) rather than
 * HTTP-calling the other functions, which would create a timeout chain.
 */
import { getStore } from '@netlify/blobs';
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

const BASE_URL = process.env.URL || 'http://localhost:8888';

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async () => {
  console.log('[scheduled-daily-refresh] Starting at', new Date().toISOString());
  try {
    const token = await getStaffToken();

    // Attendance + revenue: fetched inline (simpler logic, avoids HTTP chain)
    // clientAnalytics + payments: delegate to their own endpoints (complex N+1 logic)
    const [att, rev, ana, pay] = await Promise.allSettled([
      fetchAttendance(token),
      fetchRevenue(token),
      fetch(`${BASE_URL}/api/mb-client-analytics`).then(r => r.json()),
      fetch(`${BASE_URL}/api/mb-payments`).then(r => r.json()),
    ]);

    const snapshot = {
      attendance:      att.status === 'fulfilled' ? att.value : null,
      revenue:         rev.status === 'fulfilled' ? rev.value : null,
      clientAnalytics: ana.status === 'fulfilled' ? ana.value : null,
      payments:        pay.status === 'fulfilled' ? pay.value : null,
      cachedAt:        new Date().toISOString(),
    };

    const store = getStore('dashboard-cache');
    await store.set('dashboard-snapshot', JSON.stringify(snapshot));
    console.log(
      '[scheduled-daily-refresh] Done.',
      `att=${att.status} rev=${rev.status} ana=${ana.status} pay=${pay.status}`,
    );
  } catch (e) {
    console.error('[scheduled-daily-refresh] Failed:', e.message);
  }
  return { statusCode: 200 };
};
