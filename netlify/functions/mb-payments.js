/**
 * Returns failed/declined transactions and on-account sales.
 *
 * Mindbody endpoints on this account:
 *   GET /sale/transactions  → transaction ledger with Status field  ✓
 *   GET /sale/sales         → sales with payment method/type        ✓
 *   GET /sale/accountbalances → 404 (not on this plan)              ✗
 *
 * Failed payments  = /sale/transactions where status contains Declined/Failed/etc.
 *                    Deduplicated: retries of the same charge show as one row (most recent).
 * On account       = clients whose live AccountBalance > 0, sourced from sales window.
 *                    Uses client.AccountBalance as source of truth so paid-off accounts
 *                    are automatically excluded.
 */
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import { subDays, format, parseISO } from 'date-fns';

const FAILED_KEYWORDS = ['declined', 'failed', 'error', 'chargeback', 'disputed', 'returned', 'void'];

function isFailed(status) {
  return FAILED_KEYWORDS.some((k) => (status || '').toLowerCase().includes(k));
}

function isOnAccount(payments = []) {
  return payments.some((p) => (p.Type || '').toLowerCase().includes('account'));
}

async function getAllClients(token) {
  const clientMap = {};
  let offset = 0;
  while (true) {
    const data = await mbGet('/client/clients', token, {
      ActiveOnly: false,
      Limit: 200,
      Offset: offset,
    });
    const clients = data.Clients || [];
    for (const c of clients) {
      clientMap[String(c.Id)] = {
        name:           `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
        email:          c.Email || '',
        phone:          formatPhone(c.MobilePhone || c.HomePhone),
        accountBalance: c.AccountBalance ?? c.Balance ?? c.CurrentBalance ?? null,
      };
    }
    // Log one client's keys so we can find the real balance field name
    if (offset === 0 && clients.length > 0) {
      console.log('[mb-payments] sample client keys:', Object.keys(clients[0]).join(', '));
    }
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return clientMap;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();
    const start = format(subDays(now, 30), "yyyy-MM-dd'T'00:00:00");
    const end   = format(now,             "yyyy-MM-dd'T'23:59:59");

    // ── Failed / declined transactions ──────────────────────────────────────
    let allTransactions = [];
    let offset = 0;
    while (true) {
      const data = await mbGet('/sale/transactions', token, {
        TransactionStartDateTime: start,
        TransactionEndDateTime: end,
        Limit: 200,
        Offset: offset,
      });
      const txns = data.Transactions || [];
      allTransactions = allTransactions.concat(txns);
      if (txns.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    const failedTxns = allTransactions.filter((t) => isFailed(t.Status));

    // ── On-account sales ────────────────────────────────────────────────────
    let allSales = [];
    offset = 0;
    while (true) {
      const data = await mbGet('/sale/sales', token, {
        StartSaleDateTime: start,
        EndSaleDateTime: end,
        Limit: 200,
        Offset: offset,
      });
      const sales = data.Sales || [];
      allSales = allSales.concat(sales);
      if (sales.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    const onAccountSales = allSales.filter((s) => isOnAccount(s.Payments || []));

    // ── Fetch all clients (need AccountBalance for on-account accuracy) ─────
    const clientMap = await getAllClients(token);
    function clientName(id) {
      return clientMap[String(id)]?.name || `Client ${id}`;
    }

    // ── Failed payments — deduplicate retries ───────────────────────────────
    // Same client + same amount + same card = one recurring charge being retried.
    // Keep only the most recent attempt; track retry count for display.
    const dedupeKey = (t) =>
      `${t.ClientId}|${Math.round((t.Amount || 0) * 100)}|${t.CCLastFour || t.ACHLastFour || ''}`;

    const latestByKey = new Map();
    const retryCounts = new Map();
    for (const t of failedTxns) {
      const key = dedupeKey(t);
      retryCounts.set(key, (retryCounts.get(key) || 0) + 1);
      const existing = latestByKey.get(key);
      if (!existing || new Date(t.TransactionTime) > new Date(existing.TransactionTime)) {
        latestByKey.set(key, t);
      }
    }

    const failedPayments = [...latestByKey.values()]
      .sort((a, b) => new Date(b.TransactionTime) - new Date(a.TransactionTime))
      .map((t) => {
        const key  = dedupeKey(t);
        const card = t.CCLastFour || t.ACHLastFour;
        return {
          id:         t.TransactionId,
          key,
          clientId:   String(t.ClientId),
          clientName: clientName(t.ClientId),
          amount:     t.Amount || 0,
          date:       t.TransactionTime ? format(parseISO(t.TransactionTime), 'dd MMM yyyy') : '–',
          status:     t.Status,
          card:       card ? `**** ${card}` : '–',
          retries:    retryCounts.get(key) - 1,
        };
      });

    // ── On account — group by client, use live AccountBalance ───────────────
    // AccountBalance on the client record reflects payments made against the account,
    // so clients who've since cleared their balance are automatically excluded.
    const onAccountClientIds = [...new Set(onAccountSales.map((s) => String(s.ClientId)))];

    const onAccount = onAccountClientIds
      .map((id) => {
        const client     = clientMap[id] || {};
        const clientSales = onAccountSales
          .filter((s) => String(s.ClientId) === id)
          .sort((a, b) => new Date(b.SaleDate) - new Date(a.SaleDate));

        // AccountBalance returns 0 for all clients on this Mindbody plan — not usable.
        // Sum account-type payments from sales as the best available approximation.
        const balance = clientSales
          .flatMap((s) => s.Payments || [])
          .filter((p) => (p.Type || '').toLowerCase().includes('account'))
          .reduce((sum, p) => sum + (p.Amount || 0), 0);

        if (balance <= 0) return null;

        const allItems = clientSales
          .flatMap((s) => (s.PurchasedItems || []).map((i) => i.Description))
          .filter(Boolean);

        return {
          clientId:    id,
          clientName:  client.name || `Client ${id}`,
          balance,
          description: [...new Set(allItems)].join(', ') || '–',
          date:        clientSales[0]?.SaleDate ? format(parseISO(clientSales[0].SaleDate), 'dd MMM yyyy') : '–',
          email:       client.email || '',
          phone:       client.phone || '',
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.balance - a.balance);

    const totalFailed    = failedPayments.reduce((s, p) => s + p.amount, 0);
    const totalOnAccount = onAccount.reduce((s, b) => s + b.balance, 0);

    // Debug: expose raw on-account data so we can diagnose field names
    const sampleOnAccountSale = onAccountSales[0] || null;
    const sampleClientId = onAccountClientIds[0];
    const sampleClient = sampleClientId ? clientMap[sampleClientId] : null;

    return ok({
      failedPayments: failedPayments.slice(0, 100),
      onAccount:      onAccount.slice(0, 100),
      summary: {
        failedCount:          failedPayments.length,
        totalFailedAmount:    totalFailed,
        onAccountCount:       onAccount.length,
        totalOnAccountAmount: totalOnAccount,
      },
      _debug: {
        onAccountSalesCount:   onAccountSales.length,
        onAccountClientCount:  onAccountClientIds.length,
        sampleSalePayments:    sampleOnAccountSale?.Payments || null,
        sampleSaleItems:       sampleOnAccountSale?.PurchasedItems?.map(i => i.Description) || null,
        sampleClientKeys:      sampleClient ? Object.keys(sampleClient) : null,
        sampleClientRaw:       sampleClient,
      },
    });
  } catch (e) {
    console.error('mb-payments:', e);
    return err(e.message);
  }
};
