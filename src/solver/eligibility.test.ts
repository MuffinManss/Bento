import { describe, expect, it } from "vitest";
import { eligibleCourses, isGroupSatisfied, unmetRequirementGroups } from "./eligibility";
import type { Course, RequirementGroup } from "./types";

function course(code: string, overrides: Partial<Course> = {}): Course {
  return { code, title: `Course ${code}`, units: 4, ...overrides };
}

describe("eligibleCourses", () => {
  it("excludes courses the student has already completed", () => {
    const courses = [course("A"), course("B")];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Group 1", rule: { type: "all" }, courses: ["A", "B"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set(["A"]) });

    expect(result.map((c) => c.code)).not.toContain("A");
    expect(result.map((c) => c.code)).toContain("B");
  });

  it("excludes courses that don't fill any requirement group at all", () => {
    const courses = [course("A"), course("B")];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Group 1", rule: { type: "all" }, courses: ["A"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set() });

    expect(result.map((c) => c.code)).toEqual(["A"]);
  });

  it("chooseN: either course fills the group while unmet, but once it's met the other course stops being eligible", () => {
    const courses = [course("A"), course("B")];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Choose one", rule: { type: "chooseN", n: 1 }, courses: ["A", "B"] }];

    const beforeAnyCompleted = eligibleCourses(courses, requirements, { completed: new Set() });
    expect(beforeAnyCompleted.map((c) => c.code).sort()).toEqual(["A", "B"]);

    const afterOneCompleted = eligibleCourses(courses, requirements, { completed: new Set(["A"]) });
    // A is excluded for being completed; B is excluded because the group it would have filled is already satisfied.
    expect(afterOneCompleted).toEqual([]);
  });

  it("excludes a course whose prerequisite isn't satisfied, even though it would fill an unmet requirement", () => {
    const courses = [course("A"), course("B", { prereq: { course: "A" } })];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Group 1", rule: { type: "all" }, courses: ["B"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set() });

    expect(result).toEqual([]);
  });

  it("includes a course once its prerequisite is completed", () => {
    const courses = [course("A"), course("B", { prereq: { course: "A" } })];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Group 1", rule: { type: "all" }, courses: ["B"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set(["A"]) });

    expect(result.map((c) => c.code)).toEqual(["B"]);
  });

  it("excludes a course not offered this term", () => {
    const courses = [course("A", { offered: false })];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Group 1", rule: { type: "all" }, courses: ["A"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set() });

    expect(result).toEqual([]);
  });

  it("excludes a course the student explicitly excluded via filters", () => {
    const courses = [course("A"), course("B")];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Group 1", rule: { type: "all" }, courses: ["A", "B"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set(), exclude: new Set(["A"]) });

    expect(result.map((c) => c.code)).toEqual(["B"]);
  });

  it("chooseUnits: a course only fills the group while its unit total is still under the target", () => {
    const courses = [course("A", { units: 4 }), course("B", { units: 4 })];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "8 units", rule: { type: "chooseUnits", units: 8 }, courses: ["A", "B"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set() });
    expect(result.map((c) => c.code).sort()).toEqual(["A", "B"]);

    const afterOneCompleted = eligibleCourses(courses, requirements, { completed: new Set(["A"]) });
    expect(afterOneCompleted.map((c) => c.code)).toEqual(["B"]);
  });

  it("oneOfTracks: a course from either track fills the group until one whole track is completed", () => {
    const courses = [course("A1"), course("A2"), course("B1"), course("B2")];
    const requirements: RequirementGroup[] = [
      { id: "g1", name: "Pick a track", rule: { type: "oneOfTracks", tracks: [["A1", "A2"], ["B1", "B2"]] }, courses: ["A1", "A2", "B1", "B2"] },
    ];

    const partialProgress = eligibleCourses(courses, requirements, { completed: new Set(["A1"]) });
    expect(partialProgress.map((c) => c.code).sort()).toEqual(["A2", "B1", "B2"]);

    const trackAComplete = eligibleCourses(courses, requirements, { completed: new Set(["A1", "A2"]) });
    expect(trackAComplete).toEqual([]);
  });

  it("lets a concurrentOk prerequisite be satisfied by a course taken the same term", () => {
    const courses = [course("A"), course("B", { prereq: { course: "A", concurrentOk: true } })];
    const requirements: RequirementGroup[] = [{ id: "g1", name: "Group 1", rule: { type: "all" }, courses: ["B"] }];

    const result = eligibleCourses(courses, requirements, { completed: new Set(), concurrent: new Set(["A"]) });

    expect(result.map((c) => c.code)).toEqual(["B"]);
  });
});

describe("isGroupSatisfied / unmetRequirementGroups", () => {
  it("variantPrefix: a completed code matching the prefix satisfies a chooseN group", () => {
    const seminar: RequirementGroup = {
      id: "sem", name: "CS 179 Project", rule: { type: "chooseN", n: 1 },
      courses: ["CS179G", "CS179M"], variantPrefix: "CS179",
    };
    expect(isGroupSatisfied(seminar, new Set(["CS179N"]), new Map())).toBe(true);  // variant
    expect(isGroupSatisfied(seminar, new Set(["CS179G"]), new Map())).toBe(true);  // explicit
    expect(isGroupSatisfied(seminar, new Set(["CS178B"]), new Map())).toBe(false); // unrelated
    expect(isGroupSatisfied(seminar, new Set(), new Map())).toBe(false);           // nothing
  });

  it("'all' is satisfied only once every listed course is completed", () => {
    const group: RequirementGroup = { id: "g1", name: "All", rule: { type: "all" }, courses: ["A", "B"] };
    expect(isGroupSatisfied(group, new Set(["A"]), new Map())).toBe(false);
    expect(isGroupSatisfied(group, new Set(["A", "B"]), new Map())).toBe(true);
  });

  it("unmetRequirementGroups filters out groups already satisfied", () => {
    const groups: RequirementGroup[] = [
      { id: "met", name: "Met", rule: { type: "all" }, courses: ["A"] },
      { id: "unmet", name: "Unmet", rule: { type: "all" }, courses: ["B"] },
    ];
    const result = unmetRequirementGroups(groups, new Set(["A"]), new Map());
    expect(result.map((g) => g.id)).toEqual(["unmet"]);
  });

  it("metGroups (audit block COMPLETE / marked met by hand) count as satisfied with no courses completed", () => {
    const groups: RequirementGroup[] = [
      { id: "elect", name: "Elective", rule: { type: "chooseUnits", units: 8 }, courses: ["A", "B"] },
      { id: "core", name: "Core", rule: { type: "all" }, courses: ["C"] },
    ];
    expect(unmetRequirementGroups(groups, new Set(["A"]), new Map([["A", 4]]), new Set(["elect"])).map((g) => g.id)).toEqual(["core"]);
    const courses = [course("A"), course("B"), course("C")];
    expect(eligibleCourses(courses, groups, { completed: new Set(["A"]), metGroups: new Set(["elect"]) }).map((c) => c.code)).toEqual(["C"]);
  });
});
