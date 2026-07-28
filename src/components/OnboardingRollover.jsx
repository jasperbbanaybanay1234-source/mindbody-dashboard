import { useState } from 'react';
import { CheckCircle, XCircle, Repeat } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import ContactModal from './ContactModal.jsx';

/**
 * Automatic rollover outcome for clients whose 28 Day Kickstarter / Split the Fee
 * product has already expired. Computed server-side in mb-onboarding.js — this is
 * purely informational and separate from the manual ✓/✗ buttons on the board cards.
 */

function fmt(dateStr) {
  if (!dateStr) return '—';
  try   { return format(parseISO(dateStr), 'd MMM yyyy'); }
  catch { return dateStr; }
}

function Section({ title, subtitle, tone, clients, onContact }) {
  const isGood = tone === 'good';
  const Icon   = isGood ? CheckCircle : XCircle;

  const accent = isGood
    ? { text: 'text-orange-400', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' }
    : { text: 'text-gray-400',   badge: 'bg-gray-700/60 text-gray-400 border-gray-600/40' };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-gray-800">
        <Icon className={`h-4 w-4 ${accent.text}`} />
        <h3 className="font-semibold text-white">{title}</h3>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${accent.badge}`}>
          {clients.length}
        </span>
        <p className="ml-auto text-xs text-gray-500 hidden sm:block">{subtitle}</p>
      </div>

      {/* List */}
      {clients.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-600">No clients</p>
      ) : (
        <div className="divide-y divide-gray-800/60 overflow-y-auto max-h-96 scrollbar-thin">
          {clients.map((client) => (
            <div
              key={client.id}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-800/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>
                  <span className="shrink-0 text-[10px] font-medium text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">
                    {client.shortProduct || client.product}
                  </span>
                  {client.membership && (
                    <span className="shrink-0 rounded-full border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400">
                      {client.membership}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5 truncate">
                  Expired {fmt(client.endDate)}
                  {client.membershipStartDate && (
                    <span className="ml-2 text-gray-500">New membership from {fmt(client.membershipStartDate)}</span>
                  )}
                </p>
                <p className="text-xs text-gray-600 truncate">
                  {client.email || 'No email'}
                  {client.phone && <span className="ml-2 text-gray-500">{client.phone}</span>}
                </p>
              </div>

              <button
                onClick={() => onContact(client)}
                className="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                Contact
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OnboardingRollover({ rolledOver = [], notRolledOver = [], contactLog }) {
  const [selected, setSelected] = useState(null);

  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  if (rolledOver.length === 0 && notRolledOver.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-orange-400" />
        <h2 className="font-semibold text-white">Rollover outcomes</h2>
        <p className="text-xs text-gray-500">Automatic — based on memberships purchased after the program expired</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section
          title="Rolled Over"
          subtitle="Membership starts on/after expiry"
          tone="good"
          clients={rolledOver}
          onContact={setSelected}
        />
        <Section
          title="Not Rolled Over"
          subtitle="No membership found after expiry"
          tone="bad"
          clients={notRolledOver}
          onContact={setSelected}
        />
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
