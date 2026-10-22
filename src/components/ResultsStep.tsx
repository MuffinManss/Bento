// Step 3 — up to 4 ranked schedules per page: tabs, weekly calendar, online
// components, per-course details, Regenerate, and the no-results explanation.

import { useState } from "react";
import { displayCode } from "../lib/catalog";
import { courseDetails } from "../lib/scheduleView";
import type { SolverState } from "../lib/useSolver";
import type { Explanation } from "../solver/explain";
import type { Filters, Schedule } from "../solver/types";
import { WeekCalendar } from "./WeekCalendar";
import { COURSE_COLORS, Chip, Section, formatTime, primaryButton, secondaryButton } from "./ui";

type Props = {
  state: SolverState;
  page: number;
  geUnits: number;
  blocked: boolean;
  /** No courses or placement ticked yet. */
  needsCourses: boolean;
  onRegenerate: () => void;
  onStartOver: () => void;
  onApply: (filters: Filters) => void;
};

function formatWhen(when: string): string {
  const [days, range] = when.split(" ");
  const [start, end] = range.split("-");
  return `${days} ${formatTime(start)}–${formatTime(end)}`;
}

function ScheduleView({ schedule, geUnits }: { schedule: Schedule; geUnits: number }) {
  const details = courseDetails(schedule);
  const online = details.flatMap((course) => course.components.filter((component) => component.online).map((component) => ({ course, component })));

  return (
    <div className="space-y-4">
      <WeekCalendar schedule={schedule} />

      {online.length > 0 && (
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">No fixed meeting time</p>
          <ul className="space-y-1.5 text-sm">
            {online.map(({ course, component }) => (
              <li key={`${course.code}-${component.crn}`} className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${COURSE_COLORS[course.colorIndex % COURSE_COLORS.length].dot}`} />
                <span className="font-medium">{displayCode(course.code)}</span>
                <span className="text-slate-500">
                  {component.kind} · CRN {component.crn}
                </span>
                <Chip tone="emerald">Online</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-3">
        {details.map((course) => (
          <li key={course.code} className="rounded-xl p-3 ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${COURSE_COLORS[course.colorIndex % COURSE_COLORS.length].dot}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {displayCode(course.code)} <span className="font-normal text-slate-600">· {course.title.toLowerCase().replace(/\b([a-z])/g, (l) => l.toUpperCase())}</span>
                  </p>
                  {course.instructor && <p className="text-xs text-slate-500">{course.instructor}</p>}
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium text-slate-700">{course.units} u</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-4.5 text-xs text-slate-600">
              {course.components.map((component) => (
                <span key={component.crn}>
                  <span className="font-semibold text-slate-800">{component.kind}</span> CRN {component.crn}
                  {component.online ? " · online" : component.when.map((when) => ` · ${formatWhen(when)}`).join("")}
                </span>
              ))}
            </div>
            <div className="mt-2 pl-4.5">
              <Chip tone="rose">Fills: {course.requirement}</Chip>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-slate-200 p-3 text-sm">
        <span className="text-slate-600">
          Major courses <span className="font-semibold text-slate-900">{schedule.units} u</span>
          {geUnits > 0 && (
            <>
              {" "}
              + GE / other <span className="font-semibold text-slate-900">{geUnits} u</span>
            </>
          )}
        </span>
        <span className="font-semibold text-slate-900">{schedule.units + geUnits} units total</span>
      </div>
      {geUnits > 0 && <p className="-mt-2 text-xs text-slate-500">Leave room in your week for {geUnits} GE/other units — Bento doesn't schedule those.</p>}
    </div>
  );
}

function ScheduleTabs({ schedules, page, geUnits }: { schedules: Schedule[]; page: number; geUnits: number }) {
  const [tab, setTab] = useState(0);
  const active = schedules[Math.min(tab, schedules.length - 1)];
  return (
    <div className="space-y-4">
      <div role="tablist" className="grid gap-1 rounded-xl bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${schedules.length}, minmax(0, 1fr))` }}>
        {schedules.map((schedule, index) => (
          <button
            key={index}
            role="tab"
            type="button"
            aria-selected={index === tab}
            onClick={() => setTab(index)}
            className={`rounded-lg px-2 py-1.5 text-sm font-medium transition ${index === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Option {page * 4 + index + 1}
            <span className="block text-[11px] font-normal text-slate-500">{schedule.units} units</span>
          </button>
        ))}
      </div>
      <ScheduleView schedule={active} geUnits={geUnits} />
    </div>
  );
}

/** "lowering the minimum to 13 units" -> "Lower the minimum to 13 units" (button label). */
function asAction(change: string): string {
  const verbs: Record<string, string> = { removing: "Remove", lowering: "Lower", raising: "Raise", dropping: "Drop", allowing: "Allow" };
  const [first, ...rest] = change.split(" ");
  return [verbs[first] ?? first, ...rest].join(" ");
}

function NoResults({ explanation, onApply }: { explanation?: Explanation; onApply: (filters: Filters) => void }) {
  return (
    <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="font-semibold text-amber-900">No schedule fits right now</p>
      <p className="mt-1 text-sm text-amber-900">{explanation?.message ?? "Nothing matched your filters."}</p>
      {explanation && explanation.relaxations.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {explanation.relaxations.map((relaxation) => (
            <button key={relaxation.constraint} type="button" onClick={() => onApply(relaxation.suggestedFilters)} className={`${secondaryButton} justify-between sm:justify-center`}>
              <span>{asAction(relaxation.change)}</span>
              <span className="text-xs text-slate-500">
                {relaxation.optionCount}
                {relaxation.atLeast ? "+" : ""} option{relaxation.optionCount === 1 && !relaxation.atLeast ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GetStarted() {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
      <p className="font-semibold text-slate-800">Tell Bento what you've done</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Tick your completed courses (and your math placement, if you're new) in step 1 — or load a sample student to see it in action.</p>
    </div>
  );
}

export function ResultsStep({ state, page, geUnits, blocked, needsCourses, onRegenerate, onStartOver, onApply }: Props) {
  if (needsCourses) {
    return (
      <Section id="results" step={3} title="Your schedules" subtitle="Ranked by requirement priority, fewer campus days, and fewer gaps">
        <GetStarted />
      </Section>
    );
  }

  const { result, explanation, loading, error } = state;
  const schedules = result?.schedules ?? [];
  const resultKey = schedules.map((schedule) => schedule.courses.map((course) => `${course.course}${course.lectureId}${course.activityIds.join("")}`).join()).join("|");

  const actions = result && result.totalFound > 0 && (
    <div className="flex items-center gap-2">
      {result.hasMore ? (
        <button type="button" onClick={onRegenerate} disabled={loading} className={primaryButton}>
          ↻ Regenerate
        </button>
      ) : (
        page > 0 && (
          <button type="button" onClick={onStartOver} disabled={loading} className={secondaryButton}>
            Back to best options
          </button>
        )
      )}
    </div>
  );

  return (
    <Section id="results" step={3} title="Your schedules" subtitle={result && result.totalFound > 0 ? `${result.totalFound}${result.truncated ? "+" : ""} conflict-free options, best first` : "Ranked by requirement priority, fewer campus days, and fewer gaps"} action={actions || undefined}>
      <div className="relative">
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
            <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-200" role="status">
              <span className="size-3 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600" />
              Finding schedules…
            </span>
          </div>
        )}
        <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          {blocked && <p className="text-sm text-slate-500">Fix the highlighted preferences to see schedules.</p>}
          {!blocked && error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Something went wrong: {error}</p>}
          {!blocked && !error && result && result.totalFound === 0 && <NoResults explanation={explanation} onApply={onApply} />}
          {!blocked && !error && result && result.truncated && result.totalFound > 0 && (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">The search was capped to keep things fast — these are the best options found, not necessarily every possible one.</p>
          )}
          {!blocked && result && schedules.length > 0 && <ScheduleTabs key={resultKey} schedules={schedules} page={result.page} geUnits={geUnits} />}
          {!blocked && !result && !error && <div className="h-64" />}
        </div>
      </div>
    </Section>
  );
}
