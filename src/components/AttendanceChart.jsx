import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, RefreshCw } from 'lucide-react';

const FILTERS = [
  { key: '7days',        label: 'Last 7 Days' },
  { key: 'weekToDate',   label: 'Week to Date' },
  { key: 'calendarWeek', label: 'Last Cal. Week' },
  { key: 'monthToDate',  label: 'Month to Date' },
  { key: 'lastMonth',    label: 'Last Month' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-emerald-400">{payload[0].value} visits</p>
    </div>
  );
};

export default function AttendanceChart() {
  const [period, setPeriod]   = useState('7days');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/mb-attendance?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [period]);

  const stats = data?.stats || {};
  const daily = data?.daily || [];

  // For longer periods, tick every N days so labels don't overlap
  const tickInterval = daily.length > 14 ? Math.ceil(daily.length / 14) - 1 : 0;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-gray-500" />
          <div>
            <h2 className="font-semibold text-white">Attendance</h2>
            {data?.stats?.dateRange && (
              <p className="text-xs text-gray-500 mt-0.5">{data.stats.dateRange}</p>
            )}
          </div>
        </div>

        {/* Period filter */}
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setPeriod(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                period === f.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-56 gap-2 text-gray-500 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <p className="text-sm text-red-400 py-10 text-center">Could not load: {error}</p>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Mini stats */}
          <div className="flex flex-wrap gap-6 mb-6">
            {[
              { label: 'Total visits', value: stats.total7 },
              { label: 'Daily avg',    value: stats.avgDaily },
              { label: 'Peak day',     value: stats.peakDay },
              { label: 'Peak visits',  value: stats.peakVisits },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold text-white tabular-nums">{value ?? '–'}</p>
              </div>
            ))}
          </div>

          {/* Area chart */}
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6B7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fill: '#6B7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#374151' }} />
              <Area
                type="monotone"
                dataKey="visits"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#visitGrad)"
                dot={daily.length <= 14}
                activeDot={{ r: 4, fill: '#10B981', stroke: '#065F46' }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Day-of-week bar chart */}
          {data?.byDow?.length > 0 && (
            <div className="mt-6">
              <p className="text-xs text-gray-500 mb-3">By day of week</p>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={data.byDow} margin={{ top: 0, right: 4, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1F2937' }} />
                  <Bar dataKey="visits" fill="#059669" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
