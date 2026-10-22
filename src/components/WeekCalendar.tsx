// Mon–Fri, 8am–10pm weekly grid with one colored block per meeting.

import { activeBlocks } from "../lib/scheduleView";
import type { CalendarBlock } from "../lib/scheduleView";
import { displayCode } from "../lib/catalog";
import type { Day, Schedule } from "../solver/types";
import { COURSE_COLORS, formatTime } from "./ui";

const DAYS: { day: Day; label: string; name: string }[] = [
  { day: "M", label: "Mon", name: "Monday" },
  { day: "T", label: "Tue", name: "Tuesday" },
  { day: "W", label: "Wed", name: "Wednesday" },
  { day: "R", label: "Thu", name: "Thursday" },
  { day: "F", label: "Fri", name: "Friday" },
];
const KIND_NAMES: Record<string, string> = { LEC: "lecture", DIS: "discussion", LAB: "lab", LCA: "additional lecture", WRK: "workshop", ACT: "activity", TUT: "tutorial", SEM: "seminar" };

/** "CS 100 lecture, Tuesday and Thursday, 2 PM to 3:20 PM, SPR 1102" */
function blockDescription(block: CalendarBlock): string {
  const days = DAYS.filter(({ day }) => block.days.includes(day)).map(({ name }) => name);
  const dayText = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1)}` : days[0];
  return `${displayCode(block.course)} ${KIND_NAMES[block.kind] ?? block.kind}, ${dayText}, ${formatTime(block.start)} to ${formatTime(block.end)}${block.location ? `, ${block.location}` : ""}`;
}
const START_HOUR = 8;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT_REM = 3;

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function position(block: CalendarBlock): { top: string; height: string } {
  const start = Math.max(minutes(block.start), START_HOUR * 60);
  const end = Math.min(minutes(block.end), END_HOUR * 60);
  const perMinute = HOUR_HEIGHT_REM / 60;
  return { top: `${(start - START_HOUR * 60) * perMinute}rem`, height: `${Math.max(end - start, 20) * perMinute}rem` };
}

export function WeekCalendar({ schedule }: { schedule: Schedule }) {
  const blocks = activeBlocks(schedule);
  return (
    <>
    {/* The grid is visual only; screen readers get the same meetings as a list. */}
    <ul className="sr-only" aria-label="Weekly meetings">
      {blocks.map((block) => (
        <li key={block.key}>{blockDescription(block)}</li>
      ))}
    </ul>
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-200" aria-hidden>
      <div className="grid grid-cols-[2.25rem_repeat(5,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-600">
        <div />
        {DAYS.map(({ day, label }) => (
          <div key={day} className="py-2">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[2.25rem_repeat(5,minmax(0,1fr))]">
        <div className="relative" style={{ height: `${HOURS.length * HOUR_HEIGHT_REM}rem` }}>
          {HOURS.map((hour, i) => (
            <span key={hour} className={`absolute right-1 text-[10px] text-slate-500 ${i === 0 ? "translate-y-0.5" : "-translate-y-1/2"}`} style={{ top: `${i * HOUR_HEIGHT_REM}rem` }}>
              {formatTime(`${hour}:00`).replace(" ", "")}
            </span>
          ))}
        </div>
        {DAYS.map(({ day }) => (
          <div key={day} className="relative border-l border-slate-100">
            {HOURS.map((hour, i) => (
              <div key={hour} className="border-t border-slate-100" style={{ height: `${HOUR_HEIGHT_REM}rem`, borderTopWidth: i === 0 ? 0 : undefined }} />
            ))}
            {blocks
              .filter((block) => block.days.includes(day))
              .map((block) => (
                <div
                  key={`${block.key}-${day}`}
                  className={`absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 px-1 py-0.5 text-[10px] leading-[1.15] shadow-sm sm:text-xs ${COURSE_COLORS[block.colorIndex % COURSE_COLORS.length].block} ${block.kind === "LEC" ? "" : "border-dashed"}`}
                  style={position(block)}
                  title={blockDescription(block)}
                >
                  <div className="font-semibold break-words">{displayCode(block.course)}</div>
                  <div className="truncate">
                    {block.kind}
                    <span className="hidden sm:inline"> · {formatTime(block.start)}</span>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
