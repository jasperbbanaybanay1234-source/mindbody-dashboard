import { useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { format, parseISO, formatDistanceToNow, differenceInDays } from 'date-fns';
import ContactModal from './ContactModal.jsx';

function lastSeenText(dateStr) {
  if (!dateStr) return null;
  const days = differenceInDays(new Date(), parseISO(dateStr));
  if (days === 0) return 'Last seen today';
  if (days === 1) return 'Last seen yesterday';
  if (days < 14) return `Last seen ${days}d ago`;
  return `Last seen ${format(parseISO(dateStr), 'd MMM')}`;
}

export default function OnboardingReds({ clients = [], contactLog }) {
  const [selected, setSelected] = useState(null);

  const isContacted   = contactLog?.isContacted  ?? (() => false);
  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  if (clients.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/20 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-gray-800">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <h2 className="font-semibold text-white">Pipeline Reds</h2>
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
          {clients.length}
        </span>
        <p className="ml-auto text-xs text-gray-500">0 sessions in current onboarding week</p>
      </div>

      {/* List */}
      <div className="divide-y divide-gray-800/60">
        {clients.map((client) => {
          const wasContacted = isContacted(client.id);
          const lastLog      = contactLog?.contacted?.[String(client.id)];
          const startDate    = parseISO(client.startDate);
          const dayText      = `Day ${client.daysSinceStart + 1} of 28`;
          const lastSeen     = lastSeenText(client.lastSessionDate);

          return (
            <div
              key={client.id}
              className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-800/30 ${wasContacted ? 'opacity-60' : ''}`}
            >
              {/* Week badge */}
              <div className="shrink-0 h-8 w-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <span className="text-xs font-bold text-red-400">W{client.week}</span>
              </div>

              {/* Client info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>
                  <span className="shrink-0 text-[10px] font-medium text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">
                    {client.shortProduct || client.product}
                  </span>
                  {wasContacted && (
                    <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle className="h-3 w-3" />
                      {lastLog ? formatDistanceToNow(new Date(lastLog.at), { addSuffix: true }) : 'Contacted'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5 truncate">
                  {dayText} · Started {format(startDate, 'd MMM')}
                  {lastSeen && <span className="ml-2 text-gray-700">{lastSeen}</span>}
                  {(client.email || client.phone) && (
                    <span className="ml-2">{client.email || client.phone}</span>
                  )}
                </p>
              </div>

              {/* Contact button */}
              <button
                onClick={() => setSelected(client)}
                className={`shrink-0 rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  wasContacted
                    ? 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                }`}
              >
                {wasContacted ? 'View log' : 'Contact'}
              </button>
            </div>
          );
        })}
      </div>

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
