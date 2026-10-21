import { decodeEntities } from "./text.ts";
import type { BannerSection } from "./bannerTypes.ts";
import type { Course, Prereq } from "../../src/solver/types.ts";

/** Picks a single representative unit count for a course, flagging variable-unit courses. */
function unitsFor(row: BannerSection, warnings: string[]): number {
  if (row.creditHours !== null && row.creditHours > 0) return row.creditHours;
  if (row.creditHourLow !== null && row.creditHourHigh !== null && row.creditHourLow !== row.creditHourHigh) {
    warnings.push(`${row.subjectCourse}: variable-unit course (${row.creditHourLow}-${row.creditHourHigh}); Course.units only supports one number — used the high end (${row.creditHourHigh}). Verify against the catalog.`);
    return row.creditHourHigh;
  }
  return row.creditHourHigh ?? row.creditHourLow ?? 0;
}

export function buildCourse(row: BannerSection, prereq: Prereq | undefined, warnings: string[], offered = true): Course {
  const course: Course = {
    code: row.subjectCourse,
    title: decodeEntities(row.courseTitle),
    units: unitsFor(row, warnings),
  };
  const withPrereq = prereq ? { ...course, prereq } : course;
  return offered ? withPrereq : { ...withPrereq, offered: false };
}
