/**
 * GET /api/mb-contact-logs?recent=true
 *   → { contacted: { clientId: { at, note, name } } }  (entries within last 7 days)
 *
 * GET /api/mb-contact-logs?clientId=XXX
 *   → { logs: [{ at, note, name }, …] }  (full history for one client, newest first)
 *
 * Reads from the Notion "Contact Log" database.
 *
 * Requires env vars:
 *   NOTION_TOKEN           — Notion internal integration secret
 *   NOTION_CONTACT_LOG_DB  — Contact Log database ID (falls back to hardcoded)
 */
import { ok, err, CORS } from './utils/mb-auth.js';

const NOTION_BASE    = 'https://api.notion.com/v1';
const CONTACT_LOG_DB = process.env.NOTION_CONTACT_LOG_DB;
const DAYS_7         = 7 * 24 * 60 * 60 * 1000;

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

function parseEntry(page) {
  const p       = page.properties;
  const getText = (prop) => p[prop]?.rich_text?.[0]?.plain_text || '';
  const getDate = (prop) => p[prop]?.date?.start || null;
  return {
    at:       getDate('Contacted At'),
    note:     getText('Note'),
    name:     getText('Client Name'),
    clientId: getText('Mindbody ID'),
  };
}

// Paginate through all results for a database query
async function queryAll(dbId, filter, sorts) {
  let results   = [];
  let startCursor;
  while (true) {
    const body = { filter, sorts, page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;
    const data = await notionReq('POST', `/databases/${dbId}/query`, body);
    results = results.concat(data.results || []);
    if (!data.has_more) break;
    startCursor = data.next_cursor;
  }
  return results;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // If not configured, return empty data so the dashboard still loads
  if (!process.env.NOTION_TOKEN) {
    const { clientId, recent } = event.queryStringParameters || {};
    if (clientId) return ok({ clientId, logs: [] });
    if (recent === 'true') return ok({ contacted: {} });
    return err('Provide ?clientId=X or ?recent=true');
  }

  try {
    const { clientId, recent } = event.queryStringParameters || {};

    // ── Single client history ──────────────────────────────────────────────────
    if (clientId) {
      const pages = await queryAll(
        CONTACT_LOG_DB,
        { property: 'Mindbody ID', rich_text: { equals: String(clientId) } },
        [{ property: 'Contacted At', direction: 'descending' }],
      );
      const logs = pages.map(parseEntry).filter((e) => e.at);
      return ok({ clientId, logs });
    }

    // ── Recently contacted (last 7 days) ──────────────────────────────────────
    if (recent === 'true') {
      const cutoff = new Date(Date.now() - DAYS_7).toISOString();
      const pages  = await queryAll(
        CONTACT_LOG_DB,
        { property: 'Contacted At', date: { after: cutoff } },
        [{ property: 'Contacted At', direction: 'descending' }],
      );

      // Group by clientId — keep only the most recent entry per client
      const contacted = {};
      for (const page of pages) {
        const e = parseEntry(page);
        if (!e.at || !e.clientId) continue;
        if (!contacted[e.clientId]) {
          contacted[e.clientId] = { at: e.at, note: e.note, name: e.name };
        }
      }

      return ok({ contacted });
    }

    return err('Provide ?clientId=X or ?recent=true');
  } catch (e) {
    console.error('mb-contact-logs:', e);
    return err(e.message);
  }
};
