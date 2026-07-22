import PTRedsList          from './PTRedsList.jsx';
import OpenGymList         from './OpenGymList.jsx';
import UncheckedSessionsList from './UncheckedSessionsList.jsx';
import SessionCreditsList  from './SessionCreditsList.jsx';

// ── Stats table ────────────────────────────────────────────────────────────
function StatCell({ value, loading }) {
  if (loading) return <td className="px-4 py-3 text-center"><div className="h-5 w-8 mx-auto animate-pulse rounded bg-gray-700" /></td>;
  return (
    <td className="px-4 py-3 text-center tabular-nums text-sm font-semibold text-gray-200">
      {value ?? '–'}
    </td>
  );
}

function PTStatsTable({ stats, loading }) {
  const pt = stats?.pt || {};
  const sp = stats?.sp || {};
  const total = {
    thisWeek:  (pt.thisWeek  || 0) + (sp.thisWeek  || 0),
    lastWeek:  (pt.lastWeek  || 0) + (sp.lastWeek  || 0),
    thisMonth: (pt.thisMonth || 0) + (sp.thisMonth || 0),
    lastMonth: (pt.lastMonth || 0) + (sp.lastMonth || 0),
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-800">
        <h2 className="font-semibold text-white">Session Counts</h2>
        <p className="text-xs text-gray-500 mt-0.5">Total PT &amp; Semi-Private sessions across time periods</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-1/3" />
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">This Week</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">Last Week</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">This Month</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">Last Month</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-4">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-semibold text-gray-200">Total Sessions</span>
                </span>
              </td>
              <StatCell value={loading ? null : total.thisWeek}  loading={loading} />
              <StatCell value={loading ? null : total.lastWeek}  loading={loading} />
              <StatCell value={loading ? null : total.thisMonth} loading={loading} />
              <StatCell value={loading ? null : total.lastMonth} loading={loading} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────
export default function PersonalTrainingTab({ data, loading, error, contactLog }) {
  if (error && !data) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-sm text-red-400">Could not load PT data: {error}</p>
        {error.includes('sample types') || (
          <p className="text-xs text-gray-500 mt-2">
            Check Netlify function logs — if session types show as empty, your PT sessions
            may use different names. The function logs sample session type names on each run.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats table */}
      <PTStatsTable stats={data?.stats} loading={loading} />

      {/* PT Reds */}
      <PTRedsList data={data} loading={loading} error={error} contactLog={contactLog} />

      {/* Open Gym + Unchecked side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <OpenGymList         data={data} loading={loading} error={error} />
        <UncheckedSessionsList data={data} loading={loading} error={error} />
      </div>

      {/* Session Credits */}
      <SessionCreditsList data={data} loading={loading} error={error} />
    </div>
  );
}
