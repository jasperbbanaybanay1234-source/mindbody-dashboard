import { useState } from 'react';
import { Cake, Star, Users, CheckCircle } from 'lucide-react';

function DaysChip({ days }) {
  if (days === 0) return <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium text-emerald-400">Today!</span>;
  if (days === 1) return <span className="rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400">Tomorrow</span>;
  return <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-xs text-gray-400">{days}d</span>;
}

function ClientRow({ c, sub }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-200 truncate">{c.name}</p>
        <p className="text-xs text-gray-500">{c.date} · {sub}</p>
      </div>
      <DaysChip days={c.daysUntil} />
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="py-8 text-center">
      <CheckCircle className="h-6 w-6 text-gray-700 mx-auto mb-2" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

export default function CelebrationsPanel({ data, loading, error }) {
  const [tab, setTab] = useState('active');

  const birthdaysActive   = data?.birthdaysActive   || [];
  const birthdaysInactive = data?.birthdaysInactive || [];
  const anniversaries     = data?.anniversaries     || [];

  const tabs = [
    { key: 'active',       label: 'Birthdays',         icon: Cake,  count: birthdaysActive.length   },
    { key: 'inactive',     label: 'Lapsed Birthdays',  icon: Users, count: birthdaysInactive.length },
    { key: 'anniversaries',label: 'Anniversaries',     icon: Star,  count: anniversaries.length     },
  ];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Cake className="h-4 w-4 text-pink-400" />
          <h2 className="font-semibold text-white">Upcoming Celebrations</h2>
        </div>
        <p className="text-xs text-gray-500">Next 30 days</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm border-b-2 transition-colors ${
              tab === key
                ? 'border-emerald-500 text-emerald-400 bg-gray-800/40'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/20'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {!loading && count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                key === 'inactive'
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'bg-gray-700/60 text-gray-400'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
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

        {!loading && !error && tab === 'active' && (
          birthdaysActive.length === 0
            ? <EmptyState message="No active member birthdays in the next 30 days" />
            : birthdaysActive.map(c => <ClientRow key={c.id} c={c} sub={`turning ${c.age}`} />)
        )}

        {!loading && !error && tab === 'inactive' && (
          birthdaysInactive.length === 0
            ? <EmptyState message="No lapsed member birthdays in the next 30 days" />
            : <>
                <p className="px-5 py-2.5 text-xs text-orange-400/70 bg-orange-500/5 border-b border-gray-800/50">
                  Reach out — a birthday is a great reason to reconnect
                </p>
                {birthdaysInactive.map(c => <ClientRow key={c.id} c={c} sub={`turning ${c.age}`} />)}
              </>
        )}

        {!loading && !error && tab === 'anniversaries' && (
          anniversaries.length === 0
            ? <EmptyState message="No anniversaries in the next 30 days" />
            : anniversaries.map(c => (
                <ClientRow key={c.id} c={c} sub={`${c.years} ${c.years === 1 ? 'year' : 'years'}`} />
              ))
        )}
      </div>
    </div>
  );
}
