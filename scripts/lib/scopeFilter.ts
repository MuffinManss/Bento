// Defines which CS courses the MVP solver is ever allowed to schedule:
// undergraduate courses only. Keeps grad courses (200+) and non-standard
// schedule types (independent study, research, internship, colloquium) out
// of sections.json/courses.json entirely, rather than modeling them as
// oddly-shaped "lectures" that can never be degree requirements.

// CS course *numbers* (not codes) explicitly called out as out of scope,
// even though some (e.g. 190) are technically below 200.
const EXCLUDED_COURSE_NUMBERS = new Set(["190", "193", "197", "198I", "287", "290", "297", "298I", "299", "302"]);

function courseNumber(subjectCourse: string, subject: string): string {
  return subjectCourse.slice(subject.length);
}

function isGraduateNumber(number: string): boolean {
  const digits = number.match(/^\d+/)?.[0] ?? "";
  return digits.length > 0 && Number(digits) >= 200;
}

/** True if a CS section/course belongs in the MVP's undergraduate scope. */
export function isInScopeCsCourse(subjectCourse: string): boolean {
  const number = courseNumber(subjectCourse, "CS");
  if (EXCLUDED_COURSE_NUMBERS.has(number)) return false;
  if (isGraduateNumber(number)) return false;
  return true;
}
