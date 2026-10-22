// Core data model for the Bento scheduler.
// This module has no React imports — the solver is pure TypeScript.

export type Day = "M" | "T" | "W" | "R" | "F";

export type Meeting = {
  days: Day[];
  start: string; // "09:30", 24h
  end: string; // "10:50", 24h
  location?: string;
};

export type Prereq =
  | { course: string; concurrentOk?: boolean }
  | { and: Prereq[] }
  | { or: Prereq[] }
  /** At least `pick` of the `of` children must be satisfied (Banner "Rule: PICKn" blocks). */
  | { pick: number; of: Prereq[] };

export type Course = {
  code: string;
  title: string;
  units: number;
  prereq?: Prereq;
  /** False if the course isn't offered this term — shown in the completed-courses checklist, never scheduled. Omitted (not false) means it is offered. */
  offered?: boolean;
  /** A placement-exam result (code "PLACE:<course>", 0 units), not a course — checklist-only, always offered: false. */
  placement?: boolean;
};

/** Banner meeting-type codes for linked components: lab, discussion, additional lecture, workshop, activity, tutorial, seminar. */
export type ActivityType = "LAB" | "DIS" | "LCA" | "WRK" | "ACT" | "TUT" | "SEM";

export type Activity = {
  id: string;
  type: ActivityType;
  meetings: Meeting[];
  /** Fully async/online component with no fixed meeting time — never conflicts with anything. */
  online?: boolean;
};

/** All of a lecture's linked activities of one type. The student takes exactly ONE from EACH group. */
export type ActivityGroup = {
  type: ActivityType;
  activities: Activity[];
};

export type Lecture = {
  id: string;
  instructor?: string;
  meetings: Meeting[];
  /** One group per linked activity type (e.g. CS100: a DIS group and a LAB group); empty if none. */
  linked: ActivityGroup[];
  /** Fully async/online component with no fixed meeting time — never conflicts with anything. */
  online?: boolean;
};

// UCR rule: a lecture is taken together with one activity from each of its linked groups
// (Banner lists every valid lecture+activities combination; they're always the full cross product of the groups).
export type Offering = {
  course: string;
  lectures: Lecture[];
};

export type RequirementRule =
  | { type: "all" }
  | { type: "chooseN"; n: number }
  | { type: "chooseUnits"; units: number }
  /** Satisfy one whole track (e.g. one of several alternate course sequences), not a mix across tracks. */
  | { type: "oneOfTracks"; tracks: string[][] };

export type RequirementGroup = {
  id: string;
  name: string;
  rule: RequirementRule;
  courses: string[];
  /** Subjects the solver should prefer when picking courses to satisfy this group (e.g. ["CS"]). */
  preferSubjects?: string[];
};

export type Filters = {
  minUnits: number;
  maxUnits: number;
  earliestStart?: string;
  latestEnd?: string;
  daysOff: Day[];
  mustInclude: string[];
  exclude: string[];
};

export type ScheduledCourse = {
  course: string;
  lectureId: string;
  /** One activity id per group in the lecture's `linked`, in the same order. */
  activityIds: string[];
  requirementId: string;
};

export type Schedule = {
  courses: ScheduledCourse[];
  units: number;
  score: number;
};
