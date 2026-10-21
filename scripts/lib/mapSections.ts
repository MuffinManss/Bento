import { cached } from "./cache.ts";
import { hasAsyncComponent, toMeetings } from "./time.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerLinkedSectionsResponse, BannerSection } from "./bannerTypes.ts";
import type { Activity, Lecture, Offering } from "../../src/solver/types.ts";

const ACTIVITY_TYPE: Record<string, Activity["type"] | undefined> = {
  Laboratory: "LAB",
  Discussion: "DIS",
};

// Independent-study-style schedule types have no fixed meeting time by design —
// an empty `meetings` array for these is expected, not worth flagging per section.
const INHERENTLY_UNSCHEDULED_TYPES = new Set(["Individual Study", "Research", "Internship"]);

function primaryInstructor(row: BannerSection): string | undefined {
  return row.faculty.find((f) => f.primaryIndicator)?.displayName ?? row.faculty[0]?.displayName;
}

async function fetchLinked(client: BannerClient, term: string, rawDir: string, crn: string): Promise<BannerSection[]> {
  const cachePath = `${rawDir}/linkedSections/${term}_${crn}.json`;
  const text = await cached(cachePath, () => client.get("/searchResults/fetchLinkedSections", { term, courseReferenceNumber: crn }));
  const parsed = JSON.parse(text) as BannerLinkedSectionsResponse;
  const seen = new Map<string, BannerSection>();
  for (const group of parsed.linkedData ?? []) {
    for (const section of group) seen.set(section.courseReferenceNumber, section);
  }
  return [...seen.values()];
}

function toActivity(row: BannerSection, warnings: string[], asyncByCourse: Map<string, Set<string>>): Activity | undefined {
  const type = ACTIVITY_TYPE[row.scheduleTypeDescription];
  if (!type) {
    warnings.push(`${row.subjectCourse}: linked section CRN ${row.courseReferenceNumber} has scheduleType "${row.scheduleTypeDescription}", which isn't LAB or DIS — skipped (not representable in the Activity type).`);
    return undefined;
  }
  const meetings = toMeetings(row.meetingsFaculty);
  if (meetings.length === 0 && hasAsyncComponent(row.meetingsFaculty)) {
    const set = asyncByCourse.get(row.subjectCourse) ?? new Set<string>();
    set.add(row.courseReferenceNumber);
    asyncByCourse.set(row.subjectCourse, set);
  }
  return { id: row.courseReferenceNumber, type, meetings };
}

export async function buildOfferings(
  client: BannerClient,
  term: string,
  rawDir: string,
  rows: BannerSection[],
): Promise<{ offerings: Offering[]; warnings: string[] }> {
  const warnings: string[] = [];
  const offerings: Offering[] = [];
  const asyncLecturesByCourse = new Map<string, Set<string>>();
  const asyncActivitiesByCourse = new Map<string, Set<string>>();

  const byCourse = new Map<string, BannerSection[]>();
  for (const row of rows) {
    const list = byCourse.get(row.subjectCourse) ?? [];
    list.push(row);
    byCourse.set(row.subjectCourse, list);
  }

  for (const [course, courseRows] of byCourse) {
    const lectureRows = courseRows.filter((r) => r.scheduleTypeDescription === "Lecture");
    const standaloneRows = lectureRows.length > 0 ? [] : courseRows;

    if (lectureRows.length === 0) {
      warnings.push(`${course}: no "Lecture" type section found; treating each of its ${standaloneRows.length} section(s) (${[...new Set(standaloneRows.map((r) => r.scheduleTypeDescription))].join(", ")}) as a standalone Lecture with no linked activity.`);
    }

    const sourceRows = lectureRows.length > 0 ? lectureRows : standaloneRows;
    const lectures: Lecture[] = [];

    for (const row of sourceRows) {
      let linked: Activity[] = [];
      if (row.isSectionLinked) {
        const linkedRows = await fetchLinked(client, term, rawDir, row.courseReferenceNumber);
        linked = linkedRows.map((r) => toActivity(r, warnings, asyncActivitiesByCourse)).filter((a): a is Activity => a !== undefined);
      }
      const meetings = toMeetings(row.meetingsFaculty);
      if (meetings.length === 0 && hasAsyncComponent(row.meetingsFaculty) && !INHERENTLY_UNSCHEDULED_TYPES.has(row.scheduleTypeDescription)) {
        const set = asyncLecturesByCourse.get(course) ?? new Set<string>();
        set.add(row.courseReferenceNumber);
        asyncLecturesByCourse.set(course, set);
      }
      lectures.push({
        id: row.courseReferenceNumber,
        instructor: primaryInstructor(row),
        meetings,
        linked,
      });
    }

    offerings.push({ course, lectures });
  }

  for (const [course, crns] of asyncLecturesByCourse) {
    warnings.push(`${course}: lecture CRN(s) ${[...crns].join(", ")} fully async/online with no scheduled time — "meetings" is empty, so the solver can never detect a conflict for them. Verify this is intentional.`);
  }
  for (const [course, crns] of asyncActivitiesByCourse) {
    warnings.push(`${course}: linked activity CRN(s) ${[...crns].join(", ")} fully async/online with no scheduled time — "meetings" is empty, so the solver can never detect a conflict for them. Verify this is intentional (e.g. an online-only lab/discussion).`);
  }

  return { offerings, warnings };
}
