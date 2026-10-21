// Courses referenced by requirements.json (or, transitively, by a CS
// prerequisite) that have NO live Banner section in term 202640 or its
// CS/MATH/PHYS fallback terms (202620, 202610) — so there's no
// BannerSection row to build a Course from. Hand-transcribed instead from
// this catalog's own course-description text (raw/catalog-text/full-raw.txt,
// extracted via `pdftotext -raw`; see scripts/check-prereqs.ts's header
// comment for why -raw specifically). All are marked `offered: false`:
// there is zero live evidence any of these ran in Fall/Winter/Spring
// 2025-26, so they should show up for a student to check off as completed,
// but the solver must never schedule them.
//
// AND/OR grouping follows the same "or binds adjacent leaves, and/semicolon
// chains groups" convention as scripts/lib/prereqParser.ts. Trailing
// disclaimers like "or equivalent(s)", "or consent of instructor", class-
// standing/major restrictions, and non-course skill requirements ("C++
// programming proficiency") aren't representable as Prereq courses and are
// dropped — each is called out in DATA_TODO.md instead of invented as a
// fake course code.

import type { Course } from "../../src/solver/types.ts";

export const CATALOG_ONLY_COURSES: Course[] = [
  // "CS 133Computational Geometry4Lecture, 3 hours; laboratory, 1 hour;
  //  individual study, 2 hours. Prerequisite(s): CS 100, CS 111, MATH 031;
  //  or equivalents."
  { code: "CS133", title: "COMPUTATIONAL GEOMETRY", units: 4, offered: false, prereq: { and: [{ course: "CS100" }, { course: "CS111" }, { course: "MATH031" }] } },

  // "CS 142Algorithm Engineering4Lecture, 3 hours; discussion, 1 hour.
  //  Prerequisite(s): CS 100, CS 141; or equivalent."
  { code: "CS142", title: "ALGORITHM ENGINEERING", units: 4, offered: false, prereq: { and: [{ course: "CS100" }, { course: "CS141" }] } },

  // "CS 167Introduction to Big-Data Management4Lecture, 3 hours;
  //  laboratory, 2 hours; individual study, 1 hour. Prerequisite(s): CS
  //  100, CS 111; CS 167 online section: enrollment in the online
  //  Master-of-Science in Engineering program." — the online-section
  //  enrollment restriction isn't a course prereq; dropped.
  { code: "CS167", title: "INTRODUCTION TO BIG-DATA MANAGEMENT", units: 4, offered: false, prereq: { and: [{ course: "CS100" }, { course: "CS111" }] } },

  // "CS 177Modeling and Simulation4Lecture, 3 hours; laboratory, 2 hours;
  //  individual study, 1 hour. Prerequisite(s): CS 100; CS 111; C++
  //  programming proficiency." — "C++ programming proficiency" isn't a
  //  nameable course; dropped.
  { code: "CS177", title: "MODELING AND SIMULATION", units: 4, offered: false, prereq: { and: [{ course: "CS100" }, { course: "CS111" }] } },

  // "ENSC 002Introduction to Environmental Science: Environmental
  //  Quality4Lecture, 3 hours; discussion, 1 hour. Prerequisite(s): none."
  { code: "ENSC002", title: "INTRODUCTION TO ENVIRONMENTAL SCIENCE: ENVIRONMENTAL QUALITY", units: 4, offered: false },

  // "ME 002Introduction to Mechanical Engineering4Lecture, 3 hours;
  //  discussion, 1 hour. Prerequisite(s): PHYS 040A or PHYS 002A or PHYS
  //  02HA or PHYS 040HA or PHYS 041A."
  {
    code: "ME002",
    title: "INTRODUCTION TO MECHANICAL ENGINEERING",
    units: 4,
    offered: false,
    prereq: { or: [{ course: "PHYS040A" }, { course: "PHYS002A" }, { course: "PHYS02HA" }, { course: "PHYS040HA" }, { course: "PHYS041A" }] },
  },

  // "ME 005The Science of Mythbusting4Lecture, 3 hours, discussion, 1
  //  hour. Prerequisite(s): none."
  { code: "ME005", title: "THE SCIENCE OF MYTHBUSTING", units: 4, offered: false },

  // "PHIL 124Formal Logic4Lecture, 3 hours; discussion, 1 hour.
  //  Prerequisite(s): CS 011/MATH 011 or CS 120A/EE 120A or CS 150 or PHIL
  //  008 or PHIL 008H or consent of instructor." — the cross-listed pairs
  //  (CS 011/MATH 011, CS 120A/EE 120A) are each the same course under two
  //  codes, represented as OR alternatives like elsewhere in this data set.
  {
    code: "PHIL124",
    title: "FORMAL LOGIC",
    units: 4,
    offered: false,
    prereq: { or: [{ course: "CS011" }, { course: "MATH011" }, { course: "CS120A" }, { course: "EE120A" }, { course: "CS150" }, { course: "PHIL008" }, { course: "PHIL008H" }] },
  },

  // "STAT 155Probability and Statistics For Science and Engineering4Lecture,
  //  3 hours; discussion, 1 hour. Prerequisite(s): MATH 009C, may be taken
  //  concurrently or MATH 09HC, may be taken concurrently or MATH 005C,
  //  may be taken concurrently."
  {
    code: "STAT155",
    title: "PROBABILITY AND STATISTICS FOR SCIENCE AND ENGINEERING",
    units: 4,
    offered: false,
    prereq: { or: [{ course: "MATH009C", concurrentOk: true }, { course: "MATH09HC", concurrentOk: true }, { course: "MATH005C", concurrentOk: true }] },
  },

  // "ENGR 101 (E-Z)Professional Development and Mentoring1Activity, 30
  //  hours per quarter. Prerequisite(s): restricted to class level
  //  standing of junior; restricted to major(s) ... Computer Science ..."
  // — a lettered topics-activity shared by every BCOE major; letter "I" is
  // confirmed Computer Science from "ENGR 001 (E-Z)"'s letter key ("I.
  // Computer Science"), matching live Banner data for ENGR001I. The class-
  // standing/major restriction isn't a course prereq; dropped.
  { code: "ENGR101I", title: "PROFESSIONAL DEVELOPMENT AND MENTORING", units: 1, offered: false },
];
