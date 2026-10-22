// Small shared UI pieces.

import type { ReactNode } from "react";

export function Section({ id, step, title, subtitle, action, children }: { id?: string; step: number; title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white">{step}</span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Section sub-heading; pass `htmlFor` to make it the visible <label> of a control. */
export function SubHeading({ children, hint, htmlFor, id }: { children: ReactNode; hint?: ReactNode; htmlFor?: string; id?: string }) {
  const className = "text-sm font-semibold uppercase tracking-wide text-slate-600";
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} id={id} className={className}>
          {children}
        </label>
      ) : (
        <h3 id={id} className={className}>
          {children}
        </h3>
      )}
      {hint && <span className="text-xs text-slate-600">{hint}</span>}
    </div>
  );
}

export function Chip({ children, onRemove, removeLabel = "Remove", tone = "slate" }: { children: ReactNode; onRemove?: () => void; removeLabel?: string; tone?: "slate" | "rose" | "emerald" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 rounded-full px-1 hover:bg-black/10" aria-label={removeLabel}>
          ×
        </button>
      )}
    </span>
  );
}

export const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20";
export const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButton = `${buttonClass} bg-rose-600 text-white shadow-sm hover:bg-rose-700`;
export const secondaryButton = `${buttonClass} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`;

/** "13:30" -> "1:30 PM", "09:00" -> "9 AM" */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** One color set per course in a schedule (literal class names so Tailwind keeps them). */
export const COURSE_COLORS = [
  { block: "bg-sky-100 border-sky-500 text-sky-950", dot: "bg-sky-500" },
  { block: "bg-emerald-100 border-emerald-500 text-emerald-950", dot: "bg-emerald-500" },
  { block: "bg-amber-100 border-amber-500 text-amber-950", dot: "bg-amber-500" },
  { block: "bg-violet-100 border-violet-500 text-violet-950", dot: "bg-violet-500" },
  { block: "bg-rose-100 border-rose-500 text-rose-950", dot: "bg-rose-500" },
  { block: "bg-teal-100 border-teal-500 text-teal-950", dot: "bg-teal-500" },
  { block: "bg-orange-100 border-orange-500 text-orange-950", dot: "bg-orange-500" },
  { block: "bg-indigo-100 border-indigo-500 text-indigo-950", dot: "bg-indigo-500" },
];
