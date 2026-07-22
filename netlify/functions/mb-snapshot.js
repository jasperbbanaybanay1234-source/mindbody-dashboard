/**
 * GET  /api/mb-snapshot  → returns cached dashboard data (Netlify Blobs)
 * POST /api/mb-snapshot  → forces a live refresh, updates cache, returns fresh data
 *
 * If no cache exists (first ever load) a live fetch is triggered automatically.
 */
import { getStore } from '@netlify/blobs';
import { ok, err, CORS } from './utils/mb-auth.js';

const STORE_KEY = 'dashboard-snapshot';
const BASE_URL  = process.env.URL || 'http://localhost:8888';

async function fetchAll() {
  const [att, ana, pay, rev] = await Promise.allSettled([
    fetch(`${BASE_URL}/api/mb-attendance`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/mb-client-analytics`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/mb-payments`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/mb-revenue`).then((r) => r.json()),
  ]);

  return {
    attendance:      att.status === 'fulfilled' ? att.value : null,
    clientAnalytics: ana.status === 'fulfilled' ? ana.value : null,
    payments:        pay.status === 'fulfilled' ? pay.value : null,
    revenue:         rev.status === 'fulfilled' ? rev.value : null,
    cachedAt:        new Date().toISOString(),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const store = getStore('dashboard-cache');

    // Force refresh (manual Refresh button)
    if (event.httpMethod === 'POST') {
      const snapshot = await fetchAll();
      await store.set(STORE_KEY, JSON.stringify(snapshot));
      return ok(snapshot);
    }

    // Serve from cache (page load)
    const raw = await store.get(STORE_KEY);
    if (raw) return ok(JSON.parse(raw));

    // No cache yet — fetch live and prime it
    const snapshot = await fetchAll();
    await store.set(STORE_KEY, JSON.stringify(snapshot));
    return ok(snapshot);
  } catch (e) {
    console.error('mb-snapshot:', e);
    return err(e.message);
  }
};
