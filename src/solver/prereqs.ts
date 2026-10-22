// Evaluates prerequisite expression trees (see Prereq in ./types) against
// a student's completed (and optionally in-progress/concurrent) course list.

import type { Prereq } from "./types";

/**
 * True if `prereq` is satisfied: a leaf is satisfied if its course has
 * already been completed, or — only when the leaf is marked
 * `concurrentOk` — if it's among the courses being planned/taken this
 * same term. An "and" node requires every child satisfied; an "or" node
 * requires at least one; a "pick" node requires at least `pick` of its children. A missing prereq (undefined) is trivially
 * satisfied.
 */
export function prereqSatisfied(prereq: Prereq | undefined, completed: ReadonlySet<string>, concurrent: ReadonlySet<string> = new Set()): boolean {
  if (!prereq) return true;

  if ("course" in prereq) {
    if (completed.has(prereq.course)) return true;
    return Boolean(prereq.concurrentOk) && concurrent.has(prereq.course);
  }

  if ("and" in prereq) return prereq.and.every((child) => prereqSatisfied(child, completed, concurrent));

  if ("pick" in prereq) return prereq.of.filter((child) => prereqSatisfied(child, completed, concurrent)).length >= prereq.pick;

  return prereq.or.some((child) => prereqSatisfied(child, completed, concurrent));
}
