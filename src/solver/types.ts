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
  | { or: Prereq[] };

export type Course = {
  code: string;
  title: string;
  units: number;
  prereq?: Prereq;
};

export type Activity = {
  id: string;
  type: "LAB" | "DIS";
  meetings: Meeting[];
};

export type Lecture = {
  id: string;
  instructor?: string;
  meetings: Meeting[];
  linked: Activity[];
};

// UCR rule: a lecture and ONE of its linked activities must be taken together.
export type Offering = {
  course: string;
  lectures: Lecture[];
};

export type RequirementGroup = {
  id: string;
  name: string;
  rule: { type: "all" } | { type: "chooseN"; n: number } | { type: "chooseUnits"; units: number };
  courses: string[];
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
  activityId?: string;
  requirementId: string;
};

export type Schedule = {
  courses: ScheduledCourse[];
  units: number;
  score: number;
};
