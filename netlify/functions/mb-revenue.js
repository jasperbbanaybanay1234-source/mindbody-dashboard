/**
 * Revenue totals for 4 periods: this week, last week, this month, last month.
 * Uses /sale/sales and sums PurchasedItems[].TotalAmount (excluding returned items).
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import {
  format, parseISO,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  subMonths, subWeeks,
} from 'date-fns';

function inRange(dateStr, start, end) {
  try {
    const d = parseISO(dateStr);
    return d >= start && d <= end;
  } catch {
    return false;
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();

    const periods = {
      thisWeek:  { start: startOfWeek(now, { weekStartsOn: 1 }),           end: now },
      lastWeek:  { start: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), end: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) },
      thisMonth: { start: startOfMonth(now),                                end: now },
      lastMonth: { start: startOfMonth(subMonths(now, 1)),                  end: endOfMonth(subMonths(now, 1)) },
    };

    // Fetch from start of last month to now (covers all 4 periods)
    const fetchStart = format(periods.lastMonth.start, "yyyy-MM-dd'T'00:00:00");
    const fetchEnd   = format(now, "yyyy-MM-dd'T'23:59:59");

    let allSales = [];
    let offset = 0;
    while (true) {
      const data = await mbGet('/sale/sales', token, {
        StartSaleDateTime: fetchStart,
        EndSaleDateTime:   fetchEnd,
        Limit: 200,
        Offset: offset,
      });
      const sales = data.Sales || [];
      allSales = allSales.concat(sales);
      if (sales.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    const totals = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };
    const counts = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };

    for (const sale of allSales) {
      if (!sale.SaleDate) continue;

      // Sum non-returned line items
      const amount = (sale.PurchasedItems || []).reduce((sum, item) => {
        if (item.Returned) return sum;
        return sum + (item.TotalAmount || 0);
      }, 0);
      if (amount <= 0) continue;

      for (const [key, range] of Object.entries(periods)) {
        if (inRange(sale.SaleDate, range.start, range.end)) {
          totals[key] += amount;
          counts[key]++;
        }
      }
    }

    const round2 = (n) => Math.round(n * 100) / 100;

    return ok({
      thisWeek:  { total: round2(totals.thisWeek),  count: counts.thisWeek  },
      lastWeek:  { total: round2(totals.lastWeek),  count: counts.lastWeek  },
      thisMonth: { total: round2(totals.thisMonth), count: counts.thisMonth },
      lastMonth: { total: round2(totals.lastMonth), count: counts.lastMonth },
    });
  } catch (e) {
    console.error('mb-revenue:', e);
    return err(e.message);
  }
};
