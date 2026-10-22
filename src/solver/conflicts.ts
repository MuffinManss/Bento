// Time-overlap checks between Meeting blocks (see ./types), used to prune
// schedules with conflicting lectures/activities.
//
// A Meeting with no entries (e.g. a fully async/online Lecture/Activity —
// see the `online` flag in ./types) never conflicts with anything: there's
// nothing for the pairwise checks below to compare against.

import type { Meeting } from "./types";

/** Minutes since midnight for a 24h "HH:MM" time. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function shareADay(a: Meeting, b: Meeting): boolean {
  return a.days.some((day) => b.days.includes(day));
}

function timeRangesOverlap(a: Meeting, b: Meeting): boolean {
  // Half-open intervals: touching endpoints (back-to-back) are not an overlap.
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

/** True if two single Meeting blocks overlap: same day AND overlapping times. */
export function meetingsConflict(a: Meeting, b: Meeting): boolean {
  return shareADay(a, b) && timeRangesOverlap(a, b);
}

/** True if any meeting in `a` conflicts with any meeting in `b`. */
export function hasConflict(a: Meeting[], b: Meeting[]): boolean {
  return a.some((meetingA) => b.some((meetingB) => meetingsConflict(meetingA, meetingB)));
}
