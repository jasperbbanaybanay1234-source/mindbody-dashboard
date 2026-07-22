/**
 * GET /api/mb-onboarding
 *
 * Identifies clients currently in the 4-week onboarding program, groups them
 * into week columns (1–4), and counts sessions via the class-visit approach
 * (proven to work — same pattern as mb-client-analytics.js).
 *
 * Triggered by purchases of any of these products:
 *   "3 Session Pass" | "14 Day Pass" | "4 Week Kickstarter"
 *   "Strong Dad Transformation" | "Strong Mum Transformation"
 */
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import { subDays, format, parseISO, differenceInDays } from 'date-fns';

const BATCH = 15;

const ONBOARDING_KEYWORDS = [
  '3 session pass',
  '14 day pass',
  '4 week kickstarter',
  'strong dad transformation',
  'strong mum transformation',
];

function isOnboardingProduct(name = '') {
  const lower = name.toLowerCase();
  return ONBOARDING_KEYWORDS.some((k) => lower.includes(k));
}

function shortProduct(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('strong dad'))                            return 'Strong Dad';
  if (lower.includes('strong mum'))                            return 'Strong Mum';
  if (lower.includes('4 week') || lower.includes('kickstarter')) return '4-Week';
  if (lower.includes('14 day'))                                return '14-Day';
  if (lower.includes('3 session'))                             return '3-Session';
  return name.split(' ').slice(0, 2).join(' ');
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getSales(token, start, end) {
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet('/sale/sales', token, {
      StartSaleDateTime: start,
      EndSaleDateTime:   end,
      Limit:  200,
      Offset: offset,
    });
    all = all.concat(data.Sales || []);
    if ((data.Sales || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getClasses(token, start, end) {
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, {
      StartDateTime: start,
      EndDateTime:   end,
      Limit:  200,
      Offset: offset,
    });
    // Only fetch visits for classes that actually had bookings
    const classes = (data.Classes || []).filter((c) => (c.TotalBooked || 0) > 0);
    all = all.concat(classes);
    if ((data.Classes || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getClassVisits(token, classId) {
  try {
    const data = await mbGet('/class/classvisits', token, { ClassID: classId });
    return data.Class?.Visits || [];
  } catch {
    return [];
  }
}

async function getAllClients(token) {
  const map = {};
  let offset = 0;
  while (true) {
    const data = await mbGet('/client/clients', token, {
      ActiveOnly: false,
      Limit:  200,
      Offset: offset,
    });
    const clients = data.Clients || [];
    for (const c of clients) {
      map[String(c.Id)] = {
        id:    String(c.Id),
        name:  `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
        email: c.Email || '',
        phone: formatPhone(c.MobilePhone || c.HomePhone),
      };
    }
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return map;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now   = new Date();

    const windowStart = subDays(now, 29);
    const fetchStart  = format(windowStart, "yyyy-MM-dd'T'00:00:00");
    const fetchEnd    = format(now,         "yyyy-MM-dd'T'23:59:59");

    // Fetch sales, clients, and classes in parallel to minimise wall-clock time
    console.log('[mb-onboarding] Starting parallel fetch…');
    const [allSales, clientMap, allClasses] = await Promise.all([
      getSales(token, fetchStart, fetchEnd),
      getAllClients(token),
      getClasses(token, fetchStart, fetchEnd),
    ]);
    console.log(`[mb-onboarding] Got ${allSales.length} sales, ${Object.keys(clientMap).length} clients, ${allClasses.length} classes`);

    // ── Identify onboarding clients from sales ────────────────────────────
    const onboardingMap = {};  // clientId → { startDate, product, shortProduct }

    for (const sale of allSales) {
      if (!sale.SaleDate) continue;
      const clientId = String(sale.Client?.Id ?? sale.ClientId ?? '');
      if (!clientId || clientId === 'undefined') continue;

      for (const item of (sale.PurchasedItems || [])) {
        const name = item.Description || item.Name || '';
        if (!isOnboardingProduct(name)) continue;

        const saleDate = parseISO(sale.SaleDate);
        // Keep only the most recent onboarding purchase per client
        if (!onboardingMap[clientId] || saleDate > onboardingMap[clientId].startDate) {
          onboardingMap[clientId] = {
            startDate:    saleDate,
            product:      name,
            shortProduct: shortProduct(name),
          };
        }
        break; // One onboarding product per sale is enough
      }
    }

    // Filter to clients currently in the 0–27 day window
    const activeOnboarding = Object.entries(onboardingMap)
      .map(([clientId, info]) => {
        const daysSinceStart = differenceInDays(now, info.startDate);
        const week = Math.min(4, Math.floor(daysSinceStart / 7) + 1);
        return { clientId, ...info, daysSinceStart, week };
      })
      .filter((c) => c.daysSinceStart >= 0 && c.daysSinceStart <= 27);

    console.log(`[mb-onboarding] ${activeOnboarding.length} active onboarding clients`);

    if (activeOnboarding.length === 0) {
      return ok({
        week1: [], week2: [], week3: [], week4: [],
        pipelineReds: [],
        onboardingIds: [],
        summary: { total: 0, atRisk: 0, week1Count: 0, week2Count: 0, week3Count: 0, week4Count: 0 },
      });
    }

    // ── Batch-fetch class visits, counting only for onboarding clients ────
    const onboardingSet = new Set(activeOnboarding.map((c) => c.clientId));
    const visitsByClient = {};   // clientId → Date[]

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch   = allClasses.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((cls) => getClassVisits(token, cls.Id))
      );

      batch.forEach((cls, idx) => {
        if (results[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);

        for (const visit of results[idx].value) {
          const id = String(visit.ClientId || '');
          if (!id || !onboardingSet.has(id)) continue;  // Skip non-onboarding clients
          if (visit.SignedIn === true && !visit.LateCancelled) {
            if (!visitsByClient[id]) visitsByClient[id] = [];
            visitsByClient[id].push(classDate);
          }
        }
      });
    }

    // ── Count sessions per onboarding week (relative to each client's start date) ─
    const enriched = activeOnboarding.map((c) => {
      const visits       = visitsByClient[c.clientId] || [];
      const weekSessions = [0, 0, 0, 0];   // index 0 = Week 1

      for (const visitDate of visits) {
        const day = differenceInDays(visitDate, c.startDate);
        if      (day >= 0  && day < 7)  weekSessions[0]++;
        else if (day >= 7  && day < 14) weekSessions[1]++;
        else if (day >= 14 && day < 21) weekSessions[2]++;
        else if (day >= 21 && day < 28) weekSessions[3]++;
      }

      const totalSessions       = weekSessions.reduce((s, w) => s + w, 0);
      const currentWeekSessions = weekSessions[c.week - 1];
      const client              = clientMap[c.clientId] || { id: c.clientId, name: `Client ${c.clientId}`, email: '', phone: '' };

      // Most recent signed-in visit across the entire onboarding window
      const lastVisit = visits.length > 0
        ? visits.reduce((max, d) => (d > max ? d : max))
        : null;

      return {
        id:                 c.clientId,
        name:               client.name,
        email:              client.email,
        phone:              client.phone,
        product:            c.product,
        shortProduct:       c.shortProduct,
        startDate:          format(c.startDate, 'yyyy-MM-dd'),
        daysSinceStart:     c.daysSinceStart,
        week:               c.week,
        weekSessions,
        totalSessions,
        currentWeekSessions,
        isAtRisk:           currentWeekSessions === 0,
        lastSessionDate:    lastVisit ? format(lastVisit, 'yyyy-MM-dd') : null,
      };
    });

    const byWeek = (w) => enriched.filter((c) => c.week === w).sort((a, b) => a.name.localeCompare(b.name));
    const pipelineReds = enriched
      .filter((c) => c.isAtRisk)
      // Sort: most recently active first, then by how far through their program
      .sort((a, b) => {
        if (!a.lastSessionDate && !b.lastSessionDate) return b.daysSinceStart - a.daysSinceStart;
        if (!a.lastSessionDate) return 1;
        if (!b.lastSessionDate) return -1;
        return b.lastSessionDate.localeCompare(a.lastSessionDate);
      });

    console.log(`[mb-onboarding] Done. ${enriched.length} clients, ${pipelineReds.length} at risk`);

    return ok({
      week1:         byWeek(1),
      week2:         byWeek(2),
      week3:         byWeek(3),
      week4:         byWeek(4),
      pipelineReds,
      onboardingIds: enriched.map((c) => c.id),
      summary: {
        total:      enriched.length,
        atRisk:     pipelineReds.length,
        week1Count: byWeek(1).length,
        week2Count: byWeek(2).length,
        week3Count: byWeek(3).length,
        week4Count: byWeek(4).length,
      },
    });
  } catch (e) {
    console.error('[mb-onboarding] Failed:', e.message);
    return err(e.message);
  }
};
