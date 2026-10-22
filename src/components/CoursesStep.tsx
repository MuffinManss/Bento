// Step 1 — what the student has already done: placement, completed courses
// (checklist grouped by requirement, with search), degree-audit PDF upload
// (primary) or paste (fallback), and demo sample students.

import { useMemo, useState } from "react";
import { sampleStudents } from "../data/sampleStudents";
import type { SampleStudent } from "../data/sampleStudents";
import { parseAudit } from "../lib/auditParser";
import type { AuditMatch } from "../lib/auditParser";
import { parsePdfAudit } from "../lib/auditPdfParser";
import type { ParsedPdfAudit } from "../lib/auditPdfParser";
import { catalogCodes, checklistGroups, displayCode, groupById, placementItems, titleCase, unitsMap } from "../lib/catalog";
import { progressFraction, progressLabel } from "../lib/progressLabel";
import { groupProgress } from "../solver/progress";
import type { Course } from "../solver/types";
import { Chip, Section, SubHeading, inputClass, primaryButton, secondaryButton } from "./ui";

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

/** `notNeeded`: the group is already met, so this unticked option is dimmed (but still tickable). */
function CourseCheckbox({ course, checked, onToggle, plannedLabel, notNeeded = false }: { course: Course; checked: boolean; onToggle: () => void; plannedLabel?: string; notNeeded?: boolean }) {
  const status: RowStatus = checked ? "completed" : plannedLabel ? "planned" : "none";
  const dimmed = notNeeded && status === "none";
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 ${status === "planned" ? "bg-blue-50 ring-1 ring-inset ring-blue-200 hover:bg-blue-100/60" : "hover:bg-slate-50"} ${dimmed ? "opacity-60 hover:opacity-100" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="peer sr-only" />
      <StatusBox status={status} />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-slate-900">{course.placement ? course.title : displayCode(course.code)}</span>
        {!course.placement && <span className="text-slate-500"> · {titleCase(course.title)}</span>}
      </span>
      {status === "planned" && <span className="shrink-0 text-xs font-medium text-blue-700">{plannedLabel}</span>}
      {dimmed && <span className="shrink-0 text-xs text-slate-600">Not needed</span>}
    </label>
  );
}

