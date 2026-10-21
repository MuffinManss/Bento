import type { BannerMeetingFaculty, BannerMeetingTime } from "./bannerTypes.ts";
import type { Day, Meeting } from "../../src/solver/types.ts";

function toHHMM(raw: string): string {
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

function days(m: BannerMeetingTime): Day[] {
  const out: Day[] = [];
  if (m.monday) out.push("M");
  if (m.tuesday) out.push("T");
  if (m.wednesday) out.push("W");
  if (m.thursday) out.push("R");
  if (m.friday) out.push("F");
  return out;
}

/**
 * Converts Banner meetingsFaculty entries into Meeting[]. Entries with no
 * begin/end time (fully async/online components) and no scheduled day are
 * dropped — the Meeting type requires start/end strings, and there's no
 * time to assign. See DATA_TODO.md.
 */
export function toMeetings(meetingsFaculty: BannerMeetingFaculty[]): Meeting[] {
  const meetings: Meeting[] = [];
  for (const { meetingTime } of meetingsFaculty) {
    const d = days(meetingTime);
    if (d.length === 0 || !meetingTime.beginTime || !meetingTime.endTime) continue;
    meetings.push({
      days: d,
      start: toHHMM(meetingTime.beginTime),
      end: toHHMM(meetingTime.endTime),
      location: meetingTime.building ? `${meetingTime.building} ${meetingTime.room ?? ""}`.trim() : undefined,
    });
  }
  return meetings;
}

export function hasAsyncComponent(meetingsFaculty: BannerMeetingFaculty[]): boolean {
  return meetingsFaculty.some((m) => !m.meetingTime.beginTime || !m.meetingTime.endTime);
}
