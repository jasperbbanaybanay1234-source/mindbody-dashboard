import { ClipboardList, CheckCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

function typeLabel(type) {
  if (type === 'pt') return { text: 'PT',  cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
  if (type === 'sp') return { text: 'SP',  cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
  return               { text: 'Other', cls: 'text-gray-400 bg-gray-700/30 border-gray-700/50' };
}

export default function UncheckedSessionsList({ data, loading, error }) {
  const sessions = data?.unchecked || [];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-400" />
          <h2 className="font-semibold text-white">Unchecked Sessions</h2>
          {!loading && sessions.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
              {sessions.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Past sessions · no payment allocated</p>
      </div>

      <div className="overflow-y-auto max-h-64 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="py-8 text-center">
            <CheckCircle className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">All sessions checked off</p>
          </div>
        )}

        {!loading && !error && sessions.map((session) => {
          const { text, cls } = typeLabel(session.type);
          let dateStr = '';
          try { dateStr = format(parseISO(session.startTime), 'EEE d MMM, h:mm a'); } catch { dateStr = session.startTime; }

          return (
            <div
              key={session.id}
              className="px-5 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-200 truncate">{session.clientName || 'Unknown'}</p>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
                      {text}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {dateStr}
                    {session.staffName && <span className="ml-2 text-gray-600">· {session.staffName}</span>}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                  Unchecked
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
