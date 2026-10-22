// How far a student is through one requirement group, measured the way the
// group's rule measures it (courses, a chosen number, units, or a track).
// Built on ./eligibility's isGroupSatisfied / completedUnits so the progress
// shown in the UI can never disagree with what the solver treats as met.

import { completedUnits, isGroupSatisfied } from "./eligibility";
import type { RequirementGroup } from "./types";

export type GroupProgress = {
  /** Same answer the solver uses to decide the group no longer needs courses. */
  met: boolean;
  unit: "courses" | "count" | "units" | "track";
  /** Progress toward `needed`, capped at `needed`. */
  done: number;
  needed: number;
  /** oneOfTracks only: the track the student has started (undefined before any track course is completed). */
  track?: string[];
};

/** Progress of `group` given the completed courses (pass completed ∪ planned to preview an option). */
export function groupProgress(group: RequirementGroup, completed: ReadonlySet<string>, units: ReadonlyMap<string, number>): GroupProgress {
  const rule = group.rule;
  const met = isGroupSatisfied(group, completed, units);
  const capped = (done: number, needed: number) => Math.min(done, needed);
  const count = (codes: string[]) => codes.filter((code) => completed.has(code)).length;

  if (rule.type === "all") return { met, unit: "courses", done: capped(count(group.courses), group.courses.length), needed: group.courses.length };
  if (rule.type === "chooseN") return { met, unit: "count", done: capped(count(group.courses), rule.n), needed: rule.n };
  if (rule.type === "chooseUnits") return { met, unit: "units", done: capped(completedUnits(group.courses, completed, units), rule.units), needed: rule.units };

  // oneOfTracks: the started track is the one with the most completed courses (ties -> listed order).
  const best = rule.tracks.reduce((top, track) => (count(track) > count(top) ? track : top), rule.tracks[0]);
  const started = count(best) > 0;
  return { met, unit: "track", done: count(best), needed: best.length, ...(started ? { track: best } : {}) };
}
