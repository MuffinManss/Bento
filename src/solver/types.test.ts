import { describe, expect, it } from "vitest";
import type { Activity, Course, Filters, RequirementGroup, Schedule } from "./types";

describe("solver data model", () => {
  it("accepts a well-formed Course", () => {
    const course: Course = {
      code: "CS010A",
      title: "Introduction to Computer Science I",
      units: 4,
      prereq: { or: [{ course: "MATH009A" }, { course: "MATH009HA" }] },
    };

    expect(course.units).toBe(4);
  });

  it("accepts a well-formed Filters object", () => {
    const filters: Filters = {
      minUnits: 12,
      maxUnits: 16,
      daysOff: ["F"],
      mustInclude: [],
      exclude: [],
    };

    expect(filters.daysOff).toContain("F");
  });

  it("accepts a well-formed empty Schedule", () => {
    const schedule: Schedule = { courses: [], units: 0, score: 0 };

    expect(schedule.courses).toHaveLength(0);
  });

  it("marks a fully async/online Activity with no meetings", () => {
    const activity: Activity = { id: "33958", type: "LAB", meetings: [], online: true };

    expect(activity.online).toBe(true);
    expect(activity.meetings).toHaveLength(0);
  });

  it("accepts a oneOfTracks RequirementGroup for the calculus sequence", () => {
    const group: RequirementGroup = {
      id: "cs-bs-ld-calculus-sequence",
      name: "Calculus Sequence (choose one track)",
      rule: { type: "oneOfTracks", tracks: [["MATH005A", "MATH005B", "MATH005C"], ["MATH009A", "MATH009B", "MATH009C"]] },
      courses: ["MATH005A", "MATH005B", "MATH005C", "MATH009A", "MATH009B", "MATH009C"],
    };

    expect(group.rule.type).toBe("oneOfTracks");
    if (group.rule.type === "oneOfTracks") {
      expect(group.rule.tracks).toHaveLength(2);
    }
  });

  it("marks a Course not offered this term", () => {
    const course: Course = { code: "STAT155", title: "Probability and Statistics", units: 4, offered: false };

    expect(course.offered).toBe(false);
  });

  it("treats an omitted offered field as offered", () => {
    const course: Course = { code: "CS010A", title: "Introduction to Computer Science I", units: 4 };

    expect(course.offered).toBeUndefined();
  });

  it("accepts a RequirementGroup with preferSubjects", () => {
    const group: RequirementGroup = {
      id: "cs-bs-ud-tech-electives",
      name: "Technical Electives",
      rule: { type: "chooseUnits", units: 32 },
      preferSubjects: ["CS"],
      courses: ["CS105", "CS108"],
    };

    expect(group.preferSubjects).toEqual(["CS"]);
  });
});
