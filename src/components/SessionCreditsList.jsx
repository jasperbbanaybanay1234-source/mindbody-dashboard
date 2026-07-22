import { Coins, ChevronDown } from 'lucide-react';
import { useState } from 'react';

function creditColor(n) {
  if (n >= 10) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (n >= 5)  return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return              'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
}

export default function SessionCreditsList({ data, loading, error }) {
  const [expandedId, setExpandedId] = useState(null);
  const clients = data?.sessionCredits || [];

  const toggle = (id) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-yellow-400" />
          <h2 className="font-semibold text-white">Accumulated Credits</h2>
          {!loading && clients.length > 0 && (
            <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400 border border-yellow-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Unused PT / SP session credits</p>
      </div>

      <div className="overflow-y-auto max-h-80 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-600">No accumulated credits detected</p>
            <p className="text-xs text-gray-700 mt-1">Only clients seen in the last 28 days are checked</p>
          </div>
        )}

        {!loading && !error && clients.map((client) => {
          const isExpanded = expandedId === client.id;
          const badgeCls   = creditColor(client.credits);

          return (
            <div key={client.id} className="border-b border-gray-800/50 last:border-0">
              <div
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors cursor-pointer select-none"
                onClick={() => toggle(client.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>
                  {client.email && (
                    <p className="text-xs text-gray-600 truncate">{client.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${badgeCls}`}>
                    {client.credits} credit{client.credits !== 1 ? 's' : ''}
                  </span>
                  {client.services?.length > 1 && (
                    <ChevronDown className={`h-3.5 w-3.5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </div>

              {/* Expanded: breakdown by service */}
              {isExpanded && client.services?.length > 0 && (
                <div className="px-5 pb-3 pt-1 bg-gray-800/20 border-t border-gray-800/50 space-y-1.5">
                  {client.services.map((svc, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400 truncate">{svc.name || 'Unnamed service'}</span>
                      <span className="shrink-0 ml-3 text-gray-300 font-medium tabular-nums">
                        {svc.remaining} remaining
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && clients.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">Checked for clients active in last 28 days · up to 60 clients</p>
        </div>
      )}
    </div>
  );
}
