import { describe, expect, it } from "vitest";
import { courses as realCourses, offerings as realOfferings, requirements as realRequirements } from "../data/index";
import { sampleStudents } from "../data/sampleStudents";
import { courseBlocker, findAllSchedules, generateSchedules, scoreSchedule, weekStats } from "./generate";
import type { SolverInput } from "./generate";
import { validateSchedule } from "./testing/validateSchedule";
import type { Activity, Course, Day, Filters, Lecture, Meeting, Offering, RequirementGroup, Schedule } from "./types";

// --- fixture helpers --------------------------------------------------------

function meeting(days: string, start: string, end: string): Meeting {
  return { days: days.split("") as Day[], start, end };
}

/** `groups`: one array per linked activity type; the student takes one activity from each. */
function lecture(id: string, meetings: Meeting[], groups: Activity[][] = [], extra: Partial<Lecture> = {}): Lecture {
  return { id, meetings, linked: groups.map((activities) => ({ type: activities[0].type, activities })), ...extra };
}

function lab(id: string, meetings: Meeting[], extra: Partial<Activity> = {}): Activity {
  return { id, type: "LAB", meetings, ...extra };
}

function dis(id: string, meetings: Meeting[]): Activity {
  return { id, type: "DIS", meetings };
}

function course(code: string, extra: Partial<Course> = {}): Course {
  return { code, title: code, units: 4, ...extra };
}

const filters = (overrides: Partial<Filters> = {}): Filters => ({ minUnits: 4, maxUnits: 12, daysOff: [], mustInclude: [], exclude: [], ...overrides });

/** Small hand-built world: 3 required core courses, a CS-preferred elective group, a calculus track group. */
function world(completed: string[] = [], filterOverrides: Partial<Filters> = {}): SolverInput {
  const courses = [
    course("CS001"),
    course("CS002"),
    course("CS003", { prereq: { course: "CS001" } }),
    course("CS004"),
    course("BIEN100"),
    course("CS005", { offered: false }),
    course("MATH005A"),
    course("MATH005B", { prereq: { course: "MATH005A" } }),
    course("MATH009A"),
    course("MATH009B", { prereq: { course: "MATH009A" } }),
  ];
  const requirements: RequirementGroup[] = [
    { id: "calc", name: "Calculus", rule: { type: "oneOfTracks", tracks: [["MATH005A", "MATH005B"], ["MATH009A", "MATH009B"]] }, courses: ["MATH005A", "MATH005B", "MATH009A", "MATH009B"] },
    { id: "core", name: "Core", rule: { type: "all" }, courses: ["CS001", "CS002", "CS003"] },
    { id: "elect", name: "Electives", rule: { type: "chooseUnits", units: 8 }, preferSubjects: ["CS"], courses: ["BIEN100", "CS004", "CS005"] },
  ];
  const offerings: Offering[] = [
    {
      course: "CS001",
      lectures: [
        lecture("1001", [meeting("MWF", "09:00", "09:50")], [[lab("1002", [meeting("R", "10:00", "11:50")]), lab("1003", [meeting("T", "14:00", "15:50")])]]),
        lecture("1011", [meeting("TR", "11:00", "12:20")], [[lab("1012", [meeting("F", "10:00", "10:50")])]]),
      ],
    },
    { course: "CS002", lectures: [lecture("2001", [meeting("MWF", "09:00", "09:50")]), lecture("2011", [meeting("MW", "13:00", "14:20")])] },
    { course: "CS003", lectures: [lecture("3001", [meeting("TR", "09:30", "10:50")])] },
    // Online: listed meeting times overlap CS001/CS002, but online sections never conflict.
    { course: "CS004", lectures: [lecture("4001", [meeting("MWF", "09:00", "09:50")], [[lab("4002", [meeting("MWF", "09:00", "09:50")], { online: true })]], { online: true })] },
    { course: "BIEN100", lectures: [lecture("5001", [meeting("MW", "13:00", "14:20")])] },
    { course: "CS005", lectures: [lecture("6001", [meeting("T", "16:00", "16:50")])] },
    { course: "MATH005A", lectures: [lecture("7001", [meeting("MWF", "07:00", "07:50")])] },
    { course: "MATH005B", lectures: [lecture("7011", [meeting("MWF", "07:00", "07:50")])] },
    { course: "MATH009A", lectures: [lecture("8001", [meeting("TR", "15:00", "15:50")])] },
    { course: "MATH009B", lectures: [lecture("8011", [meeting("TR", "16:00", "16:50")])] },
  ];
  return { courses, requirements, offerings, completed, filters: filters(filterOverrides) };
}

function allPages(input: SolverInput): Schedule[] {
  const schedules: Schedule[] = [];
  for (let page = 0; ; page++) {
    const result = generateSchedules(input, { page });
    schedules.push(...result.schedules);
    if (!result.hasMore) return schedules;
  }
}

