// A tiny stand-in for src/data/index.ts, for tests of the view/formatter/export
// layer (scheduleView, advisorText, ics). Those take a Schedule of CRNs and
// look the sections up in the catalog, so pointing them at the real scraped
// data made them fail every time a new term was scraped and those CRNs went
// away. The shape here is copied from real Banner data (CS 100 and CS 005 as
// published for Fall 2026) — enough to cover a lecture with two linked
// activity groups, a choice of lab sections, and an online/async component.
//
// Tests mock the data module with it:
//   vi.mock("../data/index", async () => await import("./testing/fixtureCatalog"));

import type { Course, Offering, RequirementGroup } from "../../solver/types";
import type { TermMeta } from "../../data/index";

export const courses: Course[] = [
  { code: "CS100", title: "SOFTWARE CONSTRUCTION", units: 5, prereq: { course: "CS010C" } },
  { code: "CS005", title: "INTRODUCTION TO COMPUTER PROGRAMMING", units: 4 },
  { code: "CS010C", title: "INTRODUCTION TO DATA STRUCTURES AND ALGORITHMS", units: 4 },
];

export const requirements: RequirementGroup[] = [
  { id: "cs-bs-ud-core", name: "Upper-Division CS Core", rule: { type: "all" }, courses: ["CS100"] },
  { id: "cs-bs-ud-tech-electives", name: "Technical Electives", rule: { type: "chooseUnits", units: 32 }, courses: ["CS005"], preferSubjects: ["CS"] },
];

export const offerings: Offering[] = [
  {
    course: "CS100",
    lectures: [
      {
        id: "35393",
        instructor: "Knight, Allan",
        meetings: [{ days: ["T", "R"], start: "14:00", end: "15:20", location: "SPR 1102" }],
        linked: [
          { type: "DIS", activities: [{ id: "35406", type: "DIS", meetings: [{ days: ["W"], start: "10:00", end: "10:50", location: "SOM2 205" }] }] },
          {
            type: "LAB",
            activities: [
              { id: "32722", type: "LAB", meetings: [{ days: ["F"], start: "12:00", end: "13:50", location: "UTLF 0204" }] },
              { id: "32724", type: "LAB", meetings: [{ days: ["F"], start: "16:00", end: "17:50", location: "UTLF 0204" }] },
            ],
          },
        ],
      },
    ],
  },
  {
    course: "CS005",
    lectures: [
      {
        id: "12992",
        instructor: "Rusich, Ryan",
        meetings: [{ days: ["M", "W", "F"], start: "10:00", end: "10:50", location: "CHUNG 138" }],
        // Both labs are async: no meeting time, so nothing to put on a calendar.
        linked: [{ type: "LAB", activities: [{ id: "33958", type: "LAB", meetings: [], online: true }, { id: "33960", type: "LAB", meetings: [], online: true }] }],
      },
    ],
  },
];

export const meta: TermMeta = {
  term: "202640",
  termLabel: "Fall 2026",
  termStart: "2026-09-24",
  termEnd: "2026-12-04",
  scrapedOn: "2026-10-20",
  holidays: [
    { date: "2026-11-11", name: "Veterans Day" },
    { date: "2026-11-26", name: "Thanksgiving" },
    { date: "2026-11-27", name: "Thanksgiving" },
  ],
};
