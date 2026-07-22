import { Dumbbell, CheckCircle } from 'lucide-react';

export default function OpenGymList({ data, loading, error }) {
  const clients = data?.openGym || [];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-blue-400" />
          <h2 className="font-semibold text-white">Open Gym</h2>
          {!loading && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Sessions this week</p>
      </div>

      <div className="overflow-y-auto max-h-64 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="py-8 text-center">
            <CheckCircle className="h-7 w-7 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-600">No open gym sessions this week</p>
          </div>
        )}

        {!loading && !error && clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>
              {client.email && (
                <p className="text-xs text-gray-600 truncate">{client.email}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-blue-400">
              {client.count} {client.count === 1 ? 'session' : 'sessions'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
