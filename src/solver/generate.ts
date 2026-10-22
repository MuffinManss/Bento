// Backtracking search over eligible course sets and (lecture, activity)
// combinations, pruned by ./conflicts.ts and Filters, then ranked. Returns
// the top 4 schedules (see algorithm in CLAUDE.md).
//
// Deterministic: no randomness, no locale-dependent sorting — the same
// SolverInput always yields the same ranked list. All search work is capped
// by a node budget so the UI never hangs.

import { hasConflict, toMinutes } from "./conflicts";
import { isGroupSatisfied } from "./eligibility";
import { prereqSatisfied } from "./prereqs";
import type { Course, Day, Filters, Meeting, Offering, Prereq, RequirementGroup, Schedule, ScheduledCourse } from "./types";

export type SolverInput = {
  courses: Course[];
  requirements: RequirementGroup[];
  offerings: Offering[];
  completed: string[];
  filters: Filters;
};

export type GenerateOptions = {
  /** 0-based page of the ranked list; "Regenerate" asks for page + 1. */
  page?: number;
  pageSize?: number;
  /** Cap on search nodes (course-set steps + section placements) so the UI never hangs. */
  maxNodes?: number;
};

export type GenerateResult = {
  schedules: Schedule[];
  page: number;
  /** Size of the whole ranked list (all pages). */
  totalFound: number;
  hasMore: boolean;
  /** True if the node cap cut the search short — totalFound is then a lower bound. */
  truncated: boolean;
};

export const DEFAULT_PAGE_SIZE = 4;
export const DEFAULT_MAX_NODES = 50_000;
/** Section-level node budget per course set, so one set with many section combos can't starve the rest. */
const MAX_NODES_PER_SET = 2_000;
/** Section variants kept per course set (best-scoring first). */
const MAX_SCHEDULES_PER_SET = 20;

const WEEKDAYS: Day[] = ["M", "T", "W", "R", "F"];
const EARLY_CLASS_BEFORE = toMinutes("09:00");
const LONG_GAP_MINUTES = 120;

// ---------------------------------------------------------------------------
// Context: everything derived once from the input
// ---------------------------------------------------------------------------

type Context = {
  catalog: Map<string, Course>;
  completed: ReadonlySet<string>;
  units: Map<string, number>;
  /** Unmet requirement groups, required groups ahead of chooseUnits electives. */
  groups: RequirementGroup[];
  offerings: Map<string, Offering>;
  filters: Filters;
  /** Courses that could possibly be taken this term — the pool for concurrentOk prereq leaves. */
  concurrentPool: ReadonlySet<string>;
};

function isElective(group: RequirementGroup): boolean {
  return group.rule.type === "chooseUnits";
}

function buildContext(input: SolverInput): Context {
  const catalog = new Map(input.courses.map((course) => [course.code, course]));
  const units = new Map(input.courses.map((course) => [course.code, course.units]));
  const completed = new Set(input.completed);
  const offerings = new Map(input.offerings.filter((offering) => offering.lectures.length > 0).map((offering) => [offering.course, offering]));
  // Array.prototype.sort is stable, so groups keep their data order within each tier.
  const groups = input.requirements.filter((group) => !isGroupSatisfied(group, completed, units)).sort((a, b) => Number(isElective(a)) - Number(isElective(b)));
  const concurrentPool = new Set(input.courses.filter((course) => !completed.has(course.code) && course.offered !== false && offerings.has(course.code)).map((course) => course.code));
  return { catalog, completed, units, groups, offerings, filters: input.filters, concurrentPool };
}

// ---------------------------------------------------------------------------
// Requirement assignment (chooseN / chooseUnits capacity, oneOfTracks locking)
// ---------------------------------------------------------------------------

function sumUnits(codes: string[], units: Map<string, number>): number {
  return codes.reduce((total, code) => total + (units.get(code) ?? 0), 0);
}

/** Tracks of a oneOfTracks group still consistent with every course already started (completed or planned). */
function openTracks(tracks: string[][], started: string[]): string[][] {
  return tracks.filter((track) => started.every((code) => track.includes(code)));
}

/** True if `code` can still count toward `group`, given the courses already planned for it this term. */
function groupHasRoom(group: RequirementGroup, code: string, planned: string[], ctx: Context): boolean {
  if (!group.courses.includes(code)) return false;
  const done = group.courses.filter((member) => ctx.completed.has(member));
  const rule = group.rule;
  if (rule.type === "all") return true;
  if (rule.type === "chooseN") return done.length + planned.length < rule.n;
  if (rule.type === "chooseUnits") return sumUnits(done, ctx.units) + sumUnits(planned, ctx.units) < rule.units;
  return openTracks(rule.tracks, [...done, ...planned, code]).length > 0; // oneOfTracks
}

