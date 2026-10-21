import { describe, expect, it } from "vitest";
import type { Course, Filters, Schedule } from "./types";

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
});
