// Validates src/data/{courses,sections,requirements}.json against the
// solver's data model and cross-references them against each other.
// Run with: npm run validate-data

import { readJson } from "./lib/cache.ts";
import type { Activity, ActivityType, Course, Offering, RequirementGroup } from "../src/solver/types.ts";

const errors: string[] = [];
const warnings: string[] = [];

const COURSE_CODE_RE = /^[A-Z]{2,4}\d{2,3}[A-Z]{0,3}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_VALUES = new Set(["M", "T", "W", "R", "F"]);
const ACTIVITY_TYPES = new Set<string>(["LAB", "DIS", "LCA", "WRK", "ACT", "TUT", "SEM"] satisfies ActivityType[]);

function isPlaceholderCode(code: string): boolean {
  return code.startsWith("TEST:") || code.startsWith("UNRESOLVED:");
}

const PLACEMENT_CODE_RE = /^PLACE:[A-Z]{2,4}\d{2,3}[A-Z]{0,3}$/;

function validatePrereq(prereq: unknown, courseCode: string, path: string): void {
  if (typeof prereq !== "object" || prereq === null) {
    errors.push(`${courseCode}: prereq node at ${path} is not an object.`);
    return;
  }
  const node = prereq as Record<string, unknown>;
  if ("course" in node) {
    if (typeof node.course !== "string" || node.course.length === 0) {
      errors.push(`${courseCode}: prereq leaf at ${path} has a non-string/empty "course".`);
    } else if (!isPlaceholderCode(node.course) && !PLACEMENT_CODE_RE.test(node.course) && !COURSE_CODE_RE.test(node.course)) {
      warnings.push(`${courseCode}: prereq leaf "${node.course}" at ${path} doesn't look like a course code.`);
    }
    if ("concurrentOk" in node && typeof node.concurrentOk !== "boolean") {
      errors.push(`${courseCode}: prereq leaf at ${path} has a non-boolean "concurrentOk".`);
    }
  } else if ("pick" in node) {
    if (!Array.isArray(node.of) || node.of.length === 0) {
      errors.push(`${courseCode}: "pick" at ${path} needs a non-empty "of" array.`);
    } else {
      if (typeof node.pick !== "number" || !Number.isInteger(node.pick) || node.pick < 1 || node.pick > node.of.length) errors.push(`${courseCode}: "pick" at ${path} must be an integer in 1..${node.of.length}.`);
      node.of.forEach((child, i) => validatePrereq(child, courseCode, `${path}.of[${i}]`));
    }
  } else if ("and" in node) {
    if (!Array.isArray(node.and) || node.and.length === 0) {
      errors.push(`${courseCode}: "and" at ${path} must be a non-empty array.`);
    } else {
      node.and.forEach((child, i) => validatePrereq(child, courseCode, `${path}.and[${i}]`));
    }
  } else if ("or" in node) {
    if (!Array.isArray(node.or) || node.or.length === 0) {
      errors.push(`${courseCode}: "or" at ${path} must be a non-empty array.`);
    } else {
      node.or.forEach((child, i) => validatePrereq(child, courseCode, `${path}.or[${i}]`));
    }
  } else {
    errors.push(`${courseCode}: prereq node at ${path} is none of course/and/or/pick.`);
  }
}

function validateCourses(courses: Course[]): Set<string> {
  const codes = new Set<string>();
  for (const course of courses) {
    if (typeof course.code !== "string" || course.code.length === 0) {
      errors.push(`A course entry is missing a valid "code".`);
      continue;
    }
    if (codes.has(course.code)) errors.push(`Duplicate course code "${course.code}" in courses.json.`);
    codes.add(course.code);

    if (typeof course.title !== "string" || course.title.length === 0) errors.push(`${course.code}: missing "title".`);
    if (course.placement) {
      if (!PLACEMENT_CODE_RE.test(course.code)) errors.push(`${course.code}: placement items must use a "PLACE:<course code>" code.`);
      if (course.units !== 0) errors.push(`${course.code}: placement items must have 0 units.`);
      if (course.offered !== false) errors.push(`${course.code}: placement items are checklist-only and must be offered: false.`);
    } else {
      if (!COURSE_CODE_RE.test(course.code)) warnings.push(`${course.code}: code doesn't match the expected SUBJ### pattern.`);
      if (typeof course.units !== "number" || course.units <= 0) errors.push(`${course.code}: "units" must be a positive number, got ${JSON.stringify(course.units)}.`);
    }
    if (course.prereq !== undefined) validatePrereq(course.prereq, course.code, "prereq");
  }
  return codes;
}

