import { useState, useEffect } from 'react';
import { Users, ArrowUp, ArrowDown, ArrowRight, Sparkles, RefreshCw, CheckCircle, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ContactModal          from './ContactModal.jsx';
import WeeklyAttendancePanel from './WeeklyAttendancePanel.jsx';

const PERIODS = [
  { key: '7days',        label: 'Last 7 Days' },
  { key: 'calendarWeek', label: 'Last Cal. Week' },
];

const SEGMENTS = [
  {
    key:    'atRisk',
    label:  'Moderate',
    desc:   '1–2 sessions',
    dot:    'bg-orange-400',
    badge:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
    active: 'border-orange-400 text-orange-400',
    status: 'moderate',
  },
  {
    key:    'engaged',
    label:  'Engaged',
    desc:   '3+ sessions',
    dot:    'bg-emerald-400',
    badge:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    active: 'border-emerald-400 text-emerald-400',
    status: 'engaged',
  },
];

function TrendIndicator({ trend }) {
  if (!trend) return null;
  const { direction, avg } = trend;
  if (direction === 'new') {
    return (
      <span className="flex items-center gap-0.5 text-xs text-blue-400">
        <Sparkles className="h-3 w-3" />
        <span className="text-gray-500">new</span>
      </span>
    );
  }
  const Icon  = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : ArrowRight;
  const color = direction === 'up' ? 'text-emerald-400' : direction === 'down' ? 'text-red-400' : 'text-gray-400';
  return (
    <span className={`flex items-center gap-0.5 text-xs tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="text-gray-500">{avg}/wk</span>
    </span>
  );
}

export default function FringeClientsTable({ contactLog, onboardingIds = new Set() }) {
  const [period, setPeriod]       = useState('7days');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab]   = useState('atRisk');
  const [selected, setSelected]     = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const isContacted   = contactLog?.isContacted  ?? (() => false);
  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/mb-client-analytics?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [period]);

  const segments       = data?.fringeSegments || {};
  const currentSeg     = SEGMENTS.find((s) => s.key === activeTab);
  // Exclude onboarding clients — they are tracked on the Onboarding tab
  const currentClients = (segments[activeTab]?.clients || []).filter((c) => !onboardingIds.has(c.id));
  const currentCount   = currentClients.length;

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400" />
          <h2 className="font-semibold text-white">Fringe Clients</h2>
        </div>

        {/* Period filter */}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          {loading && <RefreshCw className="h-3.5 w-3.5 text-gray-500 animate-spin self-center ml-1" />}
        </div>
      </div>

      {/* Segment tabs */}
      <div className="flex border-b border-gray-800">
        {SEGMENTS.map((seg) => {
          // Show the count after filtering out onboarding clients
          const count    = (segments[seg.key]?.clients || []).filter((c) => !onboardingIds.has(c.id)).length;
          const isActive = activeTab === seg.key;
          return (
            <button
              key={seg.key}
              onClick={() => setActiveTab(seg.key)}
              className={`flex-1 px-3 py-3 text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? `${seg.active} bg-gray-800/40`
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/20'
              }`}
            >
              <span className="flex flex-col items-center gap-1">
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${seg.dot}`} />
                  {seg.label}
                </span>
                {!loading && (
                  <span className="text-[10px] font-bold tabular-nums">{count}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      {currentSeg && (
        <div className="px-5 py-2 border-b border-gray-800/60">
          <p className="text-xs text-gray-500">{currentSeg.desc}</p>
        </div>
      )}

      {/* Client list */}
      <div className="overflow-y-auto max-h-80 scrollbar-thin flex-1">
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

        {!loading && !error && currentClients.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-600">No clients in this segment</p>
        )}

        {!loading && !error && currentClients.map((client) => {
          const fullyUtil    = client.isFullyUtilising;
          const wasContacted = isContacted(client.id);
          const lastLog      = contactLog?.contacted?.[String(client.id)];
          const isExpanded   = expandedId === client.id;

          return (
            <div
              key={client.id}
              className={`border-b border-gray-800/50 last:border-0 ${
                fullyUtil ? 'border-l-2 border-l-emerald-500' : ''
              }`}
            >
              {/* Main row — click to expand */}
              <div
                className={`flex items-center gap-3 px-5 py-2.5 transition-colors cursor-pointer select-none ${
                  fullyUtil
                    ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                    : 'hover:bg-gray-800/30'
                } ${wasContacted ? 'opacity-60' : ''}`}
                onClick={() => toggleExpand(client.id)}
              >
                {/* Name + trend */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm truncate ${fullyUtil ? 'text-emerald-200 font-medium' : 'text-gray-200'}`}>
                      {client.name || 'Unknown'}
                    </p>
                    {fullyUtil && (
                      <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                        2× ✓
                      </span>
                    )}
                    <TrendIndicator trend={client.trend} />
                    {wasContacted && (
                      <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-500">
                        <CheckCircle className="h-3 w-3" />
                        {lastLog ? formatDistanceToNow(new Date(lastLog.at), { addSuffix: true }) : 'Contacted'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 truncate">{client.email || client.phone || '–'}</p>
                </div>

                {/* Session count badge */}
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${
                  fullyUtil ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : currentSeg?.badge
                }`}>
                  {client.sessionsThisWeek} {client.sessionsThisWeek === 1 ? 'session' : 'sessions'}
                </span>

                {/* Contact button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setSelected(client); }}
                  className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    wasContacted
                      ? 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                      : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {wasContacted ? 'View log' : 'Contact'}
                </button>

                <ChevronDown className={`shrink-0 h-3.5 w-3.5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>

              {/* Expandable attendance panel */}
              {isExpanded && <WeeklyAttendancePanel client={client} status={currentSeg?.status || 'moderate'} />}
            </div>
          );
        })}
      </div>

      {!loading && currentCount > currentClients.length && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Showing {currentClients.length} of {currentCount}
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
