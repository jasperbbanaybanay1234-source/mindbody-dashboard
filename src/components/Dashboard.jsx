import { useState, useMemo } from 'react';
import { format, isToday } from 'date-fns';
import { RefreshCw, Activity, DollarSign, Users2 } from 'lucide-react';
import StatsGrid          from './StatsGrid.jsx';
import AttendanceChart    from './AttendanceChart.jsx';
import NoShowsList        from './NoShowsList.jsx';
import SuspensionsList    from './SuspensionsList.jsx';
import RedsList           from './RedsList.jsx';
import OrangeFlagList     from './OrangeFlagList.jsx';
import FringeClientsTable from './FringeClientsTable.jsx';
import RevenueCards       from './RevenueCards.jsx';
import PaymentIssuesTable from './PaymentIssuesTable.jsx';
import DeclinedList       from './DeclinedList.jsx';
import OnboardingTab       from './OnboardingTab.jsx';
import CelebrationsPanel   from './CelebrationsPanel.jsx';
import { useOnboardingRollover } from '../utils/useOnboardingRollover.js';

const TABS = [
  { key: 'operations',        label: 'Operations',        Icon: Activity  },
  { key: 'finances',          label: 'Finances',          Icon: DollarSign },
  { key: 'onboarding',        label: 'Onboarding',        Icon: Users2    },
];

// Short-program products: removed from pipeline on no-rollover.
// (Both current onboarding products run the full 28 days, so this is empty.)
const SHORT_PRODUCTS = new Set();

export default function Dashboard({ data, loading, errors, lastRefresh, onRefresh, contactLog }) {
  const [tab, setTab] = useState('operations');
  const anyLoading    = Object.values(loading).some(Boolean);

  const { decisions, getDecision, setDecision } = useOnboardingRollover();

  // All onboarding clients (from each week column)
  const allOnboardingClients = useMemo(() => [
    ...(data.onboarding?.week1 || []),
    ...(data.onboarding?.week2 || []),
    ...(data.onboarding?.week3 || []),
    ...(data.onboarding?.week4 || []),
  ], [data.onboarding]);

  // IDs of currently active onboarding clients — excludes any short-product
  // clients who have explicitly said no-rollover (they're done with onboarding)
  const onboardingIds = useMemo(() => new Set(
    allOnboardingClients
      .filter((c) => {
        if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
        return decisions[c.id]?.decision !== 'no-rollover';
      })
      .map((c) => c.id)
  ), [allOnboardingClients, decisions]);

  const atRiskCount = useMemo(() => {
    const reds = data.onboarding?.pipelineReds || [];
    return reds.filter((c) => {
      if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
      return decisions[c.id]?.decision !== 'no-rollover';
    }).length;
  }, [data.onboarding, decisions]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/90 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* G3 Fitness logo badge */}
            <div className="h-9 w-9 shrink-0 rounded-md bg-orange-500 flex items-center justify-center shadow-sm shadow-orange-500/30">
              <span className="text-sm font-black tracking-tight text-white">G3</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">Operations Dashboard</h1>
              <p className="text-xs text-gray-500 mt-0.5">{import.meta.env.VITE_BUSINESS_NAME || 'G3 Fitness'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {lastRefresh && (
              <span className="hidden sm:block text-xs text-gray-500">
                Data from {isToday(lastRefresh) ? format(lastRefresh, 'h:mm a') : format(lastRefresh, 'EEE d MMM, h:mm a')}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={anyLoading}
              className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${anyLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab nav ── */}
      <div className="sticky top-[65px] z-20 border-b border-gray-800 bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex gap-1 pt-1">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {/* Red badge for at-risk onboarding clients */}
                {key === 'onboarding' && atRiskCount > 0 && (
                  <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                    {atRiskCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Tab content ── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">

        {/* ─ Operations ─ */}
        {tab === 'operations' && (
          <>
            <StatsGrid
              attendance={data.attendance}
              clientAnalytics={data.clientAnalytics}
              loading={loading}
            />
            <AttendanceChart />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <NoShowsList
                data={data.clientAnalytics}
                loading={loading.clientAnalytics}
                error={errors.clientAnalytics}
              />
              <SuspensionsList
                data={data.clientAnalytics}
                loading={loading.clientAnalytics}
                error={errors.clientAnalytics}
              />
            </div>
            <RedsList
              data={data.clientAnalytics}
              loading={loading.clientAnalytics}
              error={errors.clientAnalytics}
              contactLog={contactLog}
              onboardingIds={onboardingIds}
            />
            <OrangeFlagList
              data={data.clientAnalytics}
              loading={loading.clientAnalytics}
              error={errors.clientAnalytics}
              contactLog={contactLog}
              onboardingIds={onboardingIds}
            />
            <FringeClientsTable
              contactLog={contactLog}
              onboardingIds={onboardingIds}
            />
            <CelebrationsPanel
              data={data.celebrations}
              loading={loading.celebrations}
              error={errors.celebrations}
            />
          </>
        )}

        {/* ─ Finances ─ */}
        {tab === 'finances' && (
          <>
            <RevenueCards
              data={data.revenue}
              loading={loading.revenue}
              error={errors.revenue}
            />
            <DeclinedList
              data={data.clientAnalytics}
              loading={loading.clientAnalytics}
              error={errors.clientAnalytics}
            />
            <PaymentIssuesTable
              data={data.payments}
              loading={loading.payments}
              error={errors.payments}
            />
          </>
        )}

        {/* ─ Onboarding ─ */}
        {tab === 'onboarding' && (
          <OnboardingTab
            data={data.onboarding}
            loading={loading.onboarding}
            error={errors.onboarding}
            contactLog={contactLog}
            decisions={decisions}
            getDecision={getDecision}
            setDecision={setDecision}
          />
        )}
      </main>
    </div>
  );
}
