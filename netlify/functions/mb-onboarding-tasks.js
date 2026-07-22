/**
 * Persist onboarding task completions in Netlify Blobs.
 *
 * GET  /api/mb-onboarding-tasks
 *   → { completions: { [clientId]: [taskId, ...] } }
 *
 * POST /api/mb-onboarding-tasks  { clientId, taskId }
 *   → toggles the task (add if missing, remove if present)
 *   → { completions: { ... } }
 */
import { getStore } from '@netlify/blobs';
import { ok, err, CORS } from './utils/mb-auth.js';

const STORE_KEY = 'completions';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const store = getStore('onboarding-tasks');

    if (event.httpMethod === 'GET') {
      const raw = await store.get(STORE_KEY);
      const completions = raw ? JSON.parse(raw) : {};
      return ok({ completions });
    }

    if (event.httpMethod === 'POST') {
      const { clientId, taskId } = JSON.parse(event.body || '{}');
      if (!clientId || !taskId) return err('clientId and taskId are required', 400);

      const raw = await store.get(STORE_KEY);
      const completions = raw ? JSON.parse(raw) : {};

      const id      = String(clientId);
      const current = completions[id] || [];

      // Toggle
      if (current.includes(taskId)) {
        completions[id] = current.filter((t) => t !== taskId);
      } else {
        completions[id] = [...current, taskId];
      }

      // Clean up empty arrays
      if (completions[id].length === 0) delete completions[id];

      await store.set(STORE_KEY, JSON.stringify(completions));
      return ok({ completions });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    console.error('mb-onboarding-tasks:', e);
    return err(e.message);
  }
};
