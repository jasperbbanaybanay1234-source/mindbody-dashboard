/**
 * GET /api/mb-onboarding
 *
 * Identifies clients currently in the 4-week onboarding program, groups them
 * into week columns (1–4), and counts sessions via the class-visit approach
 * (proven to work — same pattern as mb-client-analytics.js).
 *
 * Triggered by purchases of either of these products:
 *   "28 Day Kickstarter" | "Split the Fee"
 *
 * Also returns two automatic post-program classifications for clients whose
 * onboarding product has already expired (start date + 28 days is in the past):
 *   autoRolledOver     – holds a real membership/contract starting on or after expiry
 *   autoNotRolledOver  – no such membership found
 */
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import { subDays, addDays, format, parseISO, differenceInDays } from 'date-fns';

const BATCH = 15;

// Length of the onboarding program in days
const PROGRAM_DAYS = 28;

// How far back to look for expired onboarding purchases (rollover section)
const ROLLOVER_LOOKBACK_DAYS = 90;

// Cap on how many expired clients we run contract lookups for (1 API call each)
const ROLLOVER_MAX_CLIENTS = 120;

const ONBOARDING_KEYWORDS = [
  '28 day kickstarter',
  'split the fee',
];

function isOnboardingProduct(name = '') {
  const lower = name.toLowerCase();
  return ONBOARDING_KEYWORDS.some((k) => lower.includes(k));
}

function shortProduct(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('28 day') || lower.includes('kickstarter')) return '28-Day';
  if (lower.includes('split the fee'))                          return 'Split Fee';
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

// Same endpoint/pattern as getContractResumeDate in mb-client-analytics.js
async function getClientContracts(token, clientId) {
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
    c.Description  || c.description  ||
    ''
  );
}

function contractStart(c = {}) {
  const raw =
    c.StartDate     || c.startDate     ||
    c.AgreementDate || c.agreementDate ||
    c.ActiveDate    || c.activeDate    ||
    c.OriginationDate || c.originationDate ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * A rollover = a real ongoing membership/contract whose start date is on or
 * after the client's onboarding product expiry date, and which isn't the
 * 28-Day Kickstarter / Split the Fee product itself.
 */
function findRolloverContract(contracts, endDate) {
  const endKey = format(endDate, 'yyyy-MM-dd');
  let best = null;
  for (const c of contracts) {
    const name = contractName(c);
    if (isOnboardingProduct(name)) continue;      // same onboarding product — doesn't count
    const start = contractStart(c);
    if (!start) continue;
    if (format(start, 'yyyy-MM-dd') < endKey) continue;
    if (!best || start < best.start) best = { start, name: name || 'Membership' };
  }
  return best;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now   = new Date();

    // Classes only need the active-onboarding window (last 28 days).
    const windowStart = subDays(now, PROGRAM_DAYS - 1);
    const classStart  = format(windowStart, "yyyy-MM-dd'T'00:00:00");
    const classEnd    = format(now,         "yyyy-MM-dd'T'23:59:59");

    // Sales look back further so we can also classify already-expired programs.
    const salesStart = format(subDays(now, ROLLOVER_LOOKBACK_DAYS), "yyyy-MM-dd'T'00:00:00");
    const salesEnd   = classEnd;

    // Fetch sales, clients, and classes in parallel to minimise wall-clock time
    console.log('[mb-onboarding] Starting parallel fetch…');
    const [allSales, clientMap, allClasses] = await Promise.all([
      getSales(token, salesStart, salesEnd),
      getAllClients(token),
      getClasses(token, classStart, classEnd),
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

    const allOnboarding = Object.entries(onboardingMap).map(([clientId, info]) => {
      const daysSinceStart = differenceInDays(now, info.startDate);
      const week    = Math.min(4, Math.floor(daysSinceStart / 7) + 1);
      const endDate = addDays(info.startDate, PROGRAM_DAYS);
      return { clientId, ...info, daysSinceStart, week, endDate };
    });

    // Currently mid-program (day 0–27)
    const activeOnboarding = allOnboarding.filter(
      (c) => c.daysSinceStart >= 0 && c.daysSinceStart <= PROGRAM_DAYS - 1
    );

    // Program already finished — eligible for automatic rollover classification
    const expiredOnboarding = allOnboarding
      .filter((c) => c.daysSinceStart >= PROGRAM_DAYS)
      .sort((a, b) => b.endDate - a.endDate)     // most recently expired first
      .slice(0, ROLLOVER_MAX_CLIENTS);

    console.log(
      `[mb-onboarding] ${activeOnboarding.length} active, ${expiredOnboarding.length} expired onboarding clients`
    );

    // ── Automatic rollover classification (expired programs only) ─────────
    const autoRolledOver    = [];
    const autoNotRolledOver = [];

    for (let i = 0; i < expiredOnboarding.length; i += BATCH) {
      const batch   = expiredOnboarding.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((c) => getClientContracts(token, c.clientId))
      );

      batch.forEach((c, idx) => {
        const contracts = results[idx].status === 'fulfilled' ? results[idx].value : [];
        const rollover  = findRolloverContract(contracts, c.endDate);
        const client    = clientMap[c.clientId] || { id: c.clientId, name: `Client ${c.clientId}`, email: '', phone: '' };

        const entry = {
          id:           c.clientId,
          name:         client.name,
          email:        client.email,
          phone:        client.phone,
          product:      c.product,
          shortProduct: c.shortProduct,
          startDate:    format(c.startDate, 'yyyy-MM-dd'),
          endDate:      format(c.endDate,   'yyyy-MM-dd'),
        };

        if (rollover) {
          autoRolledOver.push({
            ...entry,
            membership:          rollover.name,
            membershipStartDate: format(rollover.start, 'yyyy-MM-dd'),
          });
        } else {
          autoNotRolledOver.push(entry);
        }
      });
    }

    // Most recently expired first
    autoRolledOver.sort((a, b)    => b.endDate.localeCompare(a.endDate));
    autoNotRolledOver.sort((a, b) => b.endDate.localeCompare(a.endDate));

    const rolloverPayload = {
      autoRolledOver,
      autoNotRolledOver,
      rolloverSummary: {
        rolledOver:    autoRolledOver.length,
        notRolledOver: autoNotRolledOver.length,
        expired:       expiredOnboarding.length,
      },
    };

    if (activeOnboarding.length === 0) {
      return ok({
        week1: [], week2: [], week3: [], week4: [],
        pipelineReds: [],
        onboardingIds: [],
        ...rolloverPayload,
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
        endDate:            format(c.endDate,   'yyyy-MM-dd'),
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

    console.log(
      `[mb-onboarding] Done. ${enriched.length} clients, ${pipelineReds.length} at risk, ` +
      `${autoRolledOver.length} rolled over, ${autoNotRolledOver.length} not rolled over`
    );

    return ok({
      week1:         byWeek(1),
      week2:         byWeek(2),
      week3:         byWeek(3),
      week4:         byWeek(4),
      pipelineReds,
      onboardingIds: enriched.map((c) => c.id),
      ...rolloverPayload,
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
