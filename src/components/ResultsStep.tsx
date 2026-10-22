// Step 3 — up to 4 ranked schedules per page: tabs, weekly calendar, online
// components, per-course details, export (.ics / copy for advisor),
// Regenerate, and the no-results explanation.

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { meta } from "../data/index";
import { formatAdvisorText } from "../lib/advisorText";
import { displayCode, titleCase } from "../lib/catalog";
import { downloadIcs, icsFilename, scheduleToIcs } from "../lib/ics";
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
  /** Selected Option tab on this page (owned by App so Step 1 can highlight its courses). */
  tab: number;
  onTabChange: (tab: number) => void;
  /** No courses or placement ticked yet. */
  needsCourses: boolean;
  onRegenerate: () => void;
  onStartOver: () => void;
  onApply: (filters: Filters) => void;
};

const SUBTITLE = "Ranked by requirement priority, fewer campus days, and fewer gaps";

function formatWhen(when: string): string {
  const [days, range] = when.split(" ");
  const [start, end] = range.split("-");
  return `${days} ${formatTime(start)}–${formatTime(end)}`;
}

/** Copies text, falling back to a hidden textarea where the async Clipboard API is unavailable (e.g. http). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function ExportBar({ schedule, optionNumber, geUnits }: { schedule: Schedule; optionNumber: number; geUnits: number }) {
  const [status, setStatus] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const announce = (message: string, clearAfterMs?: number) => {
    window.clearTimeout(timer.current);
    setStatus(message);
    if (clearAfterMs) timer.current = window.setTimeout(() => setStatus(""), clearAfterMs);
  };

  const exportIcs = () => {
    const { ics, skipped } = scheduleToIcs(schedule, meta, optionNumber);
    const filename = icsFilename(meta.termLabel, optionNumber);
    downloadIcs(ics, filename);
    const notIncluded = skipped.map((part) => `${displayCode(part.course)} ${part.kind} ${part.crn}`).join(", ");
    announce(`Downloaded ${filename}.${notIncluded ? ` Not included (no fixed meeting time): ${notIncluded}.` : ""}`);
  };

  const copy = async () => {
    const ok = await copyText(formatAdvisorText(schedule, meta.termLabel, optionNumber, geUnits));
    announce(ok ? "Copied!" : "Couldn't copy — your browser blocked clipboard access.", 2500);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportIcs} className={secondaryButton}>
          <span aria-hidden>📅</span> Add to calendar (.ics)
        </button>
        <button type="button" onClick={copy} className={secondaryButton}>
          <span aria-hidden>📋</span> Copy for advisor
        </button>
      </div>
      <p aria-live="polite" className={`min-h-4 text-xs ${status === "Copied!" ? "font-medium text-emerald-700" : "text-slate-600"}`}>
        {status}
      </p>
    </div>
  );
}

function ScheduleView({ schedule, geUnits, optionNumber, truncated }: { schedule: Schedule; geUnits: number; optionNumber: number; truncated: boolean }) {
  const details = courseDetails(schedule);
  const online = details.flatMap((course) => course.components.filter((component) => component.online).map((component) => ({ course, component })));

  return (
    <div className="space-y-4">
      <ExportBar schedule={schedule} optionNumber={optionNumber} geUnits={geUnits} />
      <WeekCalendar schedule={schedule} />

      {online.length > 0 && (
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">No fixed meeting time</h3>
          <ul className="space-y-1.5 text-sm">
            {online.map(({ course, component }) => (
              <li key={`${course.code}-${component.crn}`} className="flex flex-wrap items-center gap-2">
                <span aria-hidden className={`size-2.5 rounded-full ${COURSE_COLORS[course.colorIndex % COURSE_COLORS.length].dot}`} />
                <span className="font-medium">{displayCode(course.code)}</span>
                <span className="text-slate-600">
                  {component.kind} · CRN {component.crn}
                </span>
                <Chip tone="emerald">Online</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-3" aria-label="Courses in this option">
        {details.map((course) => (
          <li key={course.code} className="rounded-xl p-3 ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${COURSE_COLORS[course.colorIndex % COURSE_COLORS.length].dot}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {displayCode(course.code)} <span className="font-normal text-slate-600">· {titleCase(course.title)}</span>
                  </p>
                  {course.instructor && <p className="text-xs text-slate-600">{course.instructor}</p>}
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
      {geUnits > 0 && <p className="-mt-2 text-xs text-slate-600">Leave room in your week for {geUnits} GE/other units — Bento doesn't schedule those.</p>}
      {truncated && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">The search was capped to keep things fast — these are the best options found, not necessarily every possible one.</p>}
    </div>
  );
}

function ScheduleTabs({ schedules, page, geUnits, tab, onTabChange, truncated }: { schedules: Schedule[]; page: number; geUnits: number; tab: number; onTabChange: (tab: number) => void; truncated: boolean }) {
  const selected = Math.min(tab, schedules.length - 1);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const optionNumber = (index: number) => page * 4 + index + 1;

  // WAI-ARIA tabs: arrows move between tabs (and select them), Home/End jump to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = schedules.length - 1;
    const next = { ArrowRight: selected === last ? 0 : selected + 1, ArrowLeft: selected === 0 ? last : selected - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onTabChange(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Schedule options" onKeyDown={onKeyDown} className="grid gap-1 rounded-xl bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${schedules.length}, minmax(0, 1fr))` }}>
        {schedules.map((schedule, index) => (
          <button
            key={index}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`option-tab-${index}`}
            role="tab"
            type="button"
            aria-selected={index === selected}
            aria-controls="option-panel"
            tabIndex={index === selected ? 0 : -1}
            onClick={() => onTabChange(index)}
            className={`rounded-lg px-2 py-1.5 text-sm font-medium transition ${index === selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Option {optionNumber(index)}
            <span className="block text-[11px] font-normal text-slate-600">{schedule.units} units</span>
          </button>
        ))}
      </div>
      <div id="option-panel" role="tabpanel" aria-labelledby={`option-tab-${selected}`} tabIndex={0} className="rounded-xl">
        <ScheduleView schedule={schedules[selected]} geUnits={geUnits} optionNumber={optionNumber(selected)} truncated={truncated} />
      </div>
    </div>
  );
}

/** "lowering the minimum to 13 units" -> "Lower the minimum to 13 units" (button label). */
function asAction(change: string): string {
  const verbs: Record<string, string> = { removing: "Remove", lowering: "Lower", raising: "Raise", dropping: "Drop", allowing: "Allow" };
  const [first, ...rest] = change.split(" ");
  return [verbs[first] ?? first, ...rest].join(" ");
}

