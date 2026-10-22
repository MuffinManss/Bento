// Step 1 — what the student has already done: placement, completed courses
// (checklist grouped by requirement, with search), degree-audit paste, and
// demo sample students.

import { useMemo, useState } from "react";
import { sampleStudents } from "../data/sampleStudents";
import type { SampleStudent } from "../data/sampleStudents";
import { parseAudit } from "../lib/auditParser";
import type { AuditMatch } from "../lib/auditParser";
import { catalogCodes, checklistGroups, displayCode, placementItems } from "../lib/catalog";
import type { Course } from "../solver/types";
import { Chip, Section, SubHeading, inputClass, secondaryButton } from "./ui";

type Props = {
  completed: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  onLoadSample: (student: SampleStudent) => void;
  /** Courses in the selected results option -> the requirement group each one fills. */
  planned: ReadonlyMap<string, string>;
  /** e.g. "Option 2" */
  plannedLabel: string;
};

type RowStatus = "completed" | "planned" | "none";

/** Red = completed, blue = in the selected option (would fill this group), gray = neither. */
function StatusBox({ status }: { status: RowStatus }) {
  const style = {
    completed: "border-rose-600 bg-rose-600 text-white",
    planned: "border-blue-600 bg-blue-600 text-white",
    none: "border-slate-300 bg-white text-transparent peer-hover:border-slate-400",
  }[status];
  return (
    <span aria-hidden className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-bold leading-none peer-focus-visible:ring-2 peer-focus-visible:ring-rose-500/40 ${style}`}>
      {status === "completed" ? "✓" : status === "planned" ? "+" : ""}
    </span>
  );
}

function titleCase(title: string): string {
  return title.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

function CourseCheckbox({ course, checked, onToggle, plannedLabel }: { course: Course; checked: boolean; onToggle: () => void; plannedLabel?: string }) {
  const status: RowStatus = checked ? "completed" : plannedLabel ? "planned" : "none";
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 ${status === "planned" ? "bg-blue-50 ring-1 ring-inset ring-blue-200 hover:bg-blue-100/60" : "hover:bg-slate-50"}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="peer sr-only" />
      <StatusBox status={status} />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-slate-900">{course.placement ? course.title : displayCode(course.code)}</span>
        {!course.placement && <span className="text-slate-500"> · {titleCase(course.title)}</span>}
      </span>
      {status === "planned" && <span className="shrink-0 text-xs font-medium text-blue-700">{plannedLabel}</span>}
    </label>
  );
}

function AuditPaste({ onFound }: { onFound: (codes: string[]) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AuditMatch | null>(null);

  const run = () => {
    const parsed = parseAudit(text, catalogCodes);
    setResult(parsed);
    onFound(parsed.matched);
  };

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        placeholder={"Paste text from your degree audit, e.g.\nFA25  CS 010A  INTRO COMPUTER SCI I  4.0  A"}
        className={`${inputClass} font-mono text-xs`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={!text.trim()} className={secondaryButton}>
          Find courses
        </button>
        {result && (
          <span className="text-sm text-slate-600" role="status">
            Found {result.matched.length} course{result.matched.length === 1 ? "" : "s"}
            {result.matched.length > 0 && " — ticked below"}
          </span>
        )}
      </div>
      {result && result.unmatched.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
          <p className="mb-1.5 font-medium">Not in Bento's CS B.S. catalog (ignored):</p>
          <div className="flex flex-wrap gap-1">
            {result.unmatched.map((code) => (
              <Chip key={code}>{displayCode(code)}</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CoursesStep({ completed, onChange, onLoadSample, planned, plannedLabel }: Props) {
  const [query, setQuery] = useState("");
  const toggle = (code: string) => {
    const next = new Set(completed);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  };

  const needle = query.trim().toLowerCase().replace(/\s+/g, "");
  const groups = useMemo(
    () =>
      checklistGroups
        .map((group) => ({ ...group, courses: needle ? group.courses.filter((course) => `${course.code}${course.title}`.toLowerCase().replace(/\s+/g, "").includes(needle)) : group.courses }))
        .filter((group) => group.courses.length > 0),
    [needle],
  );
  const completedCourses = [...completed].filter((code) => catalogCodes.has(code)).length;

  const sampleSelect = (
    <select
      value=""
      onChange={(event) => {
        const student = sampleStudents[Number(event.target.value)];
        if (student) onLoadSample(student);
      }}
      className={`${inputClass} w-auto text-xs`}
      aria-label="Load sample student"
    >
      <option value="">Load sample student…</option>
      {sampleStudents.map((student, index) => (
        <option key={student.name} value={index}>
          {student.name}
        </option>
      ))}
    </select>
  );

  return (
    <Section step={1} title="Your courses" subtitle="Tick what you've completed — it never leaves your browser." action={sampleSelect}>
      <div className="space-y-6">
        <div>
          <SubHeading hint="From your math placement exam">Placement</SubHeading>
          <div className="grid gap-0.5 sm:grid-cols-2">
            {placementItems.map((item) => (
              <CourseCheckbox key={item.code} course={item} checked={completed.has(item.code)} onToggle={() => toggle(item.code)} />
            ))}
          </div>
        </div>

        <div>
          <SubHeading>Paste your degree audit</SubHeading>
          <AuditPaste onFound={(codes) => onChange(new Set([...completed, ...codes]))} />
        </div>

        <div>
          <SubHeading
            hint={
              <span className="flex items-center gap-2">
                {completedCourses} completed
                {completed.size > 0 && (
                  <button type="button" onClick={() => onChange(new Set())} className="text-rose-600 hover:underline">
                    Clear
                  </button>
                )}
              </span>
            }
          >
            Completed courses
          </SubHeading>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <StatusBox status="completed" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <StatusBox status="planned" /> {planned.size > 0 ? `Would be filled by ${plannedLabel}` : "Would be filled by the selected option"}
            </span>
          </div>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search, e.g. CS 100 or calculus" className={`${inputClass} mb-2`} />
          <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {groups.map((group) => {
              const done = group.courses.filter((course) => completed.has(course.code)).length;
              const plannedHere = group.courses.filter((course) => planned.get(course.code) === group.id && !completed.has(course.code)).length;
              return (
                <details key={group.id} open={needle || plannedHere > 0 ? true : undefined} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-slate-50">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <span className="text-slate-400 transition group-open:rotate-90">›</span>
                      {group.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs">
                      {plannedHere > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 font-semibold text-white">+{plannedHere}</span>}
                      <span className={done > 0 ? "font-medium text-rose-700" : "text-slate-400"}>
                        {done}/{group.courses.length}
                      </span>
                    </span>
                  </summary>
                  <div className="px-1 pb-2">
                    {group.courses.map((course) => (
                      <CourseCheckbox
                        key={course.code}
                        course={course}
                        checked={completed.has(course.code)}
                        onToggle={() => toggle(course.code)}
                        plannedLabel={planned.get(course.code) === group.id ? plannedLabel : undefined}
                      />
                    ))}
                  </div>
                </details>
              );
            })}
            {groups.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No courses match “{query}”.</p>}
          </div>
        </div>
      </div>
    </Section>
  );
}
