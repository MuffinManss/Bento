// Turns a Schedule into what the results view draws: calendar blocks,
// online/async components, and per-course details.

import type { ActivityType, Day, Meeting, Schedule } from "../solver/types";
import { activitiesOf, courseByCode, lectureOf, requirementName } from "./catalog";

export type ComponentKind = "LEC" | ActivityType;

export type CalendarBlock = { key: string; course: string; kind: ComponentKind; days: Day[]; start: string; end: string; location?: string; colorIndex: number };

export type CourseComponent = { kind: ComponentKind; crn: string; online: boolean; when: string[]; meetings: Meeting[] };

export type CourseDetails = {
  code: string;
  title: string;
  units: number;
  instructor?: string;
  requirement: string;
  colorIndex: number;
  components: CourseComponent[];
};

/** Lecture + each chosen activity of every course, in schedule order. */
export function courseDetails(schedule: Schedule): CourseDetails[] {
  return schedule.courses.map((entry, colorIndex) => {
    const course = courseByCode.get(entry.course);
    const lecture = lectureOf(entry);
    const parts = [
      { kind: "LEC" as ComponentKind, crn: entry.lectureId, online: Boolean(lecture?.online), meetings: lecture?.meetings ?? [] },
      ...activitiesOf(entry, lecture).map((activity) => ({ kind: activity.type, crn: activity.id, online: Boolean(activity.online), meetings: activity.meetings })),
    ];
    return {
      code: entry.course,
      title: course?.title ?? entry.course,
      units: course?.units ?? 0,
      instructor: lecture?.instructor,
      requirement: requirementName(entry.requirementId),
      colorIndex,
      components: parts.map(({ kind, crn, online, meetings }) => ({
        kind,
        crn,
        // A component with no meeting times is async even if Banner didn't flag it online.
        online: online || meetings.length === 0,
        when: meetings.map((meeting) => `${meeting.days.join("")} ${meeting.start}-${meeting.end}`),
        meetings,
      })),
    };
  });
}

/** Every in-person meeting as a calendar block. */
export function activeBlocks(schedule: Schedule): CalendarBlock[] {
  return schedule.courses.flatMap((entry, colorIndex) => {
    const lecture = lectureOf(entry);
    const parts = [
      { kind: "LEC" as ComponentKind, crn: entry.lectureId, online: lecture?.online, meetings: lecture?.meetings ?? [] },
      ...activitiesOf(entry, lecture).map((activity) => ({ kind: activity.type, crn: activity.id, online: activity.online, meetings: activity.meetings })),
    ];
    return parts
      .filter((part) => !part.online)
      .flatMap((part) => part.meetings.map((meeting, i) => ({ key: `${entry.course}-${part.crn}-${i}`, course: entry.course, kind: part.kind, days: meeting.days, start: meeting.start, end: meeting.end, location: meeting.location, colorIndex })));
  });
}
