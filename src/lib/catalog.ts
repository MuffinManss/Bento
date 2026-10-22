// UI-side lookups over the static data (src/data/index.ts), built once.

import { courses, offerings, requirements } from "../data/index";
import { unitsByCode } from "../solver/eligibility";
import type { Activity, Course, Lecture, RequirementGroup, ScheduledCourse } from "../solver/types";

export const courseByCode = new Map(courses.map((course) => [course.code, course]));
export const groupById = new Map(requirements.map((group) => [group.id, group]));
/** Course code -> units, built with the solver's own helper. */
export const unitsMap: ReadonlyMap<string, number> = unitsByCode(courses);
export const catalogCodes: ReadonlySet<string> = new Set(courses.filter((course) => !course.placement).map((course) => course.code));

export const placementItems: Course[] = courses.filter((course) => course.placement);

/** "SOFTWARE CONSTRUCTION" -> "Software Construction" (Banner titles are all caps). */
export function titleCase(title: string): string {
  return title.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

/** "MATH009A" -> "MATH 009A"; placement items show their title instead. */
export function displayCode(code: string): string {
  return code.replace(/^([A-Z]+)(\d)/, "$1 $2");
}

export type ChecklistGroup = { id: string; name: string; courses: Course[] };

/** Completed-courses checklist: one group per requirement group, then everything else (prereqs, alternates). */
export const checklistGroups: ChecklistGroup[] = (() => {
  const inGroups = new Set(requirements.flatMap((group) => group.courses));
  const known = (code: string) => courseByCode.get(code);
  const groups = requirements.map((group) => ({ id: group.id, name: group.name, courses: group.courses.map(known).filter((course): course is Course => course !== undefined) }));
  const other = courses.filter((course) => !course.placement && !inGroups.has(course.code));
  return [...groups, { id: "other", name: "Other courses & prerequisites", courses: other }];
})();

/** Courses a student could pin or exclude: requirement courses with sections this term. */
export const pickableCourses: Course[] = (() => {
  const offered = new Set(offerings.map((offering) => offering.course));
  const inGroups = new Set(requirements.flatMap((group) => group.courses));
  return courses.filter((course) => offered.has(course.code) && inGroups.has(course.code) && course.offered !== false);
})();

export function lectureOf(entry: ScheduledCourse): Lecture | undefined {
  return offerings.find((offering) => offering.course === entry.course)?.lectures.find((lecture) => lecture.id === entry.lectureId);
}

/** The chosen activity from each of the lecture's linked groups, in group order. */
export function activitiesOf(entry: ScheduledCourse, lecture: Lecture | undefined): Activity[] {
  return (lecture?.linked ?? []).flatMap((group, index) => group.activities.filter((activity) => activity.id === entry.activityIds[index]));
}

export function requirementName(id: string): string {
  return (groupById.get(id) as RequirementGroup | undefined)?.name ?? id;
}
