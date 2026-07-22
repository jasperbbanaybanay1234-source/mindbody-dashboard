import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing membership rollover decisions.
 * Persists via Netlify Blobs through /api/mb-onboarding-rollover.
 *
 * Returns:
 *   decisions                          → { [clientId]: { decision, decidedAt } }
 *   getDecision(clientId)              → 'rollover' | 'no-rollover' | null
 *   setDecision(clientId, decision)    → Promise<void> (pass null to undo)
 *   loading                            → boolean
 */
export function useOnboardingRollover() {
  const [decisions, setDecisions] = useState({});
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch('/api/mb-onboarding-rollover')
      .then((r) => (r.ok ? r.json() : { decisions: {} }))
      .then((d) => setDecisions(d.decisions || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getDecision = useCallback(
    (clientId) => decisions[String(clientId)]?.decision ?? null,
    [decisions]
  );

  const setDecision = useCallback(async (clientId, decision) => {
    const id = String(clientId);

    // Optimistic update
    setDecisions((prev) => {
      const next = { ...prev };
      if (!decision) {
        delete next[id];
      } else {
        next[id] = { decision, decidedAt: new Date().toISOString() };
      }
      return next;
    });

    try {
      const res = await fetch('/api/mb-onboarding-rollover', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clientId: id, decision }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.decisions) setDecisions(data.decisions);
      }
    } catch {
      // Keep optimistic update on network error
    }
  }, []);

  return { decisions, getDecision, setDecision, loading };
}
