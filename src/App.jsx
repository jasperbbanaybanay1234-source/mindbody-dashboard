import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import { useContactLog } from './utils/useContactLog.js';

// Initial load reads from the Netlify Blobs cache via GET /api/mb-snapshot.
// The Refresh button POSTs to /api/mb-snapshot to force a live pull + cache update.
// onboarding and pt are always fetched live (too dynamic to cache daily).
// If the snapshot is unavailable, each key falls back to its live endpoint.

const LOADING_ALL = { attendance: true, clientAnalytics: true, payments: true, revenue: true, onboarding: true, pt: true, celebrations: true };

const CACHED_ENDPOINTS = {
  attendance:      '/api/mb-attendance',
  clientAnalytics: '/api/mb-client-analytics',
  payments:        '/api/mb-payments',
  revenue:         '/api/mb-revenue',
};

async function safeFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const [data, setData]               = useState({ attendance: null, clientAnalytics: null, payments: null, revenue: null, onboarding: null, pt: null, celebrations: null });
  const [loading, setLoading]         = useState(LOADING_ALL);
  const [errors, setErrors]           = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const contactLog = useContactLog();

  const refresh = useCallback((forceRefresh = false) => {
    setLoading(LOADING_ALL);
    setErrors({});

    const liveFetch = (key, url) =>
      safeFetch(url)
        .then(json => setData(prev => ({ ...prev, [key]: json })))
        .catch(e  => setErrors(prev => ({ ...prev, [key]: e.message })))
        .finally(() => setLoading(prev => ({ ...prev, [key]: false })));

    // Try snapshot for the 4 cached endpoints.
    // GET = serve from cache; POST = force live pull + update cache.
    // Falls back key-by-key (or entirely) to live calls if cache is incomplete.
    const cachedLoad = safeFetch('/api/mb-snapshot', { method: forceRefresh ? 'POST' : 'GET' })
      .then(snap => {
        if (snap.error) throw new Error(snap.error);
        const update  = {};
        const missing = [];
        for (const [key, url] of Object.entries(CACHED_ENDPOINTS)) {
          if (snap[key] != null) update[key] = snap[key];
          else missing.push([key, url]);
        }
        if (Object.keys(update).length) setData(prev => ({ ...prev, ...update }));
        return Promise.all(missing.map(([k, url]) => liveFetch(k, url)));
      })
      .catch(() =>
        Promise.all(Object.entries(CACHED_ENDPOINTS).map(([k, url]) => liveFetch(k, url)))
      )
      .finally(() =>
        setLoading(prev => ({ ...prev, attendance: false, clientAnalytics: false, payments: false, revenue: false }))
      );

    Promise.all([
      cachedLoad,
      liveFetch('onboarding',    '/api/mb-onboarding'),
      liveFetch('pt',            '/api/mb-pt-analytics'),
      liveFetch('celebrations',  '/api/mb-celebrations'),
    ]).then(() => setLastRefresh(new Date()));
  }, []);

  useEffect(() => { refresh(false); }, [refresh]);

  return (
    <Dashboard
      data={data}
      loading={loading}
      errors={errors}
      lastRefresh={lastRefresh}
      onRefresh={() => refresh(true)}
      contactLog={contactLog}
    />
  );
}
