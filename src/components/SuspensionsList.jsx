import { useEffect } from 'react';
import { PauseCircle, CheckCircle, Calendar } from 'lucide-react';

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('suspend')) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  if (s.includes('inactive') || s.includes('declined')) return 'text-red-400 bg-red-500/10 border-red-500/20';
  return 'text-gray-400 bg-gray-700/30 border-gray-700/50';
}

function resumeLabel(isoDate) {
  if (!isoDate) return null;
  let d;
  try { d = new Date(isoDate); } catch { return null; }
  if (isNaN(d.getTime())) return null;

  const now  = new Date();
  const days = Math.round((d - now) / 86400000);

  if (days < -1)  return `Ended ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (days < 0)   return 'Ended yesterday';
  if (days === 0) return 'Resumes today';
  if (days === 1) return 'Resumes tomorrow';
  if (days < 60)  return `Resumes ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ${days}d`;
  return `Resumes ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function startDateLabel(info) {
  if (!info) return null;
  const raw =
    info.SuspendedDate || info.suspendedDate ||
    info.StartDate     || info.startDate     ||
    info.BookedDate    || info.bookedDate    ||
    null;
  if (!raw) return null;
  let d;
  try { d = new Date(raw); } catch { return null; }
  if (isNaN(d.getTime())) return null;
  return `From ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
}

export default function SuspensionsList({ data, loading, error }) {
  const clients = data?.suspensions || [];

  // DevTools diagnostic — helps identify what Mindbody actually returns
  useEffect(() => {
    if (clients.length > 0) {
      console.log('[SuspensionsList] sample:', {
        resumeDate:     clients[0]?.resumeDate,
        suspensionInfo: clients[0]?.suspensionInfo,
        status:         clients[0]?.status,
      });
    }
  }, [clients]);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-4 w-4 text-orange-400" />
          <h2 className="font-semibold text-white">On Suspension</h2>
          {!loading && (
            <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Hold or non-active status</p>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-72 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="py-10 text-center">
            <CheckCircle className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No suspended clients</p>
          </div>
        )}

        {!loading && !error && clients.map((client) => {
          const lbl      = resumeLabel(client.resumeDate);
          const startLbl = startDateLabel(client.suspensionInfo);
          const reason   = client.suspensionInfo?.Reason || client.suspensionInfo?.reason ||
                           (client.suspensionInfo?.ReasonId ? `Reason #${client.suspensionInfo.ReasonId}` : null);

          return (
            <div
              key={client.id}
              className="px-5 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>

                  {/* Resume date — prominent orange line */}
                  {lbl ? (
                    <p className="flex items-center gap-1.5 mt-1 text-xs font-medium text-orange-400">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {lbl}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-700">No end date set</p>
                  )}

                  {/* Reason + start date secondary row */}
                  {(reason || startLbl) && (
                    <p className="mt-0.5 text-xs text-gray-600 truncate">
                      {[reason, startLbl].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor(client.status)}`}>
                  {client.status || 'Suspended'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
