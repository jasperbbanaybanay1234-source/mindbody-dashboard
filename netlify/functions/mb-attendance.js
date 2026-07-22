import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import {
  subDays, format, parseISO,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  subMonths, subWeeks,
  eachDayOfInterval,
} from 'date-fns';

/**
 * Supported period values (passed as ?period=xxx):
 *   7days         – rolling last 7 days (default)
 *   calendarWeek  – Mon–Sun of last calendar week
 *   lastMonth     – 1st–last of previous month
 *   weekToDate    – Monday of current week → today
 *   monthToDate   – 1st of current month → today
 */
function getDateRange(period) {
  const now = new Date();
  switch (period) {
    case 'calendarWeek': {
      const s = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const e = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 1 });
      return { start: s, end: e };
    }
    case 'lastMonth': {
      return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    }
    case 'weekToDate': {
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
    }
    case 'monthToDate': {
      return { start: startOfMonth(now), end: now };
    }
    case '7days':
    default:
      return { start: subDays(now, 6), end: now };
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const period = event.queryStringParameters?.period || '7days';
    const { start, end } = getDateRange(period);

    const token = await getStaffToken();

    const startStr = format(start, "yyyy-MM-dd'T'00:00:00");
    const endStr   = format(end,   "yyyy-MM-dd'T'23:59:59");

    // Paginate all classes in range
    let allClasses = [];
    let offset = 0;
    while (true) {
      const data = await mbGet('/class/classes', token, {
        StartDateTime: startStr,
        EndDateTime: endStr,
        Limit: 200,
        Offset: offset,
      });
      const classes = data.Classes || [];
      allClasses = allClasses.concat(classes);
      if (classes.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    // Aggregate by date and day-of-week
    const byDate = {};
    const byDow  = {};

    for (const cls of allClasses) {
      if (!cls.StartDateTime) continue;
      const d   = parseISO(cls.StartDateTime);
      const key = format(d, 'yyyy-MM-dd');
      const dow = format(d, 'EEE');
      byDate[key] = (byDate[key] || 0) + (cls.TotalBooked || 0);
      byDow[dow]  = (byDow[dow]  || 0) + (cls.TotalBooked || 0);
    }

    // Build a complete daily series with 0-fill for empty days
    const days = eachDayOfInterval({ start, end });
    const daily = days.map((d) => {
      const key   = format(d, 'yyyy-MM-dd');
      const label = format(d, 'MMM d');
      return { date: key, label, visits: byDate[key] || 0 };
    });

    const dowOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const byDowArr = dowOrder.map((day) => ({ day, visits: byDow[day] || 0 }));

    const total  = daily.reduce((s, d) => s + d.visits, 0);
    const avgDay = daily.length > 0 ? Math.round(total / daily.length) : 0;
    const peak   = daily.reduce((m, d) => d.visits > m.visits ? d : m, { visits: 0, label: '–' });

    return ok({
      period,
      daily,
      byDow: byDowArr,
      stats: {
        total7: total,
        avgDaily: avgDay,
        peakDay: peak.label,
        peakVisits: peak.visits,
        dateRange: `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`,
      },
    });
  } catch (e) {
    console.error('mb-attendance:', e);
    return err(e.message);
  }
};