function validateMeeting(meeting: unknown, context: string): void {
  if (typeof meeting !== "object" || meeting === null) {
    errors.push(`${context}: meeting is not an object.`);
    return;
  }
  const m = meeting as Record<string, unknown>;
  if (!Array.isArray(m.days) || m.days.length === 0) {
    errors.push(`${context}: meeting "days" must be a non-empty array.`);
  } else {
    for (const d of m.days) if (!DAY_VALUES.has(d as string)) errors.push(`${context}: invalid day "${String(d)}".`);
  }
  if (typeof m.start !== "string" || !TIME_RE.test(m.start)) errors.push(`${context}: invalid "start" time "${String(m.start)}".`);
  if (typeof m.end !== "string" || !TIME_RE.test(m.end)) errors.push(`${context}: invalid "end" time "${String(m.end)}".`);
  if (typeof m.start === "string" && typeof m.end === "string" && TIME_RE.test(m.start) && TIME_RE.test(m.end) && m.end <= m.start) {
    errors.push(`${context}: meeting end (${m.end}) is not after start (${m.start}).`);
  }
}

function validateSections(offerings: Offering[], courseCodes: Set<string>): void {
  const seenLectureIds = new Set<string>();

  for (const offering of offerings) {
    if (!courseCodes.has(offering.course)) {
      warnings.push(`sections.json: offering "${offering.course}" has no matching entry in courses.json.`);
    }
    if (!Array.isArray(offering.lectures) || offering.lectures.length === 0) {
      errors.push(`${offering.course}: offering has no lectures.`);
      continue;
    }
    for (const lecture of offering.lectures) {
      if (typeof lecture.id !== "string" || lecture.id.length === 0) {
        errors.push(`${offering.course}: a lecture is missing a valid "id".`);
        continue;
      }
      if (seenLectureIds.has(lecture.id)) errors.push(`Duplicate lecture id "${lecture.id}" (${offering.course}).`);
      seenLectureIds.add(lecture.id);

      if (lecture.online !== undefined && typeof lecture.online !== "boolean") errors.push(`${offering.course}: lecture ${lecture.id} has a non-boolean "online".`);
      if (lecture.meetings.length === 0 && lecture.online !== true) warnings.push(`${offering.course}: lecture ${lecture.id} has no meetings and isn't marked "online" — the solver can never detect a conflict for it.`);
      lecture.meetings.forEach((m, i) => validateMeeting(m, `${offering.course} lecture ${lecture.id} meetings[${i}]`));

      const groupTypes = new Set<string>();
      for (const group of lecture.linked) {
        if (!ACTIVITY_TYPES.has(group.type)) errors.push(`${offering.course}: lecture ${lecture.id} has a linked group with invalid type "${String(group.type)}".`);
        if (groupTypes.has(group.type)) errors.push(`${offering.course}: lecture ${lecture.id} has two linked groups of type ${group.type} — should be one group per type.`);
        groupTypes.add(group.type);
        if (!Array.isArray(group.activities) || group.activities.length === 0) {
          errors.push(`${offering.course}: lecture ${lecture.id}'s ${group.type} group has no activities — the lecture could never be taken.`);
          continue;
        }
        for (const activity of group.activities) validateActivity(activity, group.type, `${offering.course} lecture ${lecture.id}`);
      }
    }
  }
}

