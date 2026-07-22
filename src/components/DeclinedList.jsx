import { CreditCard, CheckCircle } from 'lucide-react';

export default function DeclinedList({ data, loading, error }) {
  const clients = data?.declinedClients || [];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-red-400" />
          <h2 className="font-semibold text-white">Declined Members</h2>
          {!loading && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Status: Declined · action required</p>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-72 scrollbar-thin">
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
          <div className="py-10 text-center">
            <CheckCircle className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No declined members</p>
          </div>
        )}

        {!loading && !error && clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 truncate">{client.name || 'Unknown'}</p>
              <p className="text-xs text-gray-500 truncate">
                {client.email || client.phone || 'No contact details'}
              </p>
            </div>
            <span className="ml-3 shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
              Declined
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
