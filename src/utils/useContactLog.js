/**
 * useContactLog — fetches and manages the persistent contact log.
 *
 * Returns:
 *   contacted        Map of clientId → most-recent log entry (within 7 days)
 *   isContacted(id)  true if contacted within last 7 days
 *   logContact(id, name, note)  POST to save a new entry; updates local state immediately
 *   getClientLogs(id)  fetch full history for one client
 *   loadingLog       true while the initial fetch is running
 */
import { useState, useEffect, useCallback } from 'react';

export function useContactLog() {
  const [contacted, setContacted] = useState({}); // { clientId: { at, note, name } }
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    fetch('/api/mb-contact-logs?recent=true')
      .then((r) => (r.ok ? r.json() : { contacted: {} }))
      .then((d) => setContacted(d.contacted || {}))
      .catch(() => {})
      .finally(() => setLoadingLog(false));
  }, []);

  const isContacted = useCallback(
    (clientId) => Boolean(contacted[String(clientId)]),
    [contacted]
  );

  const logContact = useCallback(async (clientId, clientName, note) => {
    const res  = await fetch('/api/mb-contact-client', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId: String(clientId), clientName, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.logged) {
      throw new Error(data.error || `Contact log failed (${res.status})`);
    }
    setContacted((prev) => ({
      ...prev,
      [String(clientId)]: { at: new Date().toISOString(), note, name: clientName },
    }));
    return data;
  }, []);

  const getClientLogs = useCallback(async (clientId) => {
    try {
      const res  = await fetch(`/api/mb-contact-logs?clientId=${clientId}`);
      const data = await res.json();
      return data.logs || [];
    } catch {
      return [];
    }
  }, []);

  return { contacted, isContacted, logContact, getClientLogs, loadingLog };
}
