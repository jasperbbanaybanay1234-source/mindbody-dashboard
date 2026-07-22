import { Activity, TrendingDown, AlertTriangle, PauseCircle } from 'lucide-react';

function fmt(n) {
  if (n === undefined || n === null) return '–';
  return n.toLocaleString();
}

function Card({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gray-400">{label}</p>
        <span className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded-md bg-gray-800" />
        ) : (
          <p className="text-3xl font-bold tabular-nums text-white">{value}</p>
        )}
        {sub && !loading && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

export default function StatsGrid({ attendance, clientAnalytics, loading }) {
  const visitTotal      = attendance?.stats?.total7;
  const avgDaily        = attendance?.stats?.avgDaily;
  const redsCount       = clientAnalytics?.summary?.redsCount;
  const noShowCount     = clientAnalytics?.summary?.noShowCount;
  const suspensionCount = clientAnalytics?.summary?.suspensionCount;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        icon={Activity}
        label="Visits this week"
        value={fmt(visitTotal)}
        sub={avgDaily !== undefined ? `avg ${fmt(avgDaily)}/day` : undefined}
        color="bg-emerald-500/10 text-emerald-400"
        loading={loading.attendance}
      />
      <Card
        icon={TrendingDown}
        label="Red's List"
        value={fmt(redsCount)}
        sub="active recently · missed this week"
        color={redsCount > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}
        loading={loading.clientAnalytics}
      />
      <Card
        icon={AlertTriangle}
        label="No-shows"
        value={fmt(noShowCount)}
        sub="booked but didn't sign in"
        color={noShowCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-700/40 text-gray-400'}
        loading={loading.clientAnalytics}
      />
      <Card
        icon={PauseCircle}
        label="On suspension"
        value={fmt(suspensionCount)}
        sub="active hold or non-active status"
        color={suspensionCount > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-gray-700/40 text-gray-400'}
        loading={loading.clientAnalytics}
      />
    </div>
  );
}
