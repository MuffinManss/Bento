import { useMemo, useState } from "react";
import { CoursesStep } from "./components/CoursesStep";
import { PreferencesStep } from "./components/PreferencesStep";
import { ResultsStep } from "./components/ResultsStep";
import type { SampleStudent } from "./data/sampleStudents";
import { useSolver } from "./lib/useSolver";
import type { Filters } from "./solver/types";

const DEFAULT_FILTERS: Filters = { minUnits: 12, maxUnits: 16, daysOff: [], mustInclude: [], exclude: [] };

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Filter combinations that can't mean anything — shown inline instead of running the solver. */
function filterProblems(filters: Filters): string[] {
  const problems: string[] = [];
  if (filters.minUnits > filters.maxUnits) problems.push("Minimum units can't be more than maximum units.");
  if (filters.maxUnits === 0) problems.push("Maximum units must be at least 1.");
  if (filters.earliestStart && filters.latestEnd && minutes(filters.earliestStart) >= minutes(filters.latestEnd)) problems.push("Earliest start must be before latest end.");
  if (filters.daysOff.length === 5) problems.push("Leave at least one day on campus.");
  return problems;
}

function Logo() {
  return (
    <span className="grid size-8 grid-cols-2 grid-rows-2 gap-0.5 rounded-lg bg-rose-700 p-1" aria-hidden>
      <span className="rounded-sm bg-amber-300" />
      <span className="row-span-2 rounded-sm bg-white/90" />
      <span className="rounded-sm bg-emerald-300" />
    </span>
  );
}

export default function App() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [geUnits, setGeUnits] = useState(0);
  const [page, setPage] = useState(0);

  // Any input change starts over at the best options.
  const updateCompleted = (next: Set<string>) => {
    setCompleted(next);
    setPage(0);
  };
  const updateFilters = (next: Filters) => {
    setFilters(next);
    setPage(0);
  };
  const loadSample = (student: SampleStudent) => {
    setCompleted(new Set(student.completed));
    setFilters(student.filters);
    setPage(0);
  };

  const problems = filterProblems(filters);
  const completedList = useMemo(() => [...completed].sort(), [completed]);
  // Nothing ticked yet: prompt instead of showing a "no schedule fits" for an empty profile.
  const needsCourses = completed.size === 0;
  const solver = useSolver(completedList, filters, page, problems.length === 0 && !needsCourses);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight">Bento</h1>
              <p className="text-sm text-slate-500">Schedules that just fit.</p>
            </div>
          </div>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">Planning: Fall 2026</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="space-y-6">
          <CoursesStep completed={completed} onChange={updateCompleted} onLoadSample={loadSample} />
          <PreferencesStep filters={filters} onChange={updateFilters} geUnits={geUnits} onGeUnitsChange={setGeUnits} completed={completed} problems={problems} />
        </div>
        <div className="lg:sticky lg:top-6">
          <ResultsStep
            state={solver}
            page={page}
            geUnits={geUnits}
            blocked={problems.length > 0}
            needsCourses={needsCourses}
            onRegenerate={() => setPage((current) => current + 1)}
            onStartOver={() => setPage(0)}
            onApply={updateFilters}
          />
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-400">
        UCR Computer Science B.S. · Fall 2026 sections · Everything runs in your browser — your courses never leave this device.
      </footer>
    </div>
  );
}
