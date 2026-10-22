// Defines which courses/sections the MVP solver is ever allowed to schedule:
// undergraduate courses only. Keeps grad courses (200+) and non-standard
// schedule types (independent study, research, internship, colloquium,
// thesis) out of sections.json/courses.json entirely, rather than modeling
// them as oddly-shaped "lectures" that can never be degree requirements.

import type { BannerSection } from "./bannerTypes.ts";

// CS course *numbers* (not codes) explicitly called out as out of scope,
// even though some (e.g. 190) are technically below 200.
const EXCLUDED_CS_COURSE_NUMBERS = new Set(["190", "193", "197", "198I", "287", "290", "297", "298I", "299", "302"]);

// Outside CS, UCR's 190-199 numbers are special studies, research, senior
// thesis, tutoring, and internships (e.g. MATH190, PHYS195A, STAT199H, EE198I).
const NON_CS_EXCLUDED_NUMBER_RE = /^19\d/;

// Section schedule types that are never a regular scheduled class.
const EXCLUDED_SCHEDULE_TYPES = new Set(["Individual Study", "Research", "Internship", "Thesis", "Consultation", "Colloquium", "Term Paper"]);

function courseNumber(subjectCourse: string, subject: string): string {
  return subjectCourse.slice(subject.length);
}

function isGraduateNumber(number: string): boolean {
  const digits = number.match(/^\d+/)?.[0] ?? "";
  return digits.length > 0 && Number(digits) >= 200;
}

/** True if a course (by subject + code, e.g. "MATH", "MATH009A") belongs in the MVP's undergraduate scope. */
export function isInScopeCourse(subject: string, subjectCourse: string): boolean {
  const number = courseNumber(subjectCourse, subject);
  if (isGraduateNumber(number)) return false;
  if (subject === "CS") return !EXCLUDED_CS_COURSE_NUMBERS.has(number);
  return !NON_CS_EXCLUDED_NUMBER_RE.test(number);
}

/** True if a CS section/course belongs in the MVP's undergraduate scope. */
export function isInScopeCsCourse(subjectCourse: string): boolean {
  return isInScopeCourse("CS", subjectCourse);
}

/** True if a section row is an in-scope course AND a regular scheduled schedule type. */
export function isInScopeSection(row: BannerSection): boolean {
  return isInScopeCourse(row.subject, row.subjectCourse) && !EXCLUDED_SCHEDULE_TYPES.has(row.scheduleTypeDescription.trim());
}
