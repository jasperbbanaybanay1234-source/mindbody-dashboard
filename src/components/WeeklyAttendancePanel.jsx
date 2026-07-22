/**
 * Expandable panel shown beneath a client row.
 * Displays their status badge and a colour-coded 4-week attendance table.
 *
 * Colour scale per week:
 *   0        → red
 *   1–2      → amber
 *   3+       → green
 */

const STATUS_META = {
  red:      { label: "Red's List", pill: 'text-red-400 bg-red-500/10 border-red-500/20' },
  moderate: { label: 'Moderate',   pill: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  engaged:  { label: 'Engaged',    pill: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
};

function sessionColor(count) {
  if (count === 0)  return { cell: 'bg-red-500/15 border-red-500/20',     text: 'text-red-400' };
  if (count <= 2)   return { cell: 'bg-amber-500/15 border-amber-500/20', text: 'text-amber-400' };
  return              { cell: 'bg-emerald-500/15 border-emerald-500/20',  text: 'text-emerald-400' };
}

export default function WeeklyAttendancePanel({ client, status }) {
  const meta = STATUS_META[status] || STATUS_META.red;
  const wa   = client.weeklyAttendance || { w1: 0, w2: 0, w3: 0, w4: 0 };

  // Ordered oldest → newest (left to right)
  const weeks = [
    { label: 'Wk 4', count: wa.w4 },
    { label: 'Wk 3', count: wa.w3 },
    { label: 'Wk 2', count: wa.w2 },
    { label: 'Wk 1', count: wa.w1 },
  ];

  return (
    <div className="px-5 pt-3 pb-4 bg-gray-800/20 border-t border-gray-800/50">
      {/* Status badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Status</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.pill}`}>
          {meta.label}
        </span>
      </div>

      {/* Attendance table */}
      <div className="grid grid-cols-4 gap-2">
        {weeks.map((w, i) => {
          const { cell, text } = sessionColor(w.count);
          return (
            <div key={i} className={`rounded-lg border px-2 py-2 text-center ${cell}`}>
              <p className={`text-base font-bold tabular-nums leading-none ${text}`}>{w.count}</p>
              <p className="text-[10px] text-gray-500 mt-1">{w.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
