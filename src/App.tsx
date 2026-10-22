import { useMemo, useState } from "react";
import { CoursesStep } from "./components/CoursesStep";
import { PreferencesStep } from "./components/PreferencesStep";
import { ResultsStep } from "./components/ResultsStep";
import { meta, requirements } from "./data/index";
import type { SampleStudent } from "./data/sampleStudents";
import type { MetSource } from "./lib/auditBlocks";
import { unitsMap } from "./lib/catalog";
import { unmetRequirementGroups } from "./solver/eligibility";
import { useSolver } from "./lib/useSolver";
import type { Filters } from "./solver/types";

/** "2026-10-20" -> "October 20, 2026" (formatted as a calendar date, not shifted by timezone). */
function longDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

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
  // Requirement groups met without their courses: block COMPLETE on the audit, or marked by the student.
  const [metOverrides, setMetOverrides] = useState<Map<string, MetSource>>(new Map());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [geUnits, setGeUnits] = useState(0);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState(0);

  // Any input change starts over at the best options.
  const goToPage = (next: number) => {
    setPage(next);
    setTab(0);
  };
  const updateCompleted = (next: Set<string>) => {
    setCompleted(next);
    goToPage(0);
  };
  const updateMetOverrides = (next: Map<string, MetSource>) => {
    setMetOverrides(next);
    goToPage(0);
  };
  const updateFilters = (next: Filters) => {
    setFilters(next);
    goToPage(0);
  };
  const loadSample = (student: SampleStudent) => {
    setCompleted(new Set(student.completed));
    setMetOverrides(new Map());
    setFilters(student.filters);
    goToPage(0);
  };

  const problems = filterProblems(filters);
  const completedList = useMemo(() => [...completed].sort(), [completed]);
  const metGroups = useMemo(() => [...metOverrides.keys()].sort(), [metOverrides]);
  // Nothing ticked yet: prompt instead of showing a "no schedule fits" for an empty profile.
  const needsCourses = completed.size === 0 && metOverrides.size === 0;
  const solver = useSolver(completedList, metGroups, filters, page, problems.length === 0 && !needsCourses);
  const allRequirementsMet = useMemo(
    () => !needsCourses && unmetRequirementGroups(requirements, completed, unitsMap, new Set(metGroups)).length === 0,
    [completed, metGroups, needsCourses],
  );

  // The selected option's courses, keyed to the requirement each one fills — Step 1 highlights them.
  const shown = needsCourses || problems.length > 0 ? [] : (solver.result?.schedules ?? []);
  const activeTab = Math.min(tab, shown.length - 1);
  const planned = useMemo(() => new Map((shown[activeTab]?.courses ?? []).map((course) => [course.course, course.requirementId])), [shown, activeTab]);
  const plannedLabel = solver.result && activeTab >= 0 ? `Option ${solver.result.page * 4 + activeTab + 1}` : "";

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
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">Planning: {meta.termLabel}</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="space-y-6">
          <CoursesStep
            completed={completed}
            onChange={updateCompleted}
            metOverrides={metOverrides}
            onMetOverridesChange={updateMetOverrides}
            onLoadSample={loadSample}
            planned={planned}
            plannedLabel={plannedLabel}
          />
          <PreferencesStep filters={filters} onChange={updateFilters} geUnits={geUnits} onGeUnitsChange={setGeUnits} completed={completed} problems={problems} />
        </div>
        <div className="lg:sticky lg:top-6">
          <ResultsStep
            state={solver}
            page={page}
            geUnits={geUnits}
            blocked={problems.length > 0}
            needsCourses={needsCourses}
            allRequirementsMet={allRequirementsMet}
            tab={tab}
            onTabChange={setTab}
            onRegenerate={() => goToPage(page + 1)}
            onStartOver={() => goToPage(0)}
            onApply={updateFilters}
          />
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-600">
        <p className="font-medium">Always confirm in R'Web before registering. Class data from UCR's public schedule as of {longDate(meta.scrapedOn)}.</p>
        <p className="mt-1">UCR Computer Science B.S. · {meta.termLabel} · Everything runs in your browser — your courses never leave this device.</p>
      </footer>
    </div>
  );
}
