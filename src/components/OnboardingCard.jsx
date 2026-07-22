import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, BookOpen, MessageSquare, CheckCircle, X, RotateCcw } from 'lucide-react';
import { TASKS_BY_WEEK } from '../utils/onboardingTasks.js';
import ContactModal from './ContactModal.jsx';

// Short-program products that get removed from pipeline on no-rollover
const SHORT_PRODUCTS = new Set(['3-Session', '14-Day']);

const PRODUCT_COLORS = {
  'Strong Dad': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Strong Mum': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  '4-Week':     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  '14-Day':     'bg-violet-500/15 text-violet-400 border-violet-500/30',
  '3-Session':  'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

function productColor(short = '') {
  return PRODUCT_COLORS[short] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
}

function SessionPips({ weekSessions, currentWeek }) {
  const WEEK_COLORS = ['text-blue-400', 'text-amber-400', 'text-violet-400', 'text-emerald-400'];
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {weekSessions.map((count, i) => {
        const w         = i + 1;
        const isCurrent = w === currentWeek;
        const color     = WEEK_COLORS[i];
        return (
          <span
            key={w}
            className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${isCurrent ? `${color} font-semibold` : 'text-gray-700'}`}
          >
            <span className={`text-[10px] font-medium ${isCurrent ? color : 'text-gray-700'}`}>W{w}</span>
            <span className={isCurrent ? color : 'text-gray-600'}>{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function OnboardingCard({
  client,
  isComplete,
  toggleTask,
  onOpenTask,
  contactLog,
  getDecision,
  setDecision,
}) {
  const [showContact, setShowContact] = useState(false);

  const weekTasks  = TASKS_BY_WEEK[client.week] || [];
  const startDate  = parseISO(client.startDate);
  const doneTasks  = weekTasks.filter((t) => isComplete(client.id, t.id)).length;
  const allDone    = doneTasks === weekTasks.length && weekTasks.length > 0;

  const decision   = getDecision(client.id);
  const isRollover = decision === 'rollover';
  const isShort    = SHORT_PRODUCTS.has(client.shortProduct);

  const wasContacted   = contactLog?.isContacted(client.id) ?? false;

  // Card border/bg based on priority: rollover > at-risk > all tasks done
  const cardClass = isRollover
    ? 'border-emerald-500/40 bg-emerald-950/10'
    : client.isAtRisk
      ? 'border-red-500/30 bg-red-950/10'
      : allDone
        ? 'border-emerald-500/20 bg-emerald-950/5'
        : 'border-gray-800';

  return (
    <div className={`rounded-lg border bg-gray-900 p-3.5 space-y-3 transition-colors ${cardClass}`}>

      {/* ── Row 1: name + badges + contact button ── */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-100 truncate">{client.name || 'Unknown'}</p>
            {client.isAtRisk && !isRollover && (
              <span className="shrink-0 flex items-center gap-0.5 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                <AlertTriangle className="h-2.5 w-2.5" />
                No sessions
              </span>
            )}
            {isRollover && (
              <span className="shrink-0 flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                <CheckCircle className="h-2.5 w-2.5" />
                Rolling over
              </span>
            )}
          </div>

          {/* Contact details */}
          <div className="mt-0.5 space-y-px">
            {client.email && (
              <p className="text-[11px] text-gray-600 truncate">{client.email}</p>
            )}
            {client.phone && (
              <p className="text-[11px] text-gray-500 font-medium">{client.phone}</p>
            )}
            {!client.email && !client.phone && (
              <p className="text-[11px] text-gray-700">No contact details</p>
            )}
          </div>
        </div>

        {/* Notes / contact log button */}
        <button
          onClick={() => setShowContact(true)}
          title="Notes & contact log"
          className={`shrink-0 rounded-lg border p-1.5 transition-colors ${
            wasContacted
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              : 'border-gray-700 bg-gray-800/60 text-gray-600 hover:text-gray-300 hover:bg-gray-700'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Row 2: product badge + start date ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${productColor(client.shortProduct)}`}>
          {client.shortProduct || client.product}
        </span>
        <span className="text-[11px] text-gray-600">
          Started {format(startDate, 'd MMM')}
        </span>
      </div>

      {/* ── Row 3: session counts per week ── */}
      <div className="flex items-center justify-between">
        <SessionPips weekSessions={client.weekSessions} currentWeek={client.week} />
        <span className="text-[11px] text-gray-600 tabular-nums shrink-0 ml-2">
          {client.totalSessions} total
        </span>
      </div>

      {/* ── Task checklist for current week ── */}
      {weekTasks.length > 0 && (
        <div className="border-t border-gray-800/60 pt-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">
            Week {client.week} tasks · {doneTasks}/{weekTasks.length}
          </p>
          {weekTasks.map((task) => {
            const done = isComplete(client.id, task.id);
            return (
              <div key={task.id} className="flex items-center gap-2 group">
                {/* Checkbox */}
                <button
                  onClick={() => toggleTask(client.id, task.id)}
                  className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                  }`}
                >
                  {done && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Task label */}
                <span className={`flex-1 text-xs leading-snug truncate ${done ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                  {task.label}
                </span>

                {/* Script/reference button — visible on hover */}
                <button
                  onClick={() => onOpenTask(task)}
                  title="View script"
                  className="shrink-0 p-1 rounded text-gray-700 hover:text-gray-400 hover:bg-gray-800 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <BookOpen className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Rollover decision ── */}
      <div className="border-t border-gray-800/60 pt-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">
          Membership rollover
          {isShort && !decision && (
            <span className="ml-1.5 font-normal normal-case text-gray-700">— no decision removes from pipeline</span>
          )}
        </p>

        {!decision ? (
          /* No decision yet — show both options */
          <div className="flex gap-1.5">
            <button
              onClick={() => setDecision(client.id, 'rollover')}
              className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              ✓ Rolling over
            </button>
            <button
              onClick={() => setDecision(client.id, 'no-rollover')}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-colors"
            >
              ✗ Not rolling
            </button>
          </div>
        ) : (
          /* Decision made — show status + undo */
          <div className="flex items-center justify-between">
            <span className={`flex items-center gap-1.5 text-xs font-medium ${isRollover ? 'text-emerald-400' : 'text-gray-500'}`}>
              {isRollover ? (
                <><CheckCircle className="h-3.5 w-3.5" /> Rolling over to membership</>
              ) : (
                <><X className="h-3.5 w-3.5" /> Not rolling over{isShort ? ' · removed from pipeline' : ''}</>
              )}
            </span>
            <button
              onClick={() => setDecision(client.id, null)}
              title="Undo decision"
              className="flex items-center gap-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors ml-2 shrink-0"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Undo
            </button>
          </div>
        )}
      </div>

      {/* ── Contact modal ── */}
      {showContact && (
        <ContactModal
          client={client}
          onClose={() => setShowContact(false)}
          onContacted={() => {}}
          logContact={contactLog?.logContact ?? null}
          getClientLogs={contactLog?.getClientLogs ?? null}
        />
      )}
    </div>
  );
}
