// Independent schedule validator for tests and the sample-student script.
// Deliberately re-implements its checks from scratch instead of importing
// solver modules, so a bug in the solver can't hide a bug in its own check.

import type { Course, Day, Filters, Meeting, Offering, Prereq, RequirementGroup, Schedule } from "../types";

export type ValidationInput = {
  courses: Course[];
  requirements: RequirementGroup[];
  offerings: Offering[];
  completed: string[];
  filters: Filters;
};

function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function prereqMet(prereq: Prereq | undefined, completed: Set<string>, sameTerm: Set<string>): boolean {
  if (!prereq) return true;
  if ("course" in prereq) return completed.has(prereq.course) || (prereq.concurrentOk === true && sameTerm.has(prereq.course));
  if ("and" in prereq) return prereq.and.every((child) => prereqMet(child, completed, sameTerm));
  if ("pick" in prereq) return prereq.of.filter((child) => prereqMet(child, completed, sameTerm)).length >= prereq.pick;
  return prereq.or.some((child) => prereqMet(child, completed, sameTerm));
}

type Block = { day: Day; start: number; end: number; label: string };

function blocksOf(meetings: Meeting[], label: string): Block[] {
  return meetings.flatMap((meeting) => meeting.days.map((day) => ({ day, start: minutes(meeting.start), end: minutes(meeting.end), label })));
}

/** Every rule violation in `schedule`; an empty array means it's valid. */
export function validateSchedule(schedule: Schedule, input: ValidationInput): string[] {
  const problems: string[] = [];
  const completed = new Set(input.completed);
  const sameTerm = new Set(schedule.courses.map((entry) => entry.course));
  const { filters } = input;
  const blocks: Block[] = [];
  let units = 0;

  if (sameTerm.size !== schedule.courses.length) problems.push("a course appears twice");

  for (const entry of schedule.courses) {
    const course = input.courses.find((candidate) => candidate.code === entry.course);
    if (!course) {
      problems.push(`${entry.course}: not in catalog`);
      continue;
    }
    units += course.units;
    if (completed.has(course.code)) problems.push(`${course.code}: already completed`);
    if (course.offered === false) problems.push(`${course.code}: marked offered: false`);
    if (filters.exclude.includes(course.code)) problems.push(`${course.code}: excluded by filters`);
    if (!prereqMet(course.prereq, completed, sameTerm)) problems.push(`${course.code}: prerequisites not met`);

    const group = input.requirements.find((candidate) => candidate.id === entry.requirementId);
    if (!group || !group.courses.includes(course.code)) problems.push(`${course.code}: doesn't belong to requirement ${entry.requirementId}`);
    if (group && group.rule.type === "oneOfTracks") {
      const started = group.courses.filter((code) => completed.has(code) || sameTerm.has(code));
      if (!group.rule.tracks.some((track) => started.every((code) => track.includes(code)))) problems.push(`${course.code}: mixes ${group.id} tracks`);
    }

    const lecture = input.offerings.find((offering) => offering.course === course.code)?.lectures.find((candidate) => candidate.id === entry.lectureId);
    if (!lecture) {
      problems.push(`${course.code}: lecture ${entry.lectureId} not offered`);
      continue;
    }
    if (!lecture.online) blocks.push(...blocksOf(lecture.meetings, `${course.code} lecture`));
    if (entry.activityIds.length !== lecture.linked.length) {
      problems.push(`${course.code}: lecture ${lecture.id} has ${lecture.linked.length} linked group(s) but ${entry.activityIds.length} activity id(s) were chosen`);
    }
    lecture.linked.forEach((group, index) => {
      const activity = group.activities.find((candidate) => candidate.id === entry.activityIds[index]);
      if (!activity) problems.push(`${course.code}: needs one ${group.type} of lecture ${lecture.id}, got ${entry.activityIds[index] ?? "none"}`);
      else if (!activity.online) blocks.push(...blocksOf(activity.meetings, `${course.code} ${activity.type} ${activity.id}`));
    });
  }

  if (schedule.courses.length === 0) problems.push("empty schedule");
  if (units !== schedule.units) problems.push(`units field ${schedule.units} != actual ${units}`);
  if (units < filters.minUnits || units > filters.maxUnits) problems.push(`${units} units outside [${filters.minUnits}, ${filters.maxUnits}]`);
  for (const code of filters.mustInclude) if (!sameTerm.has(code)) problems.push(`must-include ${code} missing`);

  for (const block of blocks) {
    if (filters.daysOff.includes(block.day)) problems.push(`${block.label} meets on day off ${block.day}`);
    if (filters.earliestStart && block.start < minutes(filters.earliestStart)) problems.push(`${block.label} starts before ${filters.earliestStart}`);
    if (filters.latestEnd && block.end > minutes(filters.latestEnd)) problems.push(`${block.label} ends after ${filters.latestEnd}`);
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const [a, b] = [blocks[i], blocks[j]];
      if (a.day === b.day && a.start < b.end && b.start < a.end) problems.push(`${a.label} overlaps ${b.label} on ${a.day}`);
    }
  }

  return problems;
}