/** First unmet group (required before electives) that `code` can still fill. */
function assignGroup(code: string, plannedByGroup: ReadonlyMap<string, string[]>, ctx: Context): RequirementGroup | undefined {
  return ctx.groups.find((group) => groupHasRoom(group, code, plannedByGroup.get(group.id) ?? [], ctx));
}

// ---------------------------------------------------------------------------
// Why a course can't be scheduled at all (independent of time/day filters)
// ---------------------------------------------------------------------------

export type BlockReason = "unknown" | "completed" | "excluded" | "notOffered" | "noSections" | "otherTrack" | "noRequirement" | "prereqs";

export function describeBlockReason(reason: BlockReason): string {
  const text: Record<BlockReason, string> = {
    unknown: "isn't in the course catalog",
    completed: "is already completed",
    excluded: "is in your excluded courses",
    notOffered: "isn't offered this term",
    noSections: "has no sections in this term's schedule data",
    otherTrack: "is on a different track than the one you've already started",
    noRequirement: "doesn't fill any remaining degree requirement",
    prereqs: "has prerequisites you haven't met",
  };
  return text[reason];
}

function blockReason(code: string, ctx: Context): BlockReason | undefined {
  const course = ctx.catalog.get(code);
  if (!course) return "unknown";
  if (ctx.completed.has(code)) return "completed";
  if (ctx.filters.exclude.includes(code)) return "excluded";
  if (!assignGroup(code, new Map(), ctx)) {
    const lockedOut = ctx.groups.some((group) => group.rule.type === "oneOfTracks" && group.courses.includes(code));
    return lockedOut ? "otherTrack" : "noRequirement";
  }
  if (course.offered === false) return "notOffered";
  if (!ctx.offerings.has(code)) return "noSections";
  if (!prereqSatisfied(course.prereq, ctx.completed, ctx.concurrentPool)) return "prereqs";
  return undefined;
}

/** Why `code` can never appear in a schedule for this input, or undefined if it can (time/day filters aside). */
export function courseBlocker(input: SolverInput, code: string): BlockReason | undefined {
  return blockReason(code, buildContext(input));
}

// ---------------------------------------------------------------------------
// Section options and time filters
// ---------------------------------------------------------------------------

type SectionOption = { lectureId: string; activityId?: string; meetings: Meeting[] };

/** Meetings that occupy real time — an online (async) lecture/activity occupies none. */
function activeMeetings(part: { meetings: Meeting[]; online?: boolean }): Meeting[] {
  return part.online ? [] : part.meetings;
}

/** True if a meeting avoids the student's days off and stays inside their earliest-start/latest-end window. */
export function meetingFitsFilters(meeting: Meeting, filters: Filters): boolean {
  if (meeting.days.some((day) => filters.daysOff.includes(day))) return false;
  if (filters.earliestStart && toMinutes(meeting.start) < toMinutes(filters.earliestStart)) return false;
  if (filters.latestEnd && toMinutes(meeting.end) > toMinutes(filters.latestEnd)) return false;
  return true;
}

