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

function toActivity(row: BannerSection, warnings: string[]): Activity | undefined {
  const type = ACTIVITY_TYPE[row.scheduleTypeDescription];
  if (!type) {
    warnings.push(`${row.subjectCourse}: linked section CRN ${row.courseReferenceNumber} has scheduleType "${row.scheduleTypeDescription}", which isn't LAB or DIS — skipped (not representable in the Activity type).`);
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
      let linked: Activity[] = [];
      if (row.isSectionLinked) {
        const linkedRows = await fetchLinked(client, term, rawDir, row.courseReferenceNumber);
        linked = linkedRows.map((r) => toActivity(r, warnings)).filter((a): a is Activity => a !== undefined);
      }
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
