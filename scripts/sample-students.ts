// Runs the solver against the real data for three sample students and
// prints each schedule as a readable weekly table, so results can be
// checked by eye. Also flags eligible courses missing from section data.
//
//   npm run samples

import { courses, offerings, requirements } from "../src/data/index";
import { sampleStudents } from "../src/data/sampleStudents";
import { explainInfeasibility } from "../src/solver/explain";
import { courseBlocker, generateSchedules, weekStats } from "../src/solver/generate";
import type { SolverInput } from "../src/solver/generate";
import { prereqSatisfied } from "../src/solver/prereqs";
import { validateSchedule } from "../src/solver/testing/validateSchedule";
import type { Activity, Lecture, Meeting, Schedule, ScheduledCourse } from "../src/solver/types";

function table(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()).join("\n");
}

function when(meetings: Meeting[], online: boolean | undefined): string[] {
  if (online || meetings.length === 0) return ["online/async"];
  return meetings.map((meeting) => `${meeting.days.join("").padEnd(3)} ${meeting.start}-${meeting.end}${meeting.location ? `  ${meeting.location}` : ""}`);
}

function lectureOf(entry: ScheduledCourse): Lecture | undefined {
  return offerings.find((offering) => offering.course === entry.course)?.lectures.find((candidate) => candidate.id === entry.lectureId);
}

/** The chosen activity from each of the lecture's linked groups. */
function activitiesOf(entry: ScheduledCourse, lecture: Lecture | undefined): Activity[] {
  return (lecture?.linked ?? []).flatMap((group, index) => group.activities.filter((activity) => activity.id === entry.activityIds[index]));
}

function scheduleTable(schedule: Schedule): string {
  const rows: string[][] = [["Course", "Title", "Part", "CRN", "Days/time", "Requirement"]];
  for (const entry of schedule.courses) {
    const course = courses.find((candidate) => candidate.code === entry.course);
    const lecture = lectureOf(entry);
    const requirement = requirements.find((group) => group.id === entry.requirementId)?.name ?? entry.requirementId;
    const lectureTimes = when(lecture?.meetings ?? [], lecture?.online);
    lectureTimes.forEach((time, index) => rows.push(index === 0 ? [entry.course, (course?.title ?? "").slice(0, 32), "LEC", entry.lectureId, time, requirement] : ["", "", "", "", time, ""]));
    for (const activity of activitiesOf(entry, lecture)) {
      when(activity.meetings, activity.online).forEach((time, index) => rows.push(["", "", index === 0 ? activity.type : "", index === 0 ? activity.id : "", time, ""]));
    }
  }
  return table(rows);
}

function meetingsOf(schedule: Schedule): Meeting[] {
  return schedule.courses.flatMap((entry) => {
    const lecture = lectureOf(entry);
    return [...(lecture && !lecture.online ? lecture.meetings : []), ...activitiesOf(entry, lecture).flatMap((activity) => (activity.online ? [] : activity.meetings))];
  });
}

/** Requirement courses the student could take (prereqs met) but that have no section data this term. */
function missingSectionData(input: SolverInput): string[] {
  const completed = new Set(input.completed);
  const codes = [...new Set(requirements.flatMap((group) => group.courses))];
  return codes.filter((code) => {
    const course = courses.find((candidate) => candidate.code === code);
    return course && courseBlocker(input, code) === "noSections" && prereqSatisfied(course.prereq, completed);
  });
}

for (const student of sampleStudents) {
  const input: SolverInput = { courses, requirements, offerings, completed: student.completed, filters: student.filters };
  const { filters } = student;
  console.log("=".repeat(100));
  console.log(student.name);
  console.log(`Completed: ${student.completed.join(", ")}`);
  console.log(
    `Filters: ${filters.minUnits}-${filters.maxUnits} units` +
      (filters.daysOff.length ? `, days off ${filters.daysOff.join("")}` : "") +
      (filters.earliestStart ? `, start >= ${filters.earliestStart}` : "") +
      (filters.latestEnd ? `, end <= ${filters.latestEnd}` : ""),
  );
  const missing = missingSectionData(input);
  if (missing.length) console.log(`Eligible but NO SECTION DATA this term (can't be scheduled): ${missing.join(", ")}`);

  const result = generateSchedules(input);
  console.log(`Found ${result.totalFound}${result.truncated ? "+ (node cap hit)" : ""} schedules; showing top ${result.schedules.length}.`);
  if (result.schedules.length === 0) console.log(explainInfeasibility(input).message);

  result.schedules.forEach((schedule, index) => {
    const stats = weekStats(meetingsOf(schedule));
    const problems = validateSchedule(schedule, input);
    console.log("");
    console.log(
      `Option ${index + 1}: ${schedule.units} units | score ${schedule.score} | ${stats.campusDays} campus days, ${stats.longGaps} gaps >2h, ${stats.earlyDays} early days | ` +
        (problems.length ? `INVALID: ${problems.join("; ")}` : "validator OK"),
    );
    console.log(scheduleTable(schedule));
  });
  console.log("");
}
