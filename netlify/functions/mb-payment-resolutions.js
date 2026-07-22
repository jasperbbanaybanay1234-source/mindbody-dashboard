/**
 * GET  /api/mb-payment-resolutions        → { resolutions: { [key]: { status, at } } }
 * POST /api/mb-payment-resolutions        → { ok: true }  body: { key, status, clientName, amount, card, date }
 * DELETE /api/mb-payment-resolutions      → { ok: true }  body: { key }
 */
import { ok, err, CORS } from './utils/mb-auth.js';

const NOTION_BASE      = 'https://api.notion.com/v1';
const RESOLUTIONS_DB   = process.env.NOTION_PAYMENT_RESOLUTIONS_DB;

async function notionReq(method, path, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN not set');
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
    throw new Error(`Notion ${method} ${path}: ${res.status} — ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function findPage(key) {
  const res = await notionReq('POST', `/databases/${RESOLUTIONS_DB}/query`, {
    filter:    { property: 'Payment Key', title: { equals: key } },
    page_size: 1,
  });
  return res.results[0] || null;
}

async function fetchAll() {
  const resolutions = {};
  let cursor;
  while (true) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionReq('POST', `/databases/${RESOLUTIONS_DB}/query`, body);
    for (const page of res.results) {
      if (page.archived) continue;
      const key    = page.properties['Payment Key']?.title?.[0]?.plain_text;
      const status = page.properties['Status']?.select?.name?.toLowerCase();
      const at     = page.properties['Resolved At']?.date?.start;
      if (key && status) resolutions[key] = { status, at: at || null };
    }
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return resolutions;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  if (!process.env.NOTION_TOKEN) return err('NOTION_TOKEN not configured', 503);

  try {
    // ── GET: return all resolutions ──────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const resolutions = await fetchAll();
      return ok({ resolutions });
    }

    // ── POST: upsert a resolution ────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const { key, status, clientName = '', amount = 0, card = '', date = '' } =
        JSON.parse(event.body || '{}');
      if (!key || !status) return err('key and status are required', 400);

      const statusLabel = status === 'reprocessed' ? 'Reprocessed' : 'Reconciled';
      const now = new Date().toISOString();

      const existing = await findPage(key);
      if (existing) {
        await notionReq('PATCH', `/pages/${existing.id}`, {
          archived: false,
          properties: {
            'Status':      { select: { name: statusLabel } },
            'Resolved At': { date:   { start: now } },
          },
        });
      } else {
        await notionReq('POST', '/pages', {
          parent: { database_id: RESOLUTIONS_DB },
          properties: {
            'Payment Key':  { title:     [{ text: { content: key } }] },
            'Client Name':  { rich_text: [{ text: { content: clientName } }] },
            'Amount':       { number: amount },
            'Card':         { rich_text: [{ text: { content: card } }] },
            'Payment Date': { rich_text: [{ text: { content: date } }] },
            'Status':       { select: { name: statusLabel } },
            'Resolved At':  { date:   { start: now } },
          },
        });
      }
      return ok({ ok: true });
    }

    // ── DELETE: archive (unmark) a resolution ────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const { key } = JSON.parse(event.body || '{}');
      if (!key) return err('key is required', 400);
      const page = await findPage(key);
      if (page) {
        await notionReq('PATCH', `/pages/${page.id}`, { archived: true });
      }
      return ok({ ok: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    console.error('mb-payment-resolutions:', e);
    return err(e.message);
  }
};
