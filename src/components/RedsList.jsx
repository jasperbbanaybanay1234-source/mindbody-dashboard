import { useState, useCallback } from 'react';
import { TrendingDown, Search, CheckCircle, ArrowUp, ArrowDown, ArrowRight, Sparkles, ChevronDown } from 'lucide-react';
import { formatDistanceToNow, parseISO, format, differenceInDays } from 'date-fns';
import ContactModal          from './ContactModal.jsx';
import WeeklyAttendancePanel from './WeeklyAttendancePanel.jsx';

function TrendBadge({ trend }) {
  if (!trend) return null;
  const { direction, avg } = trend;

  if (direction === 'new') {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-400">
        <Sparkles className="h-3 w-3" />
        New
      </span>
    );
  }

  const Icon  = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : ArrowRight;
  const color = direction === 'up' ? 'text-emerald-400' : direction === 'down' ? 'text-red-400' : 'text-gray-400';

  return (
    <span className={`flex items-center gap-0.5 text-xs tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="text-gray-500">avg {avg}/wk</span>
    </span>
  );
}

export default function RedsList({ data: propData, loading: propLoading, error: propError, contactLog, onboardingIds = new Set() }) {
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [period, setPeriod]         = useState('7days');
  const [localData, setLocalData]   = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const data    = localData    ?? propData;
  const loading = localLoading || (localData === null && propLoading);
  const error   = localError   ?? propError;

  const changePeriod = useCallback(async (newPeriod) => {
    if (newPeriod === period) return;
    setPeriod(newPeriod);
    if (newPeriod === '7days' && propData) {
      setLocalData(null);
      setLocalError(null);
      return;
    }
    setLocalLoading(true);
    setLocalError(null);
    try {
      const res  = await fetch(`/api/mb-client-analytics?period=${newPeriod}`);
      const json = await res.json();
      setLocalData(json);
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setLocalLoading(false);
    }
  }, [period, propData]);

  // Exclude clients currently in the onboarding pipeline — they're tracked separately
  const clients = (data?.reds || []).filter((c) => !onboardingIds.has(c.id));

  const isContacted   = contactLog?.isContacted  ?? (() => false);
  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  });

  const contactedCount = clients.filter((c) => isContacted(c.id)).length;
  const toggleExpand   = (id) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-red-400" />
          <h2 className="font-semibold text-white">Red's List</h2>
          {!loading && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs">
            {[
              { key: '7days',        label: 'Last 7 days' },
              { key: 'calendarWeek', label: 'This week'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => changePeriod(key)}
                className={`px-3 py-1.5 transition-colors ${
                  period === key
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
            className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-8 pr-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-red-500 focus:outline-none"
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
              {search ? 'No matches found' : "Red's list is clear"}
            </p>
          </div>
        )}

        {!loading && !error && filtered.map((client) => {
          const wasContacted = isContacted(client.id);
          const lastLog      = contactLog?.contacted?.[String(client.id)];
          const isExpanded   = expandedId === client.id;
          const lastSeen     = client.lastSessionDate
            ? (() => {
                const days = differenceInDays(new Date(), parseISO(client.lastSessionDate));
                if (days === 0) return 'Last seen today';
                if (days === 1) return 'Last seen yesterday';
                if (days < 14) return `Last seen ${days}d ago`;
                return `Last seen ${format(parseISO(client.lastSessionDate), 'd MMM')}`;
              })()
            : null;

          return (
            <div key={client.id} className="border-b border-gray-800/60 last:border-0">
              {/* Main row — click anywhere to expand */}
              <div
                className={`flex items-center justify-between px-5 py-3 hover:bg-gray-800/40 transition-colors cursor-pointer select-none ${wasContacted ? 'opacity-60' : ''}`}
                onClick={() => toggleExpand(client.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>
                    <TrendBadge trend={client.trend} />
                    {wasContacted && (
                      <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-500">
                        <CheckCircle className="h-3 w-3" />
                        {lastLog ? formatDistanceToNow(new Date(lastLog.at), { addSuffix: true }) : 'Contacted'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {client.email || client.phone || 'No contact details'}
                    {client.service && <span className="ml-2 text-gray-600">{client.service}</span>}
                    {lastSeen      && <span className="ml-2 text-gray-600">{lastSeen}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(client); }}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                      wasContacted
                        ? 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    }`}
                  >
                    {wasContacted ? 'View log' : 'Contact'}
                  </button>
                  <ChevronDown className={`h-3.5 w-3.5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expandable attendance panel */}
              {isExpanded && <WeeklyAttendancePanel client={client} status="red" />}
            </div>
          );
        })}
      </div>

      {!loading && clients.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Showing {filtered.length} of {clients.length} · {contactedCount} contacted in last 7 days
          </p>
        </div>
      )}

      {selected && (
        <ContactModal
          client={selected}
          onClose={() => setSelected(null)}
          onContacted={() => {}}
          logContact={logContact}
          getClientLogs={getClientLogs}
        />
      )}
    </div>
  );
}