function validateActivity(activity: Activity, groupType: ActivityType, context: string): void {
  if (typeof activity.id !== "string" || activity.id.length === 0) {
    errors.push(`${context}: a linked activity is missing a valid "id".`);
    return;
  }
  if (activity.type !== groupType) errors.push(`${context}: activity ${activity.id} has type "${String(activity.type)}" but sits in the ${groupType} group.`);
  if (activity.online !== undefined && typeof activity.online !== "boolean") errors.push(`${context}: activity ${activity.id} has a non-boolean "online".`);
  if (activity.meetings.length === 0 && activity.online !== true) warnings.push(`${context}: activity ${activity.id} has no meetings and isn't marked "online" — the solver can never detect a conflict for it.`);
  activity.meetings.forEach((m, i) => validateMeeting(m, `${context} activity ${activity.id} meetings[${i}]`));
}

function validateRequirements(groups: RequirementGroup[], courseCodes: Set<string>): void {
  const ids = new Set<string>();
  for (const group of groups) {
    if (typeof group.id !== "string" || group.id.length === 0) {
      errors.push(`A requirement group is missing a valid "id".`);
      continue;
    }
    if (ids.has(group.id)) errors.push(`Duplicate requirement group id "${group.id}".`);
    ids.add(group.id);

    if (!Array.isArray(group.courses) || group.courses.length === 0) {
      errors.push(`${group.id}: "courses" must be a non-empty array.`);
      continue;
    }
    for (const code of group.courses) {
      if (!courseCodes.has(code)) warnings.push(`${group.id}: references course "${code}", which has no entry in courses.json.`);
    }

    const rule = group.rule;
    if (rule.type === "chooseN") {
      if (typeof rule.n !== "number" || rule.n <= 0) errors.push(`${group.id}: chooseN rule has invalid "n".`);
      else if (rule.n > group.courses.length) errors.push(`${group.id}: chooseN n=${rule.n} exceeds its course list length (${group.courses.length}).`);
    } else if (rule.type === "chooseUnits") {
      if (typeof rule.units !== "number" || rule.units <= 0) errors.push(`${group.id}: chooseUnits rule has invalid "units".`);
    } else if (rule.type === "oneOfTracks") {
      if (!Array.isArray(rule.tracks) || rule.tracks.length === 0) {
        errors.push(`${group.id}: oneOfTracks rule needs a non-empty "tracks" array.`);
      } else {
        const trackCourses = new Set<string>();
        rule.tracks.forEach((track, i) => {
          if (!Array.isArray(track) || track.length === 0) errors.push(`${group.id}: oneOfTracks track[${i}] must be a non-empty array.`);
          else track.forEach((c) => trackCourses.add(c));
        });
        for (const c of group.courses) if (!trackCourses.has(c)) warnings.push(`${group.id}: "courses" lists "${c}", which isn't in any oneOfTracks track.`);
        for (const c of trackCourses) if (!group.courses.includes(c)) warnings.push(`${group.id}: oneOfTracks references "${c}", which isn't in "courses".`);
      }
    } else if (rule.type !== "all") {
      errors.push(`${group.id}: unknown rule type "${String((rule as { type: unknown }).type)}".`);
    }

    if (group.preferSubjects !== undefined && (!Array.isArray(group.preferSubjects) || group.preferSubjects.some((s) => typeof s !== "string"))) {
      errors.push(`${group.id}: "preferSubjects" must be an array of strings.`);
    }
  }
}

function main(): void {
  const courses = readJson<Course[]>("src/data/courses.json");
  const offerings = readJson<Offering[]>("src/data/sections.json");
  const requirements = readJson<RequirementGroup[]>("src/data/requirements.json");

  const courseCodes = validateCourses(courses);
  validateSections(offerings, courseCodes);
  if (requirements.length === 0) {
    warnings.push("requirements.json is empty — no degree requirements to validate yet.");
  } else {
    validateRequirements(requirements, courseCodes);
  }

  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);

  console.log(`\n${courses.length} courses, ${offerings.length} offerings, ${requirements.length} requirement groups.`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);

  if (errors.length > 0) process.exit(1);
}

main();
