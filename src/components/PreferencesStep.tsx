// Step 2 — filters: major-unit range (+ GE placeholder), time window, days
// off, and must-include / exclude course pickers.

import { displayCode, pickableCourses } from "../lib/catalog";
import type { Day, Filters } from "../solver/types";
import { Chip, Section, SubHeading, formatTime, inputClass } from "./ui";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  geUnits: number;
  onGeUnitsChange: (units: number) => void;
  completed: ReadonlySet<string>;
  problems: string[];
};

const DAYS: { day: Day; label: string }[] = [
  { day: "M", label: "Mon" },
  { day: "T", label: "Tue" },
  { day: "W", label: "Wed" },
  { day: "R", label: "Thu" },
  { day: "F", label: "Fri" },
];

/** 7:00 AM – 10:00 PM in half-hour steps. */
const TIMES = Array.from({ length: 31 }, (_, i) => {
  const total = 7 * 60 + i * 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});

function NumberField({ label, value, onChange, min = 0, max = 30 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || 0)))}
        className={inputClass}
      />
    </label>
  );
}

function TimeField({ label, value, onChange, emptyLabel }: { label: string; value?: string; onChange: (value?: string) => void; emptyLabel: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} className={inputClass}>
        <option value="">{emptyLabel}</option>
        {TIMES.map((time) => (
          <option key={time} value={time}>
            {formatTime(time)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CoursePicker({ label, hint, selected, unavailable, onAdd, onRemove, tone }: { label: string; hint: string; selected: string[]; unavailable: ReadonlySet<string>; onAdd: (code: string) => void; onRemove: (code: string) => void; tone: "emerald" | "rose" }) {
  const options = pickableCourses.filter((course) => !unavailable.has(course.code) && !selected.includes(course.code));
  return (
    <div>
      <SubHeading hint={hint}>{label}</SubHeading>
      <select
        value=""
        onChange={(event) => event.target.value && onAdd(event.target.value)}
        className={inputClass}
        aria-label={label}
      >
        <option value="">Add a course…</option>
        {options.map((course) => (
          <option key={course.code} value={course.code}>
            {displayCode(course.code)} — {course.title.toLowerCase()}
          </option>
        ))}
      </select>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <Chip key={code} tone={tone} onRemove={() => onRemove(code)}>
              {displayCode(code)}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

export function PreferencesStep({ filters, onChange, geUnits, onGeUnitsChange, completed, problems }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggleDay = (day: Day) => set({ daysOff: filters.daysOff.includes(day) ? filters.daysOff.filter((d) => d !== day) : [...filters.daysOff, day] });
  const without = (list: string[], code: string) => list.filter((other) => other !== code);

  return (
    <Section step={2} title="Preferences" subtitle="Bento only suggests schedules that fit all of these.">
      <div className="space-y-6">
        <div>
          <SubHeading>Units</SubHeading>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Major units — min" value={filters.minUnits} onChange={(minUnits) => set({ minUnits })} />
            <NumberField label="Major units — max" value={filters.maxUnits} onChange={(maxUnits) => set({ maxUnits })} />
          </div>
          <div className="mt-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-3">
            <div className="grid grid-cols-2 items-end gap-3">
              <NumberField label="GE / other units" value={geUnits} onChange={onGeUnitsChange} />
              <p className="pb-2 text-sm font-medium text-slate-700">
                Total: {filters.minUnits + geUnits}–{filters.maxUnits + geUnits} units
              </p>
            </div>
            <p className="mt-2 text-xs text-slate-500">Bento schedules your major courses — add GEs separately.</p>
          </div>
        </div>

        <div>
          <SubHeading>Time window</SubHeading>
          <div className="grid grid-cols-2 gap-3">
            <TimeField label="Earliest start" value={filters.earliestStart} onChange={(earliestStart) => set({ earliestStart })} emptyLabel="Any time" />
            <TimeField label="Latest end" value={filters.latestEnd} onChange={(latestEnd) => set({ latestEnd })} emptyLabel="Any time" />
          </div>
        </div>

        <div>
          <SubHeading hint="Tap to keep a day free">Days off</SubHeading>
          <div className="grid grid-cols-5 gap-2">
            {DAYS.map(({ day, label }) => {
              const off = filters.daysOff.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={off}
                  onClick={() => toggleDay(day)}
                  className={`rounded-lg py-2 text-sm font-medium ring-1 ring-inset transition ${off ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <CoursePicker
            label="Must include"
            hint="Always in every option"
            selected={filters.mustInclude}
            unavailable={new Set([...completed, ...filters.exclude])}
            onAdd={(code) => set({ mustInclude: [...filters.mustInclude, code] })}
            onRemove={(code) => set({ mustInclude: without(filters.mustInclude, code) })}
            tone="emerald"
          />
          <CoursePicker
            label="Exclude"
            hint="Never suggest"
            selected={filters.exclude}
            unavailable={new Set([...completed, ...filters.mustInclude])}
            onAdd={(code) => set({ exclude: [...filters.exclude, code] })}
            onRemove={(code) => set({ exclude: without(filters.exclude, code) })}
            tone="rose"
          />
        </div>

        {problems.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200" role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <a href="#results" className="block rounded-lg bg-slate-900 py-2.5 text-center text-sm font-medium text-white lg:hidden">
          See your schedules ↓
        </a>
      </div>
    </Section>
  );
}
