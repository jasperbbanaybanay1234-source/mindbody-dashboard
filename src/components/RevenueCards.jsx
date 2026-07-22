import { DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react';

function fmtAUD(n) {
  if (n === undefined || n === null) return '–';
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function weekChange(thisWeek, lastWeek) {
  if (!lastWeek || !thisWeek) return null;
  const pct = ((thisWeek - lastWeek) / lastWeek) * 100;
  return Math.round(pct);
}

function ChangeChip({ pct }) {
  if (pct === null) return null;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const color = pct > 0
    ? 'text-emerald-400 bg-emerald-500/10'
    : pct < 0
    ? 'text-red-400 bg-red-500/10'
    : 'text-gray-400 bg-gray-700/30';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  );
}

function Card({ label, value, sub, change, loading }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-400">{label}</p>
        <span className="rounded-lg p-2 bg-emerald-500/10 text-emerald-400">
          <DollarSign className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <>
          <div className="h-9 w-28 animate-pulse rounded-md bg-gray-800 mb-2" />
          <div className="h-4 w-20 animate-pulse rounded-md bg-gray-800" />
        </>
      ) : (
        <>
          <p className="text-3xl font-bold tabular-nums text-white mb-1">{fmtAUD(value)}</p>
          <div className="flex items-center gap-2">
            {sub && <p className="text-xs text-gray-500">{sub}</p>}
            {change !== null && change !== undefined && <ChangeChip pct={change} />}
          </div>
        </>
      )}
    </div>
  );
}

export default function RevenueCards({ data, loading }) {
  const thisWeekTotal  = data?.thisWeek?.total;
  const lastWeekTotal  = data?.lastWeek?.total;
  const thisMonthTotal = data?.thisMonth?.total;
  const lastMonthTotal = data?.lastMonth?.total;

  const thisWeekCount  = data?.thisWeek?.count;
  const lastWeekCount  = data?.lastWeek?.count;
  const thisMonthCount = data?.thisMonth?.count;
  const lastMonthCount = data?.lastMonth?.count;

  const weekPct  = weekChange(thisWeekTotal, lastWeekTotal);
  const monthPct = weekChange(thisMonthTotal, lastMonthTotal);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <Card
        label="This week"
        value={thisWeekTotal}
        sub={thisWeekCount !== undefined ? `${thisWeekCount} transactions` : undefined}
        change={weekPct}
        loading={loading}
      />
      <Card
        label="Last week"
        value={lastWeekTotal}
        sub={lastWeekCount !== undefined ? `${lastWeekCount} transactions` : undefined}
        change={null}
        loading={loading}
      />
      <Card
        label="This month"
        value={thisMonthTotal}
        sub={thisMonthCount !== undefined ? `${thisMonthCount} transactions` : undefined}
        change={monthPct}
        loading={loading}
      />
      <Card
        label="Last month"
        value={lastMonthTotal}
        sub={lastMonthCount !== undefined ? `${lastMonthCount} transactions` : undefined}
        change={null}
        loading={loading}
      />
    </div>
  );
}
