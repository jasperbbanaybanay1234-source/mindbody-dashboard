/**
 * POST /api/mb-contact-client
 * Body: { clientId, clientName?, note?, email?, phone? }
 *
 * Creates a row in the Notion "Contact Log" database, links it to the client's
 * page in the CLIENTS database (finding by Mindbody ID or creating a stub page),
 * and stamps "Last Check-In" on the client page.
 *
 * Requires env vars:
 *   NOTION_TOKEN           — Notion internal integration secret
 *   NOTION_CONTACT_LOG_DB  — Contact Log database ID (falls back to hardcoded)
 *   NOTION_CLIENTS_DB      — CLIENTS database ID (falls back to hardcoded)
 */
import { ok, err, CORS } from './utils/mb-auth.js';

const NOTION_BASE      = 'https://api.notion.com/v1';
const CONTACT_LOG_DB   = process.env.NOTION_CONTACT_LOG_DB;
const CLIENTS_DB       = process.env.NOTION_CLIENTS_DB;

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

// Find existing CLIENTS page by Mindbody ID, or create a stub
async function findOrCreateClient(clientId, clientName, email, phone) {
  const searchRes = await notionReq('POST', `/databases/${CLIENTS_DB}/query`, {
    filter:    { property: 'Mindbody ID', rich_text: { equals: String(clientId) } },
    page_size: 1,
  });

  if (searchRes.results.length > 0) {
    return searchRes.results[0].id;
  }

  // Create a minimal stub page — the coach can fill in the rest in Notion
  const props = {
    'Full Name':    { title:      [{ text: { content: clientName } }] },
    'Mindbody ID':  { rich_text:  [{ text: { content: String(clientId) } }] },
    'Relationship': { multi_select: [{ name: 'Client' }] },
  };
  if (email) props['Email'] = { email };
  if (phone) props['Phone'] = { phone_number: phone };

  const newPage = await notionReq('POST', '/pages', {
    parent:     { database_id: CLIENTS_DB },
    properties: props,
  });
  return newPage.id;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return err('Method not allowed', 405);

  try {
    if (!process.env.NOTION_TOKEN) {
      console.warn('mb-contact-client: NOTION_TOKEN not set — contact not logged');
      return err('NOTION_TOKEN not configured — see setup instructions', 503);
    }

    const { clientId, clientName = '', note = '', email = '', phone = '' } =
      JSON.parse(event.body || '{}');
    if (!clientId) return err('clientId is required', 400);

    const now     = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Ensure client page exists
    const clientPageId = await findOrCreateClient(clientId, clientName, email, phone);

    // 2. Create contact log entry linked to client
    await notionReq('POST', '/pages', {
      parent:     { database_id: CONTACT_LOG_DB },
      properties: {
        'Entry':        { title:     [{ text: { content: `${clientName} – ${dateStr}` } }] },
        'Mindbody ID':  { rich_text: [{ text: { content: String(clientId) } }] },
        'Client Name':  { rich_text: [{ text: { content: clientName } }] },
        'Note':         { rich_text: [{ text: { content: note } }] },
        'Contacted At': { date: { start: now.toISOString() } },
        'Client':       { relation: [{ id: clientPageId }] },
      },
    });

    // 3. Stamp Last Check-In on the client page
    await notionReq('PATCH', `/pages/${clientPageId}`, {
      properties: { 'Last Check-In': { date: { start: dateStr } } },
    });

    const entry = { at: now.toISOString(), note, name: clientName };
    return ok({ logged: true, entry });
  } catch (e) {
    console.error('mb-contact-client:', e);
    return err(e.message);
  }
};
