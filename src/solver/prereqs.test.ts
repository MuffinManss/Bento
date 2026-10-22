import { describe, expect, it } from "vitest";
import { prereqSatisfied } from "./prereqs";
import type { Prereq } from "./types";

describe("prereqSatisfied", () => {
  it("is satisfied when there's no prereq at all", () => {
    expect(prereqSatisfied(undefined, new Set())).toBe(true);
  });

  it("leaf: satisfied once the course is completed", () => {
    const prereq: Prereq = { course: "A" };
    expect(prereqSatisfied(prereq, new Set(["A"]))).toBe(true);
    expect(prereqSatisfied(prereq, new Set())).toBe(false);
  });

  describe("AND", () => {
    const prereq: Prereq = { and: [{ course: "A" }, { course: "B" }] };

    it("requires every child satisfied", () => {
      expect(prereqSatisfied(prereq, new Set(["A", "B"]))).toBe(true);
    });

    it("fails if any one child is missing", () => {
      expect(prereqSatisfied(prereq, new Set(["A"]))).toBe(false);
      expect(prereqSatisfied(prereq, new Set(["B"]))).toBe(false);
      expect(prereqSatisfied(prereq, new Set())).toBe(false);
    });
  });

  describe("OR", () => {
    const prereq: Prereq = { or: [{ course: "A" }, { course: "B" }] };

    it("is satisfied if at least one child is satisfied", () => {
      expect(prereqSatisfied(prereq, new Set(["A"]))).toBe(true);
      expect(prereqSatisfied(prereq, new Set(["B"]))).toBe(true);
      expect(prereqSatisfied(prereq, new Set(["A", "B"]))).toBe(true);
    });

    it("fails only if no child is satisfied", () => {
      expect(prereqSatisfied(prereq, new Set())).toBe(false);
      expect(prereqSatisfied(prereq, new Set(["C"]))).toBe(false);
    });
  });

  describe("nested AND/OR", () => {
    // (A or B) and (C or D) — mirrors the real CS111-style grouping.
    const prereq: Prereq = {
      and: [
        { or: [{ course: "A" }, { course: "B" }] },
        { or: [{ course: "C" }, { course: "D" }] },
      ],
    };

    it("is satisfied once one option from each group is met", () => {
      expect(prereqSatisfied(prereq, new Set(["A", "C"]))).toBe(true);
      expect(prereqSatisfied(prereq, new Set(["B", "D"]))).toBe(true);
    });

    it("fails if one whole group is unmet", () => {
      expect(prereqSatisfied(prereq, new Set(["A", "B"]))).toBe(false);
    });
  });

  describe("concurrentOk", () => {
    it("lets a concurrentOk leaf be satisfied by a concurrently-planned course, not just completed", () => {
      const prereq: Prereq = { course: "A", concurrentOk: true };
      expect(prereqSatisfied(prereq, new Set(), new Set(["A"]))).toBe(true);
    });

    it("still accepts completion outright even when concurrentOk is set", () => {
      const prereq: Prereq = { course: "A", concurrentOk: true };
      expect(prereqSatisfied(prereq, new Set(["A"]), new Set())).toBe(true);
    });

    it("rejects a merely-concurrent course when concurrentOk is NOT set", () => {
      const prereq: Prereq = { course: "A" };
      expect(prereqSatisfied(prereq, new Set(), new Set(["A"]))).toBe(false);
    });

    it("rejects when the course is in neither completed nor concurrent", () => {
      const prereq: Prereq = { course: "A", concurrentOk: true };
      expect(prereqSatisfied(prereq, new Set(), new Set())).toBe(false);
    });
  });

  describe("pick N of M", () => {
    // EE030LA-style: pick 2 of 5.
    const prereq: Prereq = { pick: 2, of: [{ course: "EE020" }, { course: "EE020A", concurrentOk: true }, { course: "EE020B" }, { course: "MATH045" }, { course: "MATH046" }] };

    it("is satisfied by exactly N completed children", () => {
      expect(prereqSatisfied(prereq, new Set(["EE020B", "MATH046"]))).toBe(true);
    });

    it("is not satisfied by fewer than N", () => {
      expect(prereqSatisfied(prereq, new Set(["MATH045"]))).toBe(false);
    });

    it("counts a concurrentOk child that's being taken this term", () => {
      expect(prereqSatisfied(prereq, new Set(["MATH045"]), new Set(["EE020A"]))).toBe(true);
    });

    it("nests inside and/or like any other node", () => {
      const tree: Prereq = { and: [prereq, { or: [{ course: "PHYS040C" }, { course: "PHYS040HC" }] }] };
      expect(prereqSatisfied(tree, new Set(["EE020B", "MATH046", "PHYS040HC"]))).toBe(true);
      expect(prereqSatisfied(tree, new Set(["EE020B", "MATH046"]))).toBe(false);
    });
  });
});
