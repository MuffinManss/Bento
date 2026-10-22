// Determines which courses a student can/should take this term: not already
// completed, prereqs satisfied (via ./prereqs), fills an unmet requirement
// group, offered this term, and not excluded by filters.

import { prereqSatisfied } from "./prereqs";
import type { Course, RequirementGroup } from "./types";

export function unitsByCode(courses: Course[]): Map<string, number> {
  const units = new Map<string, number>();
  for (const course of courses) units.set(course.code, course.units);
  return units;
}

/** Total units of the listed courses that are in `completed`. */
export function completedUnits(courseCodes: string[], completed: ReadonlySet<string>, units: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const code of courseCodes) if (completed.has(code)) total += units.get(code) ?? 0;
  return total;
}

/** True if a requirement group is already fully satisfied by completed courses. */
export function isGroupSatisfied(group: RequirementGroup, completed: ReadonlySet<string>, units: ReadonlyMap<string, number>): boolean {
  const rule = group.rule;
  if (rule.type === "all") return group.courses.every((code) => completed.has(code));
  if (rule.type === "chooseN") {
    let n = group.courses.filter((code) => completed.has(code)).length;
    if (n < rule.n && group.variantPrefix !== undefined) {
      const prefix = group.variantPrefix;
      n += [...completed].filter((c) => c.startsWith(prefix) && !group.courses.includes(c)).length;
    }
    return n >= rule.n;
  }
  if (rule.type === "chooseUnits") return completedUnits(group.courses, completed, units) >= rule.units;
  return rule.tracks.some((track) => track.every((code) => completed.has(code))); // oneOfTracks
}

/**
 * Requirement groups not yet fully satisfied by completed courses. Groups in
 * `metGroups` count as satisfied regardless of courses (block COMPLETE on the
 * student's audit, or marked met by hand for an advisor exception).
 */
export function unmetRequirementGroups(requirements: RequirementGroup[], completed: ReadonlySet<string>, units: ReadonlyMap<string, number>, metGroups: ReadonlySet<string> = new Set()): RequirementGroup[] {
  return requirements.filter((group) => !metGroups.has(group.id) && !isGroupSatisfied(group, completed, units));
}

export type EligibilityOptions = {
  completed: ReadonlySet<string>;
  /** Courses being planned/taken this same term — only relevant to prereq leaves marked concurrentOk. */
  concurrent?: ReadonlySet<string>;
  /** Courses the student has filtered out and never wants scheduled. */
  exclude?: ReadonlySet<string>;
  /** Requirement group ids to treat as satisfied (see unmetRequirementGroups). */
  metGroups?: ReadonlySet<string>;
};

/**
 * Courses the student is both allowed and has a reason to take: not
 * already completed, prerequisites satisfied, offered this term, not
 * excluded, and counts toward at least one requirement group that isn't
 * already fully satisfied.
 */
export function eligibleCourses(courses: Course[], requirements: RequirementGroup[], options: EligibilityOptions): Course[] {
  const { completed, concurrent = new Set<string>(), exclude = new Set<string>(), metGroups } = options;
  const units = unitsByCode(courses);
  const unmetCourseCodes = new Set(unmetRequirementGroups(requirements, completed, units, metGroups).flatMap((group) => group.courses));

  return courses.filter((course) => {
    if (completed.has(course.code)) return false;
    if (exclude.has(course.code)) return false;
    if (course.offered === false) return false;
    if (!unmetCourseCodes.has(course.code)) return false;
    return prereqSatisfied(course.prereq, completed, concurrent);
  });
}
