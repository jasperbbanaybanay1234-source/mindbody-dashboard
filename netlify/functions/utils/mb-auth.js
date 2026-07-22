const MB_BASE = 'https://api.mindbodyonline.com/public/v6';

export function baseHeaders() {
  return {
    'Content-Type': 'application/json',
    'Api-Key': process.env.MINDBODY_API_KEY,
    'SiteId': process.env.MINDBODY_SITE_ID,
  };
}

export async function getStaffToken() {
  const res = await fetch(`${MB_BASE}/usertoken/issue`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({
      Username: process.env.MINDBODY_USERNAME,
      Password: process.env.MINDBODY_PASSWORD,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mindbody auth failed (${res.status}): ${text}`);
  }
  const { AccessToken } = await res.json();
  return AccessToken;
}

export function authHeaders(token) {
  return { ...baseHeaders(), Authorization: `Bearer ${token}` };
}

export async function mbGet(path, token, params = {}) {
  const url = new URL(`${MB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item));
    } else {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MB GET ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function mbPost(path, token, body) {
  const res = await fetch(`${MB_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MB POST ${path} → ${res.status}`);
  return res.json();
}

// Australian phone numbers returned as JSON numbers lose their leading 0.
// Re-add it for any 9-digit number starting with 2–9 (AU mobile & landline pattern).
export function formatPhone(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const s = String(raw).trim();
  if (s.length === 9 && /^[2-9]/.test(s)) return '0' + s;
  return s;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export function ok(body) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(body) };
}

export function err(message, status = 500) {
  return { statusCode: status, headers: CORS, body: JSON.stringify({ error: message }) };
}
