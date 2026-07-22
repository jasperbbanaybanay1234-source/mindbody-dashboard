import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing onboarding task completion state.
 * Persists via Netlify Blobs through /api/mb-onboarding-tasks.
 *
 * Returns:
 *   isComplete(clientId, taskId)   → boolean
 *   toggleTask(clientId, taskId)   → Promise<void>
 *   completions                    → { [clientId]: taskId[] }
 *   loading                        → boolean
 */
export function useOnboardingTasks() {
  const [completions, setCompletions] = useState({});
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    fetch('/api/mb-onboarding-tasks')
      .then((r) => (r.ok ? r.json() : { completions: {} }))
      .then((d) => setCompletions(d.completions || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isComplete = useCallback(
    (clientId, taskId) =>
      (completions[String(clientId)] || []).includes(taskId),
    [completions]
  );

  const toggleTask = useCallback(async (clientId, taskId) => {
    const id      = String(clientId);
    const current = completions[id] || [];
    const updated = current.includes(taskId)
      ? current.filter((t) => t !== taskId)
      : [...current, taskId];

    // Optimistic update
    setCompletions((prev) => ({ ...prev, [id]: updated }));

    try {
      const res = await fetch('/api/mb-onboarding-tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clientId: id, taskId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.completions) setCompletions(data.completions);
      }
    } catch {
      // Keep the optimistic update even on network error
    }
  }, [completions]);

  return { completions, isComplete, toggleTask, loading };
}
