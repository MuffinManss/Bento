// Exports a generated Schedule (see ../solver/types.ts) as a downloadable
// .ics file for Google Calendar / Apple Calendar / Outlook import.
//
// One weekly recurring event per meeting (lecture and every linked
// activity), from the first matching weekday on/after the term's first day
// of classes until its last day. Times are local to America/Los_Angeles
// (TZID + an embedded VTIMEZONE). Term holidays (meta.json "holidays") are
// removed with EXDATE. Online/async components have no meeting
// time, so they're skipped and returned for the UI to mention instead.

import type { TermMeta } from "../data/index";
import type { Day, Meeting, Schedule } from "../solver/types";
import { courseDetails } from "./scheduleView";
import type { ComponentKind } from "./scheduleView";
import { displayCode, titleCase } from "./catalog";

export const TIMEZONE = "America/Los_Angeles";

const BYDAY: Record<Day, string> = { M: "MO", T: "TU", W: "WE", R: "TH", F: "FR" };
/** Date.getUTCDay() index for each meeting day. */
const WEEKDAY_INDEX: Record<Day, number> = { M: 1, T: 2, W: 3, R: 4, F: 5 };

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TIMEZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export type SkippedComponent = { course: string; kind: ComponentKind; crn: string };

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line to at most 75 octets per line (continuations start with a space). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = chunks.length === 0 ? 75 : 74; // continuation lines spend 1 octet on the leading space
    if (bytes + size > limit) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

/** "MO,WE,FR" for a meeting's days. */
export function byDay(days: Day[]): string {
  return days.map((day) => BYDAY[day]).join(",");
}

/** First date (YYYY-MM-DD) on or after `termStart` that falls on one of `days`. */
export function firstOccurrence(termStart: string, days: Day[]): string {
  const [year, month, date] = termStart.split("-").map(Number);
  const wanted = new Set(days.map((day) => WEEKDAY_INDEX[day]));
  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(Date.UTC(year, month - 1, date + offset));
    if (wanted.has(candidate.getUTCDay())) return candidate.toISOString().slice(0, 10);
  }
  throw new Error(`No meeting day in [${days.join("")}]`);
}

/** America/Los_Angeles offset from UTC in minutes (e.g. -480 for PST) at a given instant. */
function pacificOffsetMinutes(instant: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "shortOffset" }).formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "GMT-8";
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(name);
  if (!match) return 0;
  const hours = Number(match[1]);
  return hours * 60 + Math.sign(hours) * Number(match[2] ?? 0);
}

/** UTC instant of a Pacific wall-clock time, formatted as an iCalendar UTC timestamp (…Z). */
export function pacificToUtcStamp(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes, seconds = 0] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const utc = new Date(naive - pacificOffsetMinutes(new Date(naive)) * 60_000);
  return utcStamp(utc);
}

function utcStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** "2026-09-24", "10:00" -> "20260924T100000" (floating local time, used with TZID). */
function localStamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

/** Holidays (YYYY-MM-DD) that fall on one of the meeting's days between its first occurrence and the term end. */
export function holidayDates(term: TermMeta, days: Day[]): string[] {
  const first = firstOccurrence(term.termStart, days);
  const weekdays = new Set(days.map((day) => WEEKDAY_INDEX[day]));
  return term.holidays
    .map((holiday) => holiday.date)
    .filter((date) => {
      const [year, month, day] = date.split("-").map(Number);
      return date >= first && date <= term.termEnd && weekdays.has(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
    })
    .sort();
}

type EventInput = {
  course: string;
  kind: ComponentKind;
  crn: string;
  title: string;
  requirement: string;
  meeting: Meeting;
};

/** One weekly recurring VEVENT for a single meeting pattern. */
export function meetingEvent(input: EventInput, term: TermMeta, now: Date): string[] {
  const { course, kind, crn, title, requirement, meeting } = input;
  const first = firstOccurrence(term.termStart, meeting.days);
  // EXDATE must match an occurrence exactly: same TZID and the meeting's start time.
  const skipped = holidayDates(term, meeting.days).map((date) => localStamp(date, meeting.start));
  const lines = [
    "BEGIN:VEVENT",
    `UID:${term.term}-${crn}-${meeting.days.join("")}-${meeting.start.replace(":", "")}@bento`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=${TIMEZONE}:${localStamp(first, meeting.start)}`,
    `DTEND;TZID=${TIMEZONE}:${localStamp(first, meeting.end)}`,
    // UNTIL must be UTC when DTSTART has a TZID; end of the last day of classes.
    `RRULE:FREQ=WEEKLY;BYDAY=${byDay(meeting.days)};UNTIL=${pacificToUtcStamp(term.termEnd, "23:59:59")}`,
    ...(skipped.length > 0 ? [`EXDATE;TZID=${TIMEZONE}:${skipped.join(",")}`] : []),
    `SUMMARY:${escapeText(`${displayCode(course)} ${kind}`)}`,
    ...(meeting.location ? [`LOCATION:${escapeText(meeting.location)}`] : []),
    `DESCRIPTION:${escapeText(`${titleCase(title)}\nCRN ${crn} (${kind})\nFills: ${requirement}\nFrom Bento — confirm in R'Web before registering.`)}`,
    "END:VEVENT",
  ];
  return lines;
}

/** The whole option as an .ics calendar, plus the online/async components it couldn't place. */
export function scheduleToIcs(schedule: Schedule, term: TermMeta, optionNumber: number, now: Date = new Date()): { ics: string; skipped: SkippedComponent[] } {
  const events: string[] = [];
  const skipped: SkippedComponent[] = [];
  for (const course of courseDetails(schedule)) {
    for (const component of course.components) {
      if (component.online) {
        skipped.push({ course: course.code, kind: component.kind, crn: component.crn });
        continue;
      }
      for (const meeting of component.meetings) {
        events.push(...meetingEvent({ course: course.code, kind: component.kind, crn: component.crn, title: course.title, requirement: course.requirement, meeting }, term, now));
      }
    }
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bento//UCR Schedule Generator//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`Bento — ${term.termLabel} (Option ${optionNumber})`)}`,
    `X-WR-TIMEZONE:${TIMEZONE}`,
    ...VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ];
  return { ics: `${lines.map(foldLine).join("\r\n")}\r\n`, skipped };
}

/** "bento-fall2026-option-2.ics" */
export function icsFilename(termLabel: string, optionNumber: number): string {
  return `bento-${termLabel.toLowerCase().replace(/[^a-z0-9]/g, "")}-option-${optionNumber}.ics`;
}

/** Triggers a browser download of the .ics text. */
export function downloadIcs(ics: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
