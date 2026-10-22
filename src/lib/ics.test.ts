import { describe, expect, it } from "vitest";
import type { TermMeta } from "../data/index";
import type { Schedule } from "../solver/types";
import { byDay, escapeText, firstOccurrence, foldLine, holidayDates, icsFilename, pacificToUtcStamp, scheduleToIcs } from "./ics";

// Fall 2026: classes 2026-09-24 (a Thursday) through 2026-12-04.
const TERM: TermMeta = {
  term: "202640",
  termLabel: "Fall 2026",
  termStart: "2026-09-24",
  termEnd: "2026-12-04",
  scrapedOn: "2026-10-20",
  holidays: [
    { date: "2026-11-11", name: "Veterans Day" }, // Wednesday
    { date: "2026-11-26", name: "Thanksgiving" }, // Thursday
    { date: "2026-11-27", name: "Thanksgiving" }, // Friday
  ],
};
const NOW = new Date(Date.UTC(2026, 9, 21, 12, 0, 0));

/** Unfolds continuation lines and splits a calendar into content lines. */
const contentLines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);

describe("RRULE pieces", () => {
  it("maps meeting days to BYDAY codes", () => {
    expect(byDay(["M", "W", "F"])).toBe("MO,WE,FR");
    expect(byDay(["T", "R"])).toBe("TU,TH");
  });

  it("starts on the first matching weekday on/after the term start", () => {
    expect(firstOccurrence("2026-09-24", ["T", "R"])).toBe("2026-09-24"); // the Thursday itself
    expect(firstOccurrence("2026-09-24", ["M", "W", "F"])).toBe("2026-09-25"); // next day is Friday
    expect(firstOccurrence("2026-09-24", ["M"])).toBe("2026-09-28"); // skips the weekend
    expect(firstOccurrence("2026-09-24", ["W"])).toBe("2026-09-30");
  });

  it("converts the last day of classes to a UTC UNTIL across the DST change", () => {
    expect(pacificToUtcStamp("2026-12-04", "23:59:59")).toBe("20261205T075959Z"); // PST, UTC-8
    expect(pacificToUtcStamp("2026-09-24", "10:00")).toBe("20260924T170000Z"); // PDT, UTC-7
  });
});

describe("holidays", () => {
  it("only skips holidays that fall on the meeting's days", () => {
    expect(holidayDates(TERM, ["W"])).toEqual(["2026-11-11"]);
    expect(holidayDates(TERM, ["M", "W", "F"])).toEqual(["2026-11-11", "2026-11-27"]);
    expect(holidayDates(TERM, ["T", "R"])).toEqual(["2026-11-26"]);
    expect(holidayDates(TERM, ["M"])).toEqual([]);
  });
});

describe("text escaping and folding", () => {
  it("escapes commas, semicolons, backslashes, and newlines", () => {
    expect(escapeText("Fills: Core; Logic, Design\\Lab\nCRN 1")).toBe("Fills: Core\\; Logic\\, Design\\\\Lab\\nCRN 1");
  });

  it("folds long lines to 75 octets, counting multi-byte characters", () => {
    const folded = foldLine(`DESCRIPTION:${"x".repeat(80)}—${"y".repeat(80)}`);
    const encoder = new TextEncoder();
    for (const line of folded.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"x".repeat(80)}—${"y".repeat(80)}`);
  });
});

describe("scheduleToIcs", () => {
  // CS 100 (lecture TR 14:00 + DIS W 10:00 + LAB F 16:00) and CS 005 (lecture MWF + an online lab).
  const schedule: Schedule = {
    courses: [
      { course: "CS100", lectureId: "35393", activityIds: ["35406", "32724"], requirementId: "cs-bs-ud-core" },
      { course: "CS005", lectureId: "12992", activityIds: ["33958"], requirementId: "cs-bs-ud-tech-electives" },
    ],
    units: 9,
    score: 0,
  };
  const { ics, skipped } = scheduleToIcs(schedule, TERM, 2, NOW);
  const lines = contentLines(ics);
  const events = ics.split("BEGIN:VEVENT").slice(1);

  it("emits one weekly event per in-person meeting and skips online components", () => {
    expect(events).toHaveLength(4); // CS100 LEC, DIS, LAB + CS005 LEC
    expect(skipped).toEqual([{ course: "CS005", kind: "LAB", crn: "33958" }]);
  });

  it("uses TZID local times, the right first date, BYDAY, and UTC UNTIL", () => {
    const lecture = events.find((event) => event.includes("SUMMARY:CS 100 LEC")) ?? "";
    expect(lecture).toContain("DTSTART;TZID=America/Los_Angeles:20260924T140000");
    expect(lecture).toContain("DTEND;TZID=America/Los_Angeles:20260924T152000");
    expect(lecture).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261205T075959Z");
    const lab = events.find((event) => event.includes("SUMMARY:CS 100 LAB")) ?? "";
    expect(lab).toContain("DTSTART;TZID=America/Los_Angeles:20260925T160000"); // first Friday
  });

  it("a Wednesday class has no Nov 11 (Veterans Day) occurrence; Thanksgiving is skipped for TR and F", () => {
    const dis = contentLines(events.find((event) => event.includes("SUMMARY:CS 100 DIS")) ?? ""); // W 10:00
    expect(dis).toContain("EXDATE;TZID=America/Los_Angeles:20261111T100000");
    const lecture = contentLines(events.find((event) => event.includes("SUMMARY:CS 100 LEC")) ?? ""); // TR 14:00
    expect(lecture).toContain("EXDATE;TZID=America/Los_Angeles:20261126T140000");
    const lab = contentLines(events.find((event) => event.includes("SUMMARY:CS 100 LAB")) ?? ""); // F 16:00
    expect(lab).toContain("EXDATE;TZID=America/Los_Angeles:20261127T160000");
    const mwf = contentLines(events.find((event) => event.includes("SUMMARY:CS 005 LEC")) ?? ""); // MWF 10:00
    expect(mwf).toContain("EXDATE;TZID=America/Los_Angeles:20261111T100000,20261127T100000");
  });

  it("titles events 'CS 100 LEC' with location and an escaped description", () => {
    const lecture = contentLines(events.find((event) => event.includes("SUMMARY:CS 100 LEC")) ?? "");
    expect(lecture).toContain("SUMMARY:CS 100 LEC");
    expect(lecture.some((line) => /^LOCATION:\S/.test(line))).toBe(true);
    expect(lecture.find((line) => line.startsWith("DESCRIPTION:"))).toBe("DESCRIPTION:Software Construction\\nCRN 35393 (LEC)\\nFills: Upper-Division CS Core\\nFrom Bento — confirm in R'Web before registering.");
  });

  it("is a well-formed calendar: VTIMEZONE, CRLF endings, unique UIDs, lines <= 75 octets", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:America/Los_Angeles");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
    const uids = lines.filter((line) => line.startsWith("UID:"));
    expect(new Set(uids).size).toBe(uids.length);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  });

  it("names the file after the term and option", () => {
    expect(icsFilename("Fall 2026", 3)).toBe("bento-fall2026-option-3.ics");
  });
});
