// Shapes of the raw JSON Banner returns. Only the fields we actually use
// are declared; Banner's real payloads carry many more (nulls, decorator
// class names, etc.) that we deliberately ignore.

export type BannerMeetingTime = {
  beginTime: string | null; // "0930", 24h, no colon — or null for async/online
  endTime: string | null;
  building: string | null;
  room: string | null;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  meetingType: string; // "LEC" | "LAB" | "DIS" | ...
};

export type BannerMeetingFaculty = {
  meetingTime: BannerMeetingTime;
};

export type BannerFaculty = {
  displayName: string;
  primaryIndicator: boolean;
};

export type BannerSection = {
  courseReferenceNumber: string;
  term: string;
  subject: string;
  subjectDescription: string;
  courseNumber: string;
  subjectCourse: string; // e.g. "CS010A"
  sequenceNumber: string;
  courseTitle: string;
  scheduleTypeDescription: string; // "Lecture" | "Laboratory" | "Discussion" | ...
  creditHours: number | null;
  creditHourLow: number | null;
  creditHourHigh: number | null;
  isSectionLinked: boolean;
  linkIdentifier: string | null;
  faculty: BannerFaculty[];
  meetingsFaculty: BannerMeetingFaculty[];
};

export type BannerSearchResponse = {
  success: boolean;
  totalCount: number;
  data: BannerSection[] | null;
};

export type BannerLinkedSectionsResponse = {
  linkedData: BannerSection[][];
};

export type BannerSubject = {
  code: string;
  description: string;
};
