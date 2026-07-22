import { useState, useEffect, useCallback } from 'react';

export function usePaymentResolutions() {
  const [resolved, setResolved] = useState({});

  useEffect(() => {
    fetch('/api/mb-payment-resolutions')
      .then(r => r.json())
      .then(data => { if (data.resolutions) setResolved(data.resolutions); })
      .catch(() => {});
  }, []);

  const mark = useCallback((key, status, meta = {}) => {
    // Optimistic update
    setResolved(prev => ({ ...prev, [key]: { status, at: new Date().toISOString() } }));

    fetch('/api/mb-payment-resolutions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key, status, ...meta }),
    }).catch(() => {
      // Roll back on failure
      setResolved(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    });
  }, []);

  const unmark = useCallback((key) => {
    // Optimistic update
    setResolved(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    fetch('/api/mb-payment-resolutions', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key }),
    }).catch(() => {
      // Can't easily roll back without knowing the old value — just refetch
      fetch('/api/mb-payment-resolutions')
        .then(r => r.json())
        .then(data => { if (data.resolutions) setResolved(data.resolutions); })
        .catch(() => {});
    });
  }, []);

  return { resolved, mark, unmark };
}
