import { useState } from 'react';
import { UserX, Search, CheckCircle } from 'lucide-react';
import ContactModal from './ContactModal.jsx';

export default function InactiveClientsList({ data, loading, error }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [contacted, setContacted] = useState(new Set());

  const clients = data?.inactiveClients || [];

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  });

  function handleContacted(id) {
    setContacted((prev) => new Set([...prev, id]));
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <UserX className="h-4 w-4 text-amber-400" />
          <h2 className="font-semibold text-white">Inactive Clients</h2>
          {!loading && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Visited last week · missed this week</p>
      </div>

      {/* Search */}
      <div className="px-5 py-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-8 pr-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-96 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-12 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {search ? 'No matches found' : 'No inactive clients this week'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.map((client) => {
          const isContacted = contacted.has(client.id);
          return (
            <div
              key={client.id}
              className={`flex items-center justify-between px-5 py-3 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40 transition-colors ${isContacted ? 'opacity-50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>
                  {isContacted && (
                    <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle className="h-3 w-3" /> Contacted
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {client.email || client.phone || 'No contact details'}
                </p>
              </div>
              <button
                onClick={() => setSelected(client)}
                disabled={isContacted}
                className="ml-4 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Contact
              </button>
            </div>
          );
        })}
      </div>

      {!loading && clients.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Showing {filtered.length} of {clients.length} · {contacted.size} contacted this session
          </p>
        </div>
      )}

      {selected && (
        <ContactModal
          client={selected}
          onClose={() => setSelected(null)}
          onContacted={handleContacted}
        />
      )}
    </div>
  );
}
