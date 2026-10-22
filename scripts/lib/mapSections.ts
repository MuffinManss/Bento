import { cached } from "./cache.ts";
import { hasAsyncComponent, toMeetings } from "./time.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerLinkedSectionsResponse, BannerSection } from "./bannerTypes.ts";
import type { Activity, ActivityGroup, ActivityType, Lecture, Offering } from "../../src/solver/types.ts";

// Banner scheduleTypeDescription -> its own meetingType code (see raw/searchResults/*.json).
const ACTIVITY_TYPE: Record<string, ActivityType | undefined> = {
  Laboratory: "LAB",
  Discussion: "DIS",
  "Additional Lecture": "LCA",
  Workshop: "WRK",
  Activity: "ACT",
  Tutorial: "TUT",
  Seminar: "SEM",
};

// Independent-study-style schedule types have no fixed meeting time by design —
// an empty `meetings` array for these is expected, not worth flagging per section.
const INHERENTLY_UNSCHEDULED_TYPES = new Set(["Individual Study", "Research", "Internship"]);

function primaryInstructor(row: BannerSection): string | undefined {
  return row.faculty.find((f) => f.primaryIndicator)?.displayName ?? row.faculty[0]?.displayName;
}

/**
 * Banner's linked sections for a lecture: `linkedData` is a list of every
 * valid combination, each one a complete set of activities to enroll in
 * alongside the lecture (e.g. CS100: [DIS 35404 + LAB 32721], [DIS 35404 + LAB 32723]).
 */
async function fetchLinkedCombos(client: BannerClient, term: string, rawDir: string, crn: string): Promise<BannerSection[][]> {
  const cachePath = `${rawDir}/linkedSections/${term}_${crn}.json`;
  const text = await cached(cachePath, () => client.get("/searchResults/fetchLinkedSections", { term, courseReferenceNumber: crn }));
  const parsed = JSON.parse(text) as BannerLinkedSectionsResponse;
  return parsed.linkedData ?? [];
}

/**
 * Groups a lecture's linked combinations by activity type (one group per
 * type, in first-seen order). The solver takes one activity from EACH
 * group, which is only faithful if Banner's combinations are exactly the
 * cross product of those groups — checked here, and flagged if not.
 */
function toActivityGroups(combos: BannerSection[][], course: string, lectureCrn: string, warnings: string[]): ActivityGroup[] {
  const byType = new Map<ActivityType, Map<string, Activity>>();
  for (const combo of combos) {
    for (const row of combo) {
      const activity = toActivity(row, warnings);
      if (!activity) continue;
      const group = byType.get(activity.type) ?? new Map<string, Activity>();
      group.set(activity.id, activity);
      byType.set(activity.type, group);
    }
  }

  const crossProduct = [...byType.values()].reduce((product, group) => product * group.size, 1);
  const distinctCombos = new Set(combos.map((combo) => combo.map((row) => row.courseReferenceNumber).sort().join("+")));
  const oneOfEachType = combos.every((combo) => combo.length === byType.size && new Set(combo.map((row) => row.scheduleTypeDescription)).size === combo.length);
  if (combos.length > 0 && (!oneOfEachType || crossProduct !== distinctCombos.size)) {
    warnings.push(`${course}: lecture CRN ${lectureCrn}'s ${distinctCombos.size} linked combination(s) aren't the full cross product of its per-type groups (${[...byType].map(([type, group]) => `${group.size} ${type}`).join(" x ")}) — modeled as one-of-each-type anyway, so the solver may offer a combination Banner doesn't allow.`);
  }

  return [...byType].map(([type, group]) => ({ type, activities: [...group.values()] }));
}

function toActivity(row: BannerSection, warnings: string[]): Activity | undefined {
  const type = ACTIVITY_TYPE[row.scheduleTypeDescription.trim()];
  if (!type) {
    warnings.push(`${row.subjectCourse}: linked section CRN ${row.courseReferenceNumber} has scheduleType "${row.scheduleTypeDescription}", which has no ActivityType mapping — skipped (not representable in the Activity type).`);
    return undefined;
  }
  const meetings = toMeetings(row.meetingsFaculty);
  const online = meetings.length === 0 && hasAsyncComponent(row.meetingsFaculty);
  return online ? { id: row.courseReferenceNumber, type, meetings, online: true } : { id: row.courseReferenceNumber, type, meetings };
}

export async function buildOfferings(
  client: BannerClient,
  term: string,
  rawDir: string,
  rows: BannerSection[],
): Promise<{ offerings: Offering[]; warnings: string[] }> {
  const warnings: string[] = [];
  const offerings: Offering[] = [];

  const byCourse = new Map<string, BannerSection[]>();
  for (const row of rows) {
    const list = byCourse.get(row.subjectCourse) ?? [];
    list.push(row);
    byCourse.set(row.subjectCourse, list);
  }

  for (const [course, courseRows] of byCourse) {
    const lectureRows = courseRows.filter((r) => r.scheduleTypeDescription === "Lecture");
    // UCR runs a few courses (e.g. CS179G/CS179M topics sections) as a Discussion
    // + linked Laboratory pair with no separate "Lecture" row at all. Treat the
    // Discussion as the lecture-equivalent primary so it still gets a linked Lab.
    const discussionRows = lectureRows.length === 0 ? courseRows.filter((r) => r.scheduleTypeDescription === "Discussion") : [];
    const standaloneRows = lectureRows.length === 0 && discussionRows.length === 0 ? courseRows : [];

    if (lectureRows.length === 0 && discussionRows.length === 0) {
      warnings.push(`${course}: no "Lecture" type section found; treating each of its ${standaloneRows.length} section(s) (${[...new Set(standaloneRows.map((r) => r.scheduleTypeDescription))].join(", ")}) as a standalone Lecture with no linked activity.`);
    }

    const sourceRows = lectureRows.length > 0 ? lectureRows : discussionRows.length > 0 ? discussionRows : standaloneRows;
    const lectures: Lecture[] = [];

    for (const row of sourceRows) {
      const linked = row.isSectionLinked ? toActivityGroups(await fetchLinkedCombos(client, term, rawDir, row.courseReferenceNumber), course, row.courseReferenceNumber, warnings) : [];
      const meetings = toMeetings(row.meetingsFaculty);
      const online = meetings.length === 0 && hasAsyncComponent(row.meetingsFaculty) && !INHERENTLY_UNSCHEDULED_TYPES.has(row.scheduleTypeDescription);
      lectures.push({
        id: row.courseReferenceNumber,
        instructor: primaryInstructor(row),
        meetings,
        linked,
        ...(online ? { online: true } : {}),
      });
    }

    offerings.push({ course, lectures });
  }

  return { offerings, warnings };
}