/** Review panel shown after a PDF is parsed — user can check before applying. */
function ReviewPanel({
  review,
  countInProgress,
  onCountInProgressChange,
  onApply,
  onDismiss,
}: {
  review: ParsedPdfAudit;
  countInProgress: boolean;
  onCountInProgressChange: (v: boolean) => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const total = review.completed.length + review.inProgress.length;
  const toApply = [
    ...review.completed,
    ...(countInProgress ? review.inProgress : []),
  ].filter((c) => c.inCatalog);

  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">
            Found {total} course{total !== 1 ? "s" : ""}: {review.completed.length} completed
            {review.inProgress.length > 0 && `, ${review.inProgress.length} in progress`}
          </p>
          {review.major && <p className="mt-0.5 text-xs text-slate-500">{review.major}</p>}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-slate-400 hover:text-slate-600 text-xl leading-none">
          ×
        </button>
      </div>

      {review.catalogYearMismatch && review.catalogYear && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Bento uses 2026–27 requirements; your audit is from {review.catalogYear} — small differences are possible, check with your advisor.
        </p>
      )}

      {review.inProgress.length > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={countInProgress}
            onChange={(e) => onCountInProgressChange(e.target.checked)}
            className="rounded border-slate-300 accent-rose-600"
          />
          Count in-progress courses as completed
        </label>
      )}

      {/* Course list: only those we'd apply (in catalog + in-progress toggle respected) */}
      <div className="max-h-44 space-y-0.5 overflow-y-auto">
        {[...review.completed, ...review.inProgress]
          .filter((c) => c.inCatalog)
          .map((c) => (
            <div key={c.rawCode + c.grade} className="flex items-center gap-2 py-0.5 text-xs">
              <span className={c.status === "inprogress" ? "text-blue-600" : "text-emerald-600"} aria-hidden>
                {c.status === "inprogress" ? "○" : "✓"}
              </span>
              <span className="font-medium text-slate-900">{displayCode(c.code)}</span>
              <span className="truncate text-slate-500">{titleCase(c.title)}</span>
              <span className="ml-auto shrink-0 text-slate-400">{c.grade}</span>
            </div>
          ))}
      </div>

      {review.unmatched.length > 0 && (
        <div className="rounded-lg bg-slate-100 p-2.5">
          <p className="mb-1.5 text-xs font-medium text-slate-600">
            Not in Bento's catalog ({review.unmatched.length}):
          </p>
          <div className="flex flex-wrap gap-1">
            {review.unmatched.map((code) => (
              <Chip key={code}>{displayCode(code)}</Chip>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onApply} className={primaryButton}>
          Apply to my courses ({toApply.length})
        </button>
        <button type="button" onClick={onDismiss} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** PDF upload zone + paste text fallback, with a review step before applying. */
function AuditImport({ onFound }: { onFound: (codes: string[]) => void }) {
  const [mode, setMode] = useState<"pdf" | "paste">("pdf");
  // PDF state
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [review, setReview] = useState<ParsedPdfAudit | null>(null);
  const [countInProgress, setCountInProgress] = useState(true);
  // Paste fallback state
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState<AuditMatch | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPdfLoading(true);
    setPdfError(null);
    setReview(null);
    try {
      const result = await parsePdfAudit(file, catalogCodes);
      setReview(result);
    } catch {
      setPdfError("Couldn't read this PDF. Make sure it's a Degree Works audit, or paste your audit text instead.");
    } finally {
      setPdfLoading(false);
    }
  };

  const applyReview = () => {
    if (!review) return;
    const codes = [
      ...review.completed,
      ...(countInProgress ? review.inProgress : []),
    ]
      .filter((c) => c.inCatalog)
      .map((c) => c.code);
    onFound(codes);
    setReview(null);
  };

  const runPaste = () => {
    const parsed = parseAudit(pasteText, catalogCodes);
    setPasteResult(parsed);
    onFound(parsed.matched);
  };

  return (
    <div className="space-y-3">
      {/* Mode switcher */}
      <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("pdf")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${mode === "pdf" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Upload PDF
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${mode === "paste" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Paste text
        </button>
      </div>

      {/* Privacy note */}
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <span aria-hidden>🔒</span>
        Your audit is read on your device and never leaves it.
      </p>

      {mode === "pdf" && (
        <div className="space-y-2">
          <label
            className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
              pdfLoading
                ? "cursor-default border-slate-200 bg-slate-50"
                : "border-slate-300 hover:border-rose-400 hover:bg-rose-50/40"
            }`}
          >
            <input
              type="file"
              accept=".pdf"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={handleFile}
              disabled={pdfLoading}
            />
            {pdfLoading ? (
              <>
                <span className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600" aria-hidden />
                <span className="text-sm text-slate-600">Reading your PDF…</span>
              </>
            ) : (
              <>
                <span aria-hidden className="text-2xl">📄</span>
                <span className="text-sm font-medium text-slate-700">Upload degree audit PDF</span>
                <span className="text-xs text-slate-500">Click or drag your Degree Works PDF here</span>
              </>
            )}
          </label>
          {pdfError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200">
              {pdfError}
            </p>
          )}
        </div>
      )}

      {mode === "paste" && (
        <div className="space-y-2">
          <textarea
            id="audit-text"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={"Paste text from your degree audit, e.g.\nCS 010A   INTRO COMPUTER SCI I   A   4   Fall 2025"}
            className={`${inputClass} font-mono text-xs`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={runPaste} disabled={!pasteText.trim()} className={secondaryButton}>
              Find courses
            </button>
            <span aria-live="polite" className="text-sm text-slate-600">
              {pasteResult && (
                <>
                  Found {pasteResult.matched.length} course{pasteResult.matched.length === 1 ? "" : "s"}
                  {pasteResult.matched.length > 0 && " — ticked below"}
                </>
              )}
            </span>
          </div>
          {pasteResult && pasteResult.unmatched.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              <p className="mb-1.5 font-medium">Not in Bento's CS B.S. catalog (ignored):</p>
              <div className="flex flex-wrap gap-1">
                {pasteResult.unmatched.map((code) => (
                  <Chip key={code}>{displayCode(code)}</Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review panel after PDF parse */}
      {review && (
        <ReviewPanel
          review={review}
          countInProgress={countInProgress}
          onCountInProgressChange={setCountInProgress}
          onApply={applyReview}
          onDismiss={() => setReview(null)}
        />
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
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
    Try a sample student
    <select
      value=""
      onChange={(event) => {
        const student = sampleStudents[Number(event.target.value)];
        if (student) onLoadSample(student);
      }}
      className={`${inputClass} w-auto text-xs`}
    >
      <option value="">Load sample student…</option>
      {sampleStudents.map((student, index) => (
        <option key={student.name} value={index}>
          {student.name}
        </option>
      ))}
    </select>
    </label>
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
          <SubHeading>Import degree audit</SubHeading>
          <AuditImport onFound={(codes) => onChange(new Set([...completed, ...codes]))} />
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
          <label htmlFor="course-search" className="mb-1 block text-xs font-medium text-slate-600">
            Search courses
          </label>
          <input id="course-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search, e.g. CS 100 or calculus" className={`${inputClass} mb-2`} />
          <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {groups.map((group) => {
              const requirement = groupById.get(group.id);
              const plannedHere = [...planned].filter(([code, groupId]) => groupId === group.id && !completed.has(code)).map(([code]) => code);
              const progress = requirement && groupProgress(requirement, completed, unitsMap);
              const preview = requirement && plannedHere.length > 0 ? groupProgress(requirement, new Set([...completed, ...plannedHere]), unitsMap) : undefined;
              const ticked = group.courses.filter((course) => completed.has(course.code)).length;
              return (
                <details key={group.id} open={needle || plannedHere.length > 0 ? true : undefined} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2.5 text-sm hover:bg-slate-50">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <span aria-hidden className="text-slate-500 transition group-open:rotate-90">›</span>
                      {group.name}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs">
                      {!progress && <span className="text-slate-600">{ticked} ticked</span>}
                      {progress?.met && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">✓ Met</span>}
                      {progress && !progress.met && (
                        <span className="text-slate-600">
                          {progressLabel(progress)}
                          {preview && (
                            <span className="font-medium text-blue-700">
                              {" "}→ {preview.met ? "✓ Met" : progressFraction(preview)} with {plannedLabel}
                            </span>
                          )}
                        </span>
                      )}
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
                        notNeeded={progress?.met}
                      />
                    ))}
                  </div>
                </details>
              );
            })}
            {groups.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No courses match "{query}".</p>}
          </div>
        </div>
      </div>
    </Section>
  );
}
