import { describe, expect, it } from "vitest";
import { explainInfeasibility } from "./explain";
import { generateSchedules } from "./generate";
import type { SolverInput } from "./generate";
import type { Day, Filters, Offering } from "./types";

/** Three 4-unit courses on disjoint days: X meets MW, Y meets TR, Z meets F. */
function input(overrides: Partial<Filters>): SolverInput {
  const offering = (code: string, id: string, days: Day[]): Offering => ({ course: code, lectures: [{ id, meetings: [{ days, start: "10:00", end: "11:20" }], linked: [] }] });
  return {
    courses: ["X", "Y", "Z", "W"].map((code) => ({ code, title: code, units: 4, ...(code === "W" ? { prereq: { course: "X" } } : {}) })),
    requirements: [{ id: "g", name: "Group", rule: { type: "all" }, courses: ["X", "Y", "Z", "W"] }],
    offerings: [offering("X", "1", ["M", "W"]), offering("Y", "2", ["T", "R"]), offering("Z", "3", ["F"]), offering("W", "4", ["T"])],
    completed: [],
    filters: { minUnits: 8, maxUnits: 12, daysOff: [], mustInclude: [], exclude: [], ...overrides },
  };
}

describe("explainInfeasibility", () => {
  it("names each day off whose removal makes a schedule possible (Mon AND Fri off)", () => {
    const blocked = input({ daysOff: ["M", "F"] });
    expect(generateSchedules(blocked).schedules).toEqual([]);

    const explanation = explainInfeasibility(blocked);
    expect(explanation.feasible).toBe(false);
    expect(explanation.relaxations.map((r) => [r.filter, r.constraint, r.optionCount])).toEqual([
      ["dayOff", "Mon off", 1],
      ["dayOff", "Fri off", 1],
      ["minUnits", "at least 8 units", 1],
    ]);
    expect(explanation.message).toBe(
      "No schedule fits with Mon off AND Fri off AND at least 8 units — removing 'Mon off' gives 1 option; removing 'Fri off' gives 1 option; lowering the minimum to 4 units gives 1 option.",
    );
  });

  it("only lists relaxations that actually help", () => {
    const explanation = explainInfeasibility(input({ earliestStart: "12:00", daysOff: ["F"] }));
    expect(explanation.relaxations.map((r) => r.constraint)).toEqual(["no class before 12:00"]);
    expect(explanation.message).toContain("removing 'no class before 12:00' gives");
  });

  it("says so when no single relaxation is enough", () => {
    const explanation = explainInfeasibility(input({ daysOff: ["M", "T", "F"] }));
    expect(explanation.relaxations).toEqual([]);
    expect(explanation.message).toContain("relaxing any single filter doesn't fix it");
  });

  it("explains a must-include course that can never be scheduled", () => {
    const explanation = explainInfeasibility(input({ mustInclude: ["W"] }));
    expect(explanation.blockedCourses).toEqual([{ course: "W", reason: "has prerequisites you haven't met" }]);
    expect(explanation.message).toMatch(/^W can't be scheduled: it has prerequisites you haven't met\. No schedule fits with must include W — dropping W from must-include gives \d+ options\.$/);
  });

  it("reports when nothing at all is eligible", () => {
    const done = input({});
    done.completed = ["X", "Y", "Z", "W"];
    expect(explainInfeasibility(done).message).toBe("No course offered this term both fills a remaining requirement and has its prerequisites met.");
  });

  it("reports feasibility when schedules exist", () => {
    expect(explainInfeasibility(input({})).feasible).toBe(true);
  });

  it("is deterministic", () => {
    const blocked = input({ daysOff: ["M", "F"] });
    expect(explainInfeasibility(blocked)).toEqual(explainInfeasibility(structuredClone(blocked)));
  });
});
