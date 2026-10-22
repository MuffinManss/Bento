// When ./generate.ts finds zero valid schedules, re-runs the search with
// each filter relaxed one at a time and reports which filter(s) are
// blocking a feasible schedule.

import { courseBlocker, describeBlockReason, findAllSchedules } from "./generate";
import type { SolverInput } from "./generate";
import type { Day, Filters } from "./types";

export type RelaxedFilter = "dayOff" | "earliestStart" | "latestEnd" | "minUnits" | "maxUnits" | "mustInclude" | "exclude";

export type Relaxation = {
  filter: RelaxedFilter;
  /** The constraint as the student set it, e.g. "Mon off". */
  constraint: string;
  /** The change that makes a schedule possible, e.g. "removing 'Mon off'". */
  change: string;
  optionCount: number;
  /** True if the search hit its node cap, so optionCount is a lower bound. */
  atLeast: boolean;
};

export type Explanation = {
  feasible: boolean;
  /** mustInclude courses that can never be scheduled this term, regardless of time/day filters. */
  blockedCourses: { course: string; reason: string }[];
  /** Single-filter relaxations that each make at least one schedule possible. */
  relaxations: Relaxation[];
  message: string;
};

const DAY_NAMES: Record<Day, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
/** Unit ceiling used when testing "what if the max-units filter were lifted". */
const RELAXED_MAX_UNITS = 30;
/** Node cap per relaxation re-run — there can be a dozen of them. */
const RELAXATION_MAX_NODES = 10_000;

type Trial = { filter: RelaxedFilter; constraint: string; filters: Filters; change: (unitsFound: number[]) => string };

function without<T>(items: T[], item: T): T[] {
  return items.filter((other) => other !== item);
}

/** Every way to relax exactly one of the student's filters. */
function trials(filters: Filters): Trial[] {
  const removing = (constraint: string) => () => `removing '${constraint}'`;
  const list: Trial[] = [];

  for (const day of filters.daysOff) {
    const constraint = `${DAY_NAMES[day]} off`;
    list.push({ filter: "dayOff", constraint, filters: { ...filters, daysOff: without(filters.daysOff, day) }, change: removing(constraint) });
  }
  if (filters.earliestStart) {
    const constraint = `no class before ${filters.earliestStart}`;
    list.push({ filter: "earliestStart", constraint, filters: { ...filters, earliestStart: undefined }, change: removing(constraint) });
  }
  if (filters.latestEnd) {
    const constraint = `no class after ${filters.latestEnd}`;
    list.push({ filter: "latestEnd", constraint, filters: { ...filters, latestEnd: undefined }, change: removing(constraint) });
  }
  if (filters.minUnits > 0) {
    list.push({
      filter: "minUnits",
      constraint: `at least ${filters.minUnits} units`,
      filters: { ...filters, minUnits: 0 },
      change: (unitsFound) => `lowering the minimum to ${Math.max(...unitsFound)} units`,
    });
  }
  if (filters.maxUnits < RELAXED_MAX_UNITS) {
    list.push({
      filter: "maxUnits",
      constraint: `at most ${filters.maxUnits} units`,
      filters: { ...filters, maxUnits: RELAXED_MAX_UNITS },
      change: (unitsFound) => `raising the maximum to ${Math.min(...unitsFound)} units`,
    });
  }
  for (const code of filters.mustInclude) {
    list.push({ filter: "mustInclude", constraint: `must include ${code}`, filters: { ...filters, mustInclude: without(filters.mustInclude, code) }, change: () => `dropping ${code} from must-include` });
  }
  for (const code of filters.exclude) {
    list.push({ filter: "exclude", constraint: `excluding ${code}`, filters: { ...filters, exclude: without(filters.exclude, code) }, change: () => `allowing ${code}` });
  }
  return list;
}

function formatCount(count: number, atLeast: boolean): string {
  return `${count}${atLeast ? "+" : ""} option${count === 1 && !atLeast ? "" : "s"}`;
}

/** True if nothing at all is schedulable for this student this term, no matter the filters. */
function nothingEligible(input: SolverInput): boolean {
  const openFilters: Filters = { minUnits: 0, maxUnits: RELAXED_MAX_UNITS, daysOff: [], mustInclude: [], exclude: [] };
  return findAllSchedules({ ...input, filters: openFilters }, RELAXATION_MAX_NODES).ranked.length === 0;
}

/**
 * Explains a zero-result search: which must-include courses can never be
 * scheduled, and which single filter, if relaxed, would yield schedules.
 */
export function explainInfeasibility(input: SolverInput): Explanation {
  const base = findAllSchedules(input);
  if (base.ranked.length > 0) {
    return { feasible: true, blockedCourses: [], relaxations: [], message: `${formatCount(base.ranked.length, base.truncated)} fit your filters.` };
  }

  const blockedCourses = input.filters.mustInclude.flatMap((course) => {
    const reason = courseBlocker(input, course);
    return reason ? [{ course, reason: describeBlockReason(reason) }] : [];
  });

  const relaxations: Relaxation[] = [];
  for (const trial of trials(input.filters)) {
    const { ranked, truncated } = findAllSchedules({ ...input, filters: trial.filters }, RELAXATION_MAX_NODES);
    if (ranked.length === 0) continue;
    relaxations.push({
      filter: trial.filter,
      constraint: trial.constraint,
      change: trial.change(ranked.map((schedule) => schedule.units)),
      optionCount: ranked.length,
      atLeast: truncated,
    });
  }

  const sentences = blockedCourses.map(({ course, reason }) => `${course} can't be scheduled: it ${reason}.`);
  if (relaxations.length > 0) {
    const constraints = relaxations.map((relaxation) => relaxation.constraint).join(" AND ");
    const fixes = relaxations.map((relaxation) => `${relaxation.change} gives ${formatCount(relaxation.optionCount, relaxation.atLeast)}`).join("; ");
    sentences.push(`No schedule fits with ${constraints} — ${fixes}.`);
  } else if (nothingEligible(input)) {
    sentences.push("No course offered this term both fills a remaining requirement and has its prerequisites met.");
  } else {
    sentences.push("No schedule fits your filters, and relaxing any single filter doesn't fix it — try relaxing several at once.");
  }

  return { feasible: false, blockedCourses, relaxations, message: sentences.join(" ") };
}
