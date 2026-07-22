import { useState } from 'react';
import OnboardingCard      from './OnboardingCard.jsx';
import OnboardingTaskModal from './OnboardingTaskModal.jsx';

const WEEK_META = [
  { week: 1, label: 'Week 1', sub: 'Days 1–7',   color: 'text-blue-400',   border: 'border-blue-500/20',   bg: 'bg-blue-500/5'    },
  { week: 2, label: 'Week 2', sub: 'Days 8–14',  color: 'text-amber-400',  border: 'border-amber-500/20',  bg: 'bg-amber-500/5'   },
  { week: 3, label: 'Week 3', sub: 'Days 15–21', color: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/5'  },
  { week: 4, label: 'Week 4', sub: 'Days 22–28', color: 'text-emerald-400',border: 'border-emerald-500/20',bg: 'bg-emerald-500/5' },
];

export default function OnboardingBoard({
  data,
  isComplete,
  toggleTask,
  contactLog,
  getDecision,
  setDecision,
}) {
  const [activeTask, setActiveTask] = useState(null);

  const clients = {
    1: data?.week1 || [],
    2: data?.week2 || [],
    3: data?.week3 || [],
    4: data?.week4 || [],
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {WEEK_META.map(({ week, label, sub, color, border, bg }) => {
          const cols = clients[week];
          return (
            <div
              key={week}
              className={`flex flex-col shrink-0 rounded-xl border ${border} ${bg} w-72 sm:w-80 xl:flex-1 xl:min-w-64`}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b ${border}`}>
                <div>
                  <p className={`text-sm font-semibold ${color}`}>{label}</p>
                  <p className="text-[11px] text-gray-600">{sub}</p>
                </div>
                <span className={`rounded-full border ${border} px-2 py-0.5 text-xs font-bold ${color}`}>
                  {cols.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2.5 p-3 overflow-y-auto max-h-[70vh]">
                {cols.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-700">No clients this week</p>
                ) : (
                  cols.map((client) => (
                    <OnboardingCard
                      key={client.id}
                      client={client}
                      isComplete={isComplete}
                      toggleTask={toggleTask}
                      onOpenTask={setActiveTask}
                      contactLog={contactLog}
                      getDecision={getDecision}
                      setDecision={setDecision}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeTask && (
        <OnboardingTaskModal task={activeTask} onClose={() => setActiveTask(null)} />
      )}
    </>
  );
}