const codesOf = (schedule: Schedule) => schedule.courses.map((entry) => entry.course);

// --- tests ------------------------------------------------------------------

describe("generateSchedules: feasible case", () => {
  const input = world();

  it("returns between 1 and 4 schedules per page", () => {
    const result = generateSchedules(input);
    expect(result.schedules.length).toBeGreaterThan(0);
    expect(result.schedules.length).toBeLessThanOrEqual(4);
  });

  it("every schedule on every page passes the independent validator", () => {
    const schedules = allPages(input);
    expect(schedules.length).toBeGreaterThan(4);
    for (const schedule of schedules) expect(validateSchedule(schedule, input)).toEqual([]);
  });

  it("prefers variety: the top 4 are 4 different course sets", () => {
    const keys = generateSchedules(input).schedules.map((schedule) => codesOf(schedule).sort().join(","));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("paginates for Regenerate: pages don't overlap and together equal the ranked list", () => {
    const { ranked } = findAllSchedules(input);
    const first = generateSchedules(input, { page: 0 });
    const second = generateSchedules(input, { page: 1 });
    expect(first.schedules).toEqual(ranked.slice(0, 4));
    expect(second.schedules).toEqual(ranked.slice(4, 8));
    expect(first.hasMore).toBe(true);
    expect(allPages(input)).toEqual(ranked);
  });

  it("is deterministic: same input gives same output", () => {
    const again = structuredClone(input);
    expect(generateSchedules(again, { page: 1 })).toEqual(generateSchedules(input, { page: 1 }));
    expect(findAllSchedules(again)).toEqual(findAllSchedules(input));
  });

  it("returns schedules sorted best-first within the variety tiers", () => {
    const top = generateSchedules(input).schedules;
    for (let i = 1; i < top.length; i++) expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score);
  });
});

describe("generateSchedules: rules", () => {
  it("a group marked met (manual override or audit block) is never scheduled for", () => {
    const electives = ["BIEN100", "CS004"];
    expect(allPages(world()).some((schedule) => codesOf(schedule).some((code) => electives.includes(code)))).toBe(true);

    const marked = { ...world(), metGroups: ["elect"] };
    const schedules = allPages(marked);
    expect(schedules.length).toBeGreaterThan(0);
    for (const schedule of schedules) {
      expect(codesOf(schedule)).not.toContain("BIEN100");
      expect(codesOf(schedule)).not.toContain("CS004");
      expect(schedule.courses.map((entry) => entry.requirementId)).not.toContain("elect");
    }
    expect(courseBlocker(marked, "CS004")).toBe("noRequirement");
  });

  it("every group marked met leaves nothing to schedule", () => {
    expect(generateSchedules({ ...world(), metGroups: ["calc", "core", "elect"] }).totalFound).toBe(0);
  });

  it("never schedules a course whose prereq isn't completed", () => {
    for (const schedule of allPages(world())) expect(codesOf(schedule)).not.toContain("CS003");
    expect(allPages(world(["CS001"])).some((schedule) => codesOf(schedule).includes("CS003"))).toBe(true);
  });

  it("allows a concurrentOk prereq only when that course is in the same schedule", () => {
    const input = world();
    input.courses = input.courses.map((entry) => (entry.code === "CS003" ? { ...entry, prereq: { course: "CS001", concurrentOk: true } } : entry));
    const schedules = allPages(input);
    const withCS003 = schedules.filter((schedule) => codesOf(schedule).includes("CS003"));
    expect(withCS003.length).toBeGreaterThan(0);
    for (const schedule of withCS003) expect(codesOf(schedule)).toContain("CS001");
  });

  it("keeps units inside [minUnits, maxUnits]", () => {
    const input = world([], { minUnits: 8, maxUnits: 8 });
    const schedules = allPages(input);
    expect(schedules.length).toBeGreaterThan(0);
    for (const schedule of schedules) expect(schedule.units).toBe(8);
  });

  it("forces mustInclude courses into every schedule and never uses excluded ones", () => {
    const input = world([], { mustInclude: ["BIEN100"], exclude: ["CS001"] });
    const schedules = allPages(input);
    expect(schedules.length).toBeGreaterThan(0);
    for (const schedule of schedules) {
      expect(codesOf(schedule)).toContain("BIEN100");
      expect(codesOf(schedule)).not.toContain("CS001");
      expect(validateSchedule(schedule, input)).toEqual([]);
    }
  });

  it("respects days off, earliest start, and latest end", () => {
    const input = world([], { daysOff: ["T"], earliestStart: "09:00", latestEnd: "15:00" });
    const schedules = allPages(input);
    expect(schedules.length).toBeGreaterThan(0);
    for (const schedule of schedules) expect(validateSchedule(schedule, input)).toEqual([]);
    // With Tuesday off, CS001 only fits as lecture 1001 + Thursday lab 1002; MATH005*/MATH009* fall outside 09:00-15:00.
    const cs001 = schedules.flatMap((schedule) => schedule.courses.filter((entry) => entry.course === "CS001"));
    expect(cs001.length).toBeGreaterThan(0);
    for (const entry of cs001) expect([entry.lectureId, ...entry.activityIds]).toEqual(["1001", "1002"]);
    for (const schedule of schedules) expect(codesOf(schedule).some((code) => code.startsWith("MATH0"))).toBe(false);
  });

  it("skips courses with offered: false even if they have a section", () => {
    for (const schedule of allPages(world())) expect(codesOf(schedule)).not.toContain("CS005");
    expect(courseBlocker(world(), "CS005")).toBe("notOffered");
  });

  it("treats online sections as never conflicting, even with listed meeting times", () => {
    const input = world([], { mustInclude: ["CS004", "CS002"] });
    const schedules = allPages(input);
    // CS002 lecture 2001 is MWF 09:00 — same listed time as CS004's online lecture and lab.
    expect(schedules.some((schedule) => schedule.courses.some((entry) => entry.lectureId === "2001"))).toBe(true);
  });

  it("takes one linked activity with each lecture that has them", () => {
    for (const schedule of allPages(world())) {
      const cs001 = schedule.courses.find((entry) => entry.course === "CS001");
      if (cs001) expect(cs001.activityIds).toHaveLength(1);
      const cs002 = schedule.courses.find((entry) => entry.course === "CS002");
      if (cs002) expect(cs002.activityIds).toEqual([]);
    }
  });

  describe("lecture with a DIS group AND a LAB group (like CS100)", () => {
    // Lecture TR 14:00; one DIS (W 10:00) and two LABs — LAB 9003 overlaps the DIS, LAB 9002 doesn't.
    const input: SolverInput = {
      courses: [course("CS100")],
      requirements: [{ id: "core", name: "Core", rule: { type: "all" }, courses: ["CS100"] }],
      offerings: [
        {
          course: "CS100",
          lectures: [
            lecture("9000", [meeting("TR", "14:00", "15:20")], [[dis("9001", [meeting("W", "10:00", "10:50")])], [lab("9002", [meeting("F", "12:00", "13:50")]), lab("9003", [meeting("W", "10:00", "11:50")])]]),
          ],
        },
      ],
      completed: [],
      filters: filters(),
    };

    it("picks exactly one activity from EACH group, skipping combos where they conflict", () => {
      const schedules = allPages(input);
      expect(schedules.map((schedule) => schedule.courses[0].activityIds)).toEqual([["9001", "9002"]]);
      for (const schedule of schedules) expect(validateSchedule(schedule, input)).toEqual([]);
    });

    it("validator rejects a schedule that only takes one of the two groups", () => {
      const missingLab: Schedule = { courses: [{ course: "CS100", lectureId: "9000", activityIds: ["9001"], requirementId: "core" }], units: 4, score: 0 };
      expect(validateSchedule(missingLab, input).join()).toMatch(/2 linked group\(s\) but 1 activity/);
    });

    it("is infeasible when any one group has no activity that fits the filters", () => {
      expect(allPages({ ...input, filters: filters({ daysOff: ["F"] }) })).toEqual([]);
    });
  });

  it("oneOfTracks: never mixes tracks in one schedule before a track is started", () => {
    for (const schedule of allPages(world([], { maxUnits: 16 }))) {
      const codes = codesOf(schedule);
      expect(codes.includes("MATH005A") && codes.includes("MATH009A")).toBe(false);
    }
  });

  it("oneOfTracks: once a track is started, only suggests courses from that track", () => {
    const input = world(["MATH009A"], { maxUnits: 16 });
    const schedules = allPages(input);
    expect(schedules.some((schedule) => codesOf(schedule).includes("MATH009B"))).toBe(true);
    for (const schedule of schedules) {
      expect(codesOf(schedule)).not.toContain("MATH005A");
      expect(codesOf(schedule)).not.toContain("MATH005B");
    }
    expect(courseBlocker(input, "MATH005A")).toBe("otherTrack");
  });

  it("chooseN/chooseUnits: doesn't over-fill a group that only needs one more course", () => {
    // Electives need 8 units; with CS004 done, only one more elective counts.
    for (const schedule of allPages(world(["CS004"], { maxUnits: 16 }))) {
      expect(schedule.courses.filter((entry) => entry.requirementId === "elect").length).toBeLessThanOrEqual(1);
    }
  });

  it("preferSubjects: ranks a CS elective above a non-CS one", () => {
    const input = world(["CS001", "CS002", "CS003", "MATH009A", "MATH009B"], { maxUnits: 4 });
    // Give CS004 the exact same in-person times as BIEN100 so only the subject preference can break the tie
    // (alphabetical order would otherwise favor BIEN100).
    input.offerings = input.offerings.map((offering) => (offering.course === "CS004" ? { course: "CS004", lectures: [lecture("4001", [meeting("MW", "13:00", "14:20")])] } : offering));
    expect(codesOf(generateSchedules(input).schedules[0])).toEqual(["CS004"]);
  });

  it("ranks required lower-division core above electives", () => {
    const top = generateSchedules(world(["MATH009A", "MATH009B"], { maxUnits: 4 })).schedules[0];
    expect(top.courses[0].requirementId).toBe("core");
  });
});

describe("node cap", () => {
  it("stops early, reports truncation, and still returns only valid schedules", () => {
    const input = world([], { maxUnits: 16 });
    const result = generateSchedules(input, { maxNodes: 15 });
    expect(result.truncated).toBe(true);
    for (const schedule of result.schedules) expect(validateSchedule(schedule, input)).toEqual([]);
    expect(findAllSchedules(input).truncated).toBe(false);
  });
});

describe("scoring", () => {
  it("counts campus days, long gaps, and early days", () => {
    const stats = weekStats([meeting("MW", "08:00", "08:50"), meeting("M", "12:00", "12:50"), meeting("F", "10:00", "10:50")]);
    expect(stats).toEqual({ campusDays: 3, longGaps: 1, earlyDays: 2 });
  });

  it("scores fewer campus days higher for the same requirement priority", () => {
    expect(scoreSchedule([100], [meeting("TR", "10:00", "11:20")])).toBeGreaterThan(scoreSchedule([100], [meeting("MWF", "10:00", "10:50")]));
  });
});

describe("real data: sample students", () => {
  for (const student of sampleStudents) {
    it(`${student.name}: finds valid, deterministic schedules`, () => {
      const input: SolverInput = { courses: realCourses, requirements: realRequirements, offerings: realOfferings, completed: student.completed, filters: student.filters };
      const result = generateSchedules(input);
      expect(result.schedules.length).toBeGreaterThan(0);
      expect(result.schedules.length).toBeLessThanOrEqual(4);
      for (const schedule of findAllSchedules(input).ranked) expect(validateSchedule(schedule, input)).toEqual([]);
      expect(generateSchedules(input)).toEqual(result);
    });
  }
});

describe("real data: placement items, pick-N prereqs, checklist-only alternates", () => {
  const input = (completed: string[]): SolverInput => ({
    courses: realCourses,
    requirements: realRequirements,
    offerings: realOfferings,
    completed,
    filters: { minUnits: 4, maxUnits: 20, daysOff: [], mustInclude: [], exclude: [] },
  });

  it("offers MATH009A to an incoming freshman only once their placement is ticked", () => {
    expect(courseBlocker(input([]), "MATH009A")).toBe("prereqs");
    expect(courseBlocker(input(["PLACE:MATH009A"]), "MATH009A")).toBeUndefined();
    expect(findAllSchedules(input(["PLACE:MATH009A"])).ranked.some((schedule) => codesOf(schedule).includes("MATH009A"))).toBe(true);
  });

  it("placement items are checklist-only and never scheduled", () => {
    const placements = realCourses.filter((course) => course.placement);
    expect(placements.length).toBeGreaterThan(0);
    for (const course of placements) expect([course.offered, course.units]).toEqual([false, 0]);
  });

  it("EE030LA unlocks with any 2 of its pick-2 courses plus PHYS 040C (or honors)", () => {
    // (MATH045 + MATH046 together would already fill the 8-unit engineering elective, so mix in EE020B.)
    // Force it in (a 1-unit elective ranks too low to reliably appear within the node cap otherwise).
    const inSomeSchedule = (completed: string[]) => {
      const forced = input(completed);
      return findAllSchedules({ ...forced, filters: { ...forced.filters, mustInclude: ["EE030LA"] } }).ranked.length > 0;
    };
    expect(inSomeSchedule(["EE020B", "MATH045", "PHYS040C"])).toBe(true);
    expect(inSomeSchedule(["EE020B", "MATH046", "PHYS040HC"])).toBe(true);
    // Only 1 of the pick-2 done and no PHYS 040C (which isn't takeable yet): never scheduled.
    expect(inSomeSchedule(["EE020B"])).toBe(false);
  });

  it("ENGR180W can be unlocked by ticking WRIT020", () => {
    expect(realCourses.find((course) => course.code === "WRIT020")?.offered).toBe(false);
    expect(courseBlocker(input([]), "ENGR180W")).toBe("prereqs");
    expect(courseBlocker(input(["WRIT020"]), "ENGR180W")).toBeUndefined();
  });
});