/** Every (lecture, linked activity) pair of an offering that fits the filters on its own. */
function sectionOptions(offering: Offering, filters: Filters): SectionOption[] {
  const fits = (meetings: Meeting[]) => meetings.every((meeting) => meetingFitsFilters(meeting, filters));
  const options: SectionOption[] = [];
  for (const lecture of offering.lectures) {
    const lectureMeetings = activeMeetings(lecture);
    if (!fits(lectureMeetings)) continue;
    if (lecture.linked.length === 0) {
      options.push({ lectureId: lecture.id, meetings: lectureMeetings });
      continue;
    }
    for (const activity of lecture.linked) {
      const activityMeetings = activeMeetings(activity);
      if (!fits(activityMeetings) || hasConflict(lectureMeetings, activityMeetings)) continue;
      options.push({ lectureId: lecture.id, activityId: activity.id, meetings: [...lectureMeetings, ...activityMeetings] });
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Priority: lower-division/core first, then courses that unlock the most
// ---------------------------------------------------------------------------

function prereqCourses(prereq: Prereq | undefined): string[] {
  if (!prereq) return [];
  if ("course" in prereq) return [prereq.course];
  return ("and" in prereq ? prereq.and : prereq.or).flatMap(prereqCourses);
}

/** For each catalog course, how many requirement courses it (transitively) unlocks. */
function downstreamCounts(courses: Course[], requirementCodes: ReadonlySet<string>): Map<string, number> {
  const dependents = new Map<string, string[]>();
  for (const course of courses) {
    for (const prereq of prereqCourses(course.prereq)) dependents.set(prereq, [...(dependents.get(prereq) ?? []), course.code]);
  }

  const counts = new Map<string, number>();
  for (const course of courses) {
    const seen = new Set<string>();
    const stack = [...(dependents.get(course.code) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      stack.push(...(dependents.get(next) ?? []));
    }
    counts.set(course.code, [...seen].filter((code) => requirementCodes.has(code)).length);
  }
  return counts;
}

function courseNumber(code: string): number {
  return Number(/\d+/.exec(code)?.[0] ?? 0);
}

function subjectOf(code: string): string {
  return /^[A-Z]+/.exec(code)?.[0] ?? "";
}

/** How much taking `course` toward `group` is worth: required lower-div > required upper-div > electives, plus unlock count. */
function requirementPriority(course: Course, group: RequirementGroup, unlocks: number): number {
  const tier = isElective(group) ? 100 : courseNumber(course.code) < 100 ? 300 : 200;
  const preferred = group.preferSubjects?.includes(subjectOf(course.code)) ? 50 : 0;
  return tier + preferred + Math.min(unlocks, 15) * 3;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type WeekStats = { campusDays: number; longGaps: number; earlyDays: number };

/** Campus days, gaps over 2h between classes, and days starting before 9:00 for a week of meetings. */
export function weekStats(meetings: Meeting[]): WeekStats {
  const stats: WeekStats = { campusDays: 0, longGaps: 0, earlyDays: 0 };
  for (const day of WEEKDAYS) {
    const blocks = meetings
      .filter((meeting) => meeting.days.includes(day))
      .map((meeting) => ({ start: toMinutes(meeting.start), end: toMinutes(meeting.end) }))
      .sort((a, b) => a.start - b.start);
    if (blocks.length === 0) continue;
    stats.campusDays += 1;
    if (blocks[0].start < EARLY_CLASS_BEFORE) stats.earlyDays += 1;
    let lastEnd = blocks[0].end;
    for (const block of blocks.slice(1)) {
      if (block.start - lastEnd > LONG_GAP_MINUTES) stats.longGaps += 1;
      lastEnd = Math.max(lastEnd, block.end);
    }
  }
  return stats;
}

/** Higher is better: requirement priority, minus penalties for campus days, long gaps, and early classes. */
export function scoreSchedule(requirementPriorities: number[], meetings: Meeting[]): number {
  const stats = weekStats(meetings);
  const priority = requirementPriorities.reduce((total, value) => total + value, 0);
  return priority - 25 * stats.campusDays - 15 * stats.longGaps - 10 * stats.earlyDays;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

type Candidate = { course: Course; options: SectionOption[]; priority: number };
type Placed = { candidate: Candidate; group: RequirementGroup };
type Found = { schedule: Schedule; key: string; rankInSet: number };
type Budget = { used: number; max: number };

/** Spends one search node; false once the budget is exhausted. */
function tick(budget: Budget): boolean {
  if (budget.used >= budget.max) return false;
  budget.used += 1;
  return true;
}

function buildCandidates(ctx: Context, unlocks: ReadonlyMap<string, number>): Candidate[] {
  const codes = [...new Set(ctx.groups.flatMap((group) => group.courses))];
  const candidates: Candidate[] = [];
  for (const code of codes) {
    const course = ctx.catalog.get(code);
    const offering = ctx.offerings.get(code);
    const group = assignGroup(code, new Map(), ctx);
    if (!course || !offering || !group || blockReason(code, ctx) !== undefined) continue;
    const options = sectionOptions(offering, ctx.filters);
    if (options.length === 0) continue;
    candidates.push({ course, options, priority: requirementPriority(course, group, unlocks.get(code) ?? 0) });
  }
  return candidates.sort((a, b) => b.priority - a.priority || (a.course.code < b.course.code ? -1 : 1));
}

/** Every conflict-free choice of one section option per placed course (up to the per-set budget). */
function sectionCombos(placed: Placed[], budget: Budget): SectionOption[][] {
  // Most-constrained course first prunes earliest; picks are stored back in `placed` order.
  const order = placed.map((_, index) => index).sort((a, b) => placed[a].candidate.options.length - placed[b].candidate.options.length || a - b);
  const picks: SectionOption[] = [];
  const combos: SectionOption[][] = [];
  let setNodes = 0;

  const place = (depth: number, taken: Meeting[]): void => {
    if (depth === order.length) {
      combos.push([...picks]);
      return;
    }
    const index = order[depth];
    for (const option of placed[index].candidate.options) {
      if (setNodes >= MAX_NODES_PER_SET || !tick(budget)) return;
      setNodes += 1;
      if (hasConflict(taken, option.meetings)) continue;
      picks[index] = option;
      place(depth + 1, [...taken, ...option.meetings]);
    }
  };

  place(0, []);
  return combos;
}

function scheduleKey(courses: ScheduledCourse[]): string {
  return courses.map((course) => `${course.course}:${course.lectureId}:${course.activityId ?? ""}`).join("|");
}

/** Score every section combo of one course set and keep the best few. */
function schedulesForSet(placed: Placed[], combos: SectionOption[][], unlocks: ReadonlyMap<string, number>): Found[] {
  const units = placed.reduce((total, { candidate }) => total + candidate.course.units, 0);
  const priorities = placed.map(({ candidate, group }) => requirementPriority(candidate.course, group, unlocks.get(candidate.course.code) ?? 0));

  const scored = combos.map((combo) => {
    const courses: ScheduledCourse[] = placed.map(({ candidate, group }, index) => ({
      course: candidate.course.code,
      lectureId: combo[index].lectureId,
      ...(combo[index].activityId ? { activityId: combo[index].activityId } : {}),
      requirementId: group.id,
    }));
    const schedule: Schedule = { courses, units, score: scoreSchedule(priorities, combo.flatMap((option) => option.meetings)) };
    return { schedule, key: scheduleKey(courses) };
  });

  return scored
    .sort((a, b) => b.schedule.score - a.schedule.score || (a.key < b.key ? -1 : 1))
    .slice(0, MAX_SCHEDULES_PER_SET)
    .map((entry, rankInSet) => ({ ...entry, rankInSet }));
}

/**
 * The full ranked list of valid schedules (up to the node cap). Ranking
 * favors variety: the best section choice of every distinct course set
 * comes before any second-best section variant of a set already shown.
 */
export function findAllSchedules(input: SolverInput, maxNodes: number = DEFAULT_MAX_NODES): { ranked: Schedule[]; truncated: boolean } {
  const ctx = buildContext(input);
  const { filters } = input;
  const budget: Budget = { used: 0, max: maxNodes };
  const unlocks = downstreamCounts(input.courses, new Set(input.requirements.flatMap((group) => group.courses)));
  const candidates = buildCandidates(ctx, unlocks);
  const empty = { ranked: [], truncated: false };

  const forcedCodes = [...new Set(filters.mustInclude)];
  const forced = forcedCodes.map((code) => candidates.find((candidate) => candidate.course.code === code));
  const optional = candidates.filter((candidate) => !forcedCodes.includes(candidate.course.code));

  const placed: Placed[] = [];
  const plannedByGroup = new Map<string, string[]>();
  const place = (candidate: Candidate): boolean => {
    const group = assignGroup(candidate.course.code, plannedByGroup, ctx);
    if (!group) return false;
    placed.push({ candidate, group });
    plannedByGroup.set(group.id, [...(plannedByGroup.get(group.id) ?? []), candidate.course.code]);
    return true;
  };
  const unplace = (): void => {
    const last = placed.pop();
    if (last) plannedByGroup.set(last.group.id, (plannedByGroup.get(last.group.id) ?? []).slice(0, -1));
  };

  for (const candidate of forced) if (!candidate || !place(candidate)) return empty;
  const forcedUnits = placed.reduce((total, { candidate }) => total + candidate.course.units, 0);
  if (forcedUnits > filters.maxUnits) return empty;

  const found: Found[] = [];
  const visit = (): void => {
    const codes = new Set(placed.map(({ candidate }) => candidate.course.code));
    // A concurrentOk prereq only counts if that course is actually in this same set.
    if (!placed.every(({ candidate }) => prereqSatisfied(candidate.course.prereq, ctx.completed, codes))) return;
    found.push(...schedulesForSet(placed, sectionCombos(placed, budget), unlocks));
  };

  const extend = (start: number, units: number): void => {
    if (!tick(budget)) return;
    if (placed.length > 0 && units >= filters.minUnits) visit();
    for (let index = start; index < optional.length; index++) {
      const candidate = optional[index];
      if (units + candidate.course.units > filters.maxUnits) continue;
      if (!place(candidate)) continue;
      extend(index + 1, units + candidate.course.units);
      unplace();
      if (budget.used >= budget.max) return;
    }
  };

  extend(0, forcedUnits);

  const ranked = found
    .sort((a, b) => a.rankInSet - b.rankInSet || b.schedule.score - a.schedule.score || (a.key < b.key ? -1 : 1))
    .map((entry) => entry.schedule);
  return { ranked, truncated: budget.used >= budget.max };
}

/** One page (default 4) of the ranked schedules. "Regenerate" = same input, page + 1. */
export function generateSchedules(input: SolverInput, options: GenerateOptions = {}): GenerateResult {
  const { page = 0, pageSize = DEFAULT_PAGE_SIZE, maxNodes = DEFAULT_MAX_NODES } = options;
  const { ranked, truncated } = findAllSchedules(input, maxNodes);
  const start = page * pageSize;
  return {
    schedules: ranked.slice(start, start + pageSize),
    page,
    totalFound: ranked.length,
    hasMore: start + pageSize < ranked.length,
    truncated,
  };
}