/** One look for every non-result state: get started, fix filters, error, no results. */
function StateCard({ tone, title, children }: { tone: "neutral" | "warning" | "error"; title: string; children?: ReactNode }) {
  const tones = {
    neutral: "border-2 border-dashed border-slate-200 text-slate-700",
    warning: "bg-amber-50 ring-1 ring-amber-200 text-amber-950",
    error: "bg-rose-50 ring-1 ring-rose-200 text-rose-950",
  };
  return (
    <div className={`rounded-xl p-5 ${tones[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children}
    </div>
  );
}

function NoResults({ explanation, onApply }: { explanation?: Explanation; onApply: (filters: Filters) => void }) {
  return (
    <StateCard tone="warning" title="No schedule fits right now">
      <p className="mt-1 text-sm">{explanation?.message ?? "Nothing matched your filters."}</p>
      {explanation && explanation.relaxations.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {explanation.relaxations.map((relaxation) => (
            <button key={relaxation.constraint} type="button" onClick={() => onApply(relaxation.suggestedFilters)} className={`${secondaryButton} justify-between sm:justify-center`}>
              <span>{asAction(relaxation.change)}</span>
              <span className="text-xs text-slate-600">
                {relaxation.optionCount}
                {relaxation.atLeast ? "+" : ""} option{relaxation.optionCount === 1 && !relaxation.atLeast ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      )}
    </StateCard>
  );
}

/** Same footprint as tabs + calendar, so results replace it without the page jumping. */
function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-13 rounded-xl bg-slate-100" />
      <div className="h-9 w-64 rounded-lg bg-slate-100" />
      <div className="h-[44rem] rounded-xl bg-slate-100" />
    </div>
  );
}

/** Text for the screen-reader status region. */
function statusMessage({ needsCourses, blocked, state }: { needsCourses: boolean; blocked: boolean; state: SolverState }): string {
  if (needsCourses) return "";
  if (blocked) return "Fix your preferences to see schedules.";
  if (state.loading) return "Finding schedules…";
  if (state.error) return "Something went wrong finding schedules.";
  if (!state.result) return "";
  return state.result.totalFound === 0 ? "No schedule fits your filters." : `Found ${state.result.totalFound}${state.result.truncated ? " or more" : ""} schedules.`;
}

export function ResultsStep({ state, page, geUnits, blocked, tab, onTabChange, needsCourses, onRegenerate, onStartOver, onApply }: Props) {
  const { result, explanation, loading, error } = state;
  const schedules = result?.schedules ?? [];
  const showResults = !needsCourses && !blocked && !error;

  const actions = showResults && result && result.totalFound > 0 && (
    <div className="flex items-center gap-2">
      {result.hasMore ? (
        <button type="button" onClick={onRegenerate} disabled={loading} className={primaryButton}>
          <span aria-hidden>↻</span> Regenerate
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

  let body: ReactNode;
  if (needsCourses) {
    body = (
      <StateCard tone="neutral" title="Tell Bento what you've done">
        <p className="mt-1 text-sm text-slate-600">Tick your completed courses (and your math placement, if you're new) in step 1 — or load a sample student to see it in action.</p>
      </StateCard>
    );
  } else if (blocked) {
    body = <StateCard tone="neutral" title="Fix the highlighted preferences to see schedules." />;
  } else if (error) {
    body = <StateCard tone="error" title={`Something went wrong: ${error}`} />;
  } else if (!result) {
    body = <Skeleton />;
  } else if (result.totalFound === 0) {
    body = <NoResults explanation={explanation} onApply={onApply} />;
  } else {
    body = <ScheduleTabs schedules={schedules} page={result.page} geUnits={geUnits} tab={tab} onTabChange={onTabChange} truncated={result.truncated} />;
  }

  return (
    <Section id="results" step={3} title="Your schedules" subtitle={showResults && result && result.totalFound > 0 ? `${result.totalFound}${result.truncated ? "+" : ""} conflict-free options, best first` : SUBTITLE} action={actions || undefined}>
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage({ needsCourses, blocked, state })}
      </p>
      <div className="relative">
        {loading && showResults && result && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" aria-hidden>
            <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow ring-1 ring-slate-200">
              <span className="size-3 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600" />
              Finding schedules…
            </span>
          </div>
        )}
        <div className={`transition-opacity ${loading && result ? "opacity-50" : ""}`}>{body}</div>
      </div>
      <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span className="font-semibold">How it works:</span> Bento is a rule-based solver, not AI: every schedule is checked for time conflicts, prerequisites, and degree requirements.
      </p>
    </Section>
  );
}
