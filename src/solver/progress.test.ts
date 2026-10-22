import { describe, expect, it } from "vitest";
import { isGroupSatisfied } from "./eligibility";
import { groupProgress } from "./progress";
import type { RequirementGroup } from "./types";

const units = new Map([
  ["A", 4],
  ["B", 4],
  ["C", 5],
  ["D", 2],
  ["M5A", 5],
  ["M5B", 5],
  ["M5C", 5],
  ["M9A", 4],
  ["M9B", 4],
  ["M9C", 4],
]);
const done = (...codes: string[]) => new Set(codes);

const all: RequirementGroup = { id: "all", name: "Core", rule: { type: "all" }, courses: ["A", "B", "C"] };
const chooseOne: RequirementGroup = { id: "pick", name: "Discrete", rule: { type: "chooseN", n: 1 }, courses: ["A", "B"] };
const electives: RequirementGroup = { id: "units", name: "Electives", rule: { type: "chooseUnits", units: 8 }, courses: ["A", "B", "C", "D"] };
const calculus: RequirementGroup = { id: "calc", name: "Calculus", rule: { type: "oneOfTracks", tracks: [["M5A", "M5B", "M5C"], ["M9A", "M9B", "M9C"]] }, courses: ["M5A", "M5B", "M5C", "M9A", "M9B", "M9C"] };

describe("groupProgress", () => {
  it("all: counts completed courses out of every listed course", () => {
    expect(groupProgress(all, done("A"), units)).toEqual({ met: false, unit: "courses", done: 1, needed: 3 });
    expect(groupProgress(all, done("A", "B", "C"), units)).toMatchObject({ met: true, done: 3, needed: 3 });
  });

  it("chooseN: measures against N, not the list length, and caps at N", () => {
    expect(groupProgress(chooseOne, done(), units)).toEqual({ met: false, unit: "count", done: 0, needed: 1 });
    expect(groupProgress(chooseOne, done("B"), units)).toEqual({ met: true, unit: "count", done: 1, needed: 1 });
    expect(groupProgress(chooseOne, done("A", "B"), units)).toMatchObject({ done: 1, needed: 1 });
  });

  it("chooseUnits: sums units of completed courses in the group, capped at the requirement", () => {
    expect(groupProgress(electives, done("D"), units)).toEqual({ met: false, unit: "units", done: 2, needed: 8 });
    expect(groupProgress(electives, done("D", "C"), units)).toMatchObject({ met: false, done: 7 });
    expect(groupProgress(electives, done("A", "C"), units)).toMatchObject({ met: true, done: 8, needed: 8 });
  });

  it("oneOfTracks: no track before any calc course, then progress through the started track", () => {
    expect(groupProgress(calculus, done(), units)).toEqual({ met: false, unit: "track", done: 0, needed: 3 });
    expect(groupProgress(calculus, done("M9A", "M9B"), units)).toEqual({ met: false, unit: "track", done: 2, needed: 3, track: ["M9A", "M9B", "M9C"] });
    expect(groupProgress(calculus, done("M5A", "M5B", "M5C"), units)).toMatchObject({ met: true, done: 3, track: ["M5A", "M5B", "M5C"] });
  });

  it("previews an option by passing completed ∪ planned (e.g. 2/8 units -> 6/8 units)", () => {
    const completed = done("D");
    const withOption = new Set([...completed, "A"]);
    expect(groupProgress(electives, completed, units).done).toBe(2);
    expect(groupProgress(electives, withOption, units)).toMatchObject({ met: false, done: 6, needed: 8 });
  });

  it("always agrees with the solver's isGroupSatisfied", () => {
    const sets = [done(), done("A"), done("A", "B"), done("A", "B", "C"), done("D", "C"), done("M9A", "M9B", "M9C"), done("M5A", "M9B")];
    for (const group of [all, chooseOne, electives, calculus]) {
      for (const completed of sets) expect(groupProgress(group, completed, units).met).toBe(isGroupSatisfied(group, completed, units));
    }
  });
});
