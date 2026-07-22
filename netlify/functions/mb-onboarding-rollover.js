/**
 * Persist membership rollover decisions in Notion.
 *
 * GET  /api/mb-onboarding-rollover
 *   → { decisions: { [clientId]: { decision: 'rollover'|'no-rollover', decidedAt: ISO } } }
 *
 * POST /api/mb-onboarding-rollover  { clientId, decision: 'rollover'|'no-rollover'|null }
 *   → null clears/undoes the decision
 *   → { decisions: { ... } }
 *
 * Requires env var: NOTION_TOKEN
 * Optional env var: NOTION_ROLLOVER_DB (falls back to hardcoded ID)
 */
import { ok, err, CORS } from './utils/mb-auth.js';

const NOTION_BASE  = 'https://api.notion.com/v1';
const ROLLOVER_DB  = process.env.NOTION_ROLLOVER_DB;
const CLIENTS_DB   = process.env.NOTION_CLIENTS_DB;

async function notionReq(method, path, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN env var is not set');
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method,
    headers: {
      Authorization:    `Bearer ${token}`,
      'Content-Type':   'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion ${method} ${path}: ${res.status} — ${text}`);
  }
  return res.json();
}

// Read every row in the Rollover Decisions DB → build decisions map
async function fetchAllDecisions() {
  const decisions = {};
  let cursor;
  while (true) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionReq('POST', `/databases/${ROLLOVER_DB}/query`, body);
    for (const page of res.results) {
      if (page.archived) continue;
      const clientId  = page.properties['Mindbody ID']?.title?.[0]?.plain_text?.trim();
      const selectVal = page.properties['Rollover']?.select?.name;
      const dateVal   = page.properties['Date']?.date?.start;
      if (!clientId || !selectVal) continue;
      const decision = selectVal === 'Rollover' ? 'rollover' : 'no-rollover';
      decisions[clientId] = { decision, decidedAt: dateVal || new Date().toISOString() };
    }
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return decisions;
}

// Find an existing rollover page for this client (returns page ID or null)
async function findRolloverPage(clientId) {
  const res = await notionReq('POST', `/databases/${ROLLOVER_DB}/query`, {
    filter:    { property: 'Mindbody ID', title: { equals: String(clientId) } },
    page_size: 1,
  });
  return res.results.find(p => !p.archived)?.id || null;
}

// Find the CLIENTS page for this client (optional — used to populate the relation)
async function findClientPageId(clientId) {
  try {
    const res = await notionReq('POST', `/databases/${CLIENTS_DB}/query`, {
      filter:    { property: 'Mindbody ID', rich_text: { equals: String(clientId) } },
      page_size: 1,
    });
    return res.results[0]?.id || null;
  } catch {
    return null;
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // Graceful fallback when Notion isn't configured yet
  if (!process.env.NOTION_TOKEN) {
    console.warn('mb-onboarding-rollover: NOTION_TOKEN not set — returning empty decisions');
    return ok({ decisions: {} });
  }

  try {
    // ── GET ────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const decisions = await fetchAllDecisions();
      return ok({ decisions });
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const { clientId, decision } = JSON.parse(event.body || '{}');
      if (!clientId) return err('clientId is required', 400);

      const id             = String(clientId);
      const existingPageId = await findRolloverPage(id);

      if (!decision) {
        // Undo: archive the row so it's removed from the decisions map
        if (existingPageId) {
          await notionReq('PATCH', `/pages/${existingPageId}`, { archived: true });
        }

      } else if (decision === 'rollover' || decision === 'no-rollover') {
        const notionVal    = decision === 'rollover' ? 'Rollover' : 'No Rollover';
        const now          = new Date().toISOString();
        const clientPageId = await findClientPageId(id);

        const props = {
          'Mindbody ID': { title: [{ text: { content: id } }] },
          'Rollover':    { select: { name: notionVal } },
          'Date':        { date: { start: now } },
        };
        if (clientPageId) {
          props['Relation to Client'] = { relation: [{ id: clientPageId }] };
        }

        if (existingPageId) {
          await notionReq('PATCH', `/pages/${existingPageId}`, { properties: props });
        } else {
          await notionReq('POST', '/pages', {
            parent:     { database_id: ROLLOVER_DB },
            properties: props,
          });
        }

      } else {
        return err('decision must be "rollover", "no-rollover", or null', 400);
      }

      // Return the full updated decisions map so the UI syncs immediately
      const decisions = await fetchAllDecisions();
      return ok({ decisions });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    console.error('mb-onboarding-rollover:', e);
    return err(e.message);
  }
};
