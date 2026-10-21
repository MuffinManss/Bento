# Bento — UCR Course Schedule Generator (MVP)

## What this is
A web app that generates up to 4 valid, conflict-free quarter schedules for a UCR Computer Science B.S. student.
Every schedule must: (1) only include courses whose prerequisites the student has met, (2) only include courses that
fill an unmet degree requirement, (3) have no time conflicts, (4) respect the student's filters.
Class project for an entrepreneurship course — demo at end of quarter (~Dec 1, 2026). Scope is deliberately small.

## Core principle: deterministic, NOT AI
The scheduler is a rule-based constraint solver (backtracking search). No LLM calls anywhere in the app.
Same input → same output. Every course shown must be traceable to (a) a degree requirement and (b) satisfied prereqs.
If no schedule satisfies the filters, say so and name the constraint(s) responsible.

## MVP scope
IN:
- One major: UCR Computer Science B.S. (lower-div + upper-div core + a handful of tech electives)
- One term of section data (Winter 2027; fall back to Fall 2026 data if Winter isn't published)
- Input: checklist of completed courses (optionally paste degree-audit text → parse course codes)
- Filters: target units (min/max), earliest start time, latest end time, days off, must-include courses, exclude courses
- Output: up to 4 ranked schedules, weekly calendar view, requirement tag per course, "Regenerate" (next 4)
- Infeasible case: empty state that explains which filter blocks it (relax-one-constraint check)
- Export: .ics download for Google Calendar
OUT (do not build): auth/accounts, backend server, database, auto-registration, other majors, scraping R'Web, LLMs.

## Tech stack
- Vite + React + TypeScript (strict) + Tailwind CSS
- Solver is a pure TypeScript module in `src/solver/` with no React imports
- Tests: Vitest (solver must have unit tests)
- Data: static JSON in `src/data/`
- Everything runs client-side (privacy: student data never leaves the browser). Deploy to Vercel.
- Must be usable on a phone (mobile-first layout).

## Folder layout
```
src/
  data/
    courses.json        # catalog: code, title, units, prereqs
    requirements.json   # CS B.S. degree requirement groups
    sections.json       # term section data (lectures + linked activities)
  solver/
    types.ts
    prereqs.ts          # evaluate prereq expression trees
    eligibility.ts      # which courses can/should be taken
    conflicts.ts        # time overlap checks
    generate.ts         # backtracking search + ranking
    explain.ts          # infeasibility explanation
    *.test.ts
  components/           # UI
  lib/ics.ts            # .ics export
```

## Data model (TypeScript)
```ts
type Day = "M" | "T" | "W" | "R" | "F";
type Meeting = { days: Day[]; start: string; end: string; location?: string }; // "09:30", 24h

type Prereq =
  | { course: string; concurrentOk?: boolean }
  | { and: Prereq[] }
  | { or: Prereq[] };

type Course = { code: string; title: string; units: number; prereq?: Prereq };

type Activity = { id: string; type: "LAB" | "DIS"; meetings: Meeting[] };
type Lecture = { id: string; instructor?: string; meetings: Meeting[]; linked: Activity[] };
// UCR rule: a lecture and ONE of its linked activities must be taken together.
type Offering = { course: string; lectures: Lecture[] };

type RequirementGroup = {
  id: string; name: string;
  rule: { type: "all" } | { type: "chooseN"; n: number } | { type: "chooseUnits"; units: number };
  courses: string[];
};

type Filters = {
  minUnits: number; maxUnits: number;
  earliestStart?: string; latestEnd?: string;
  daysOff: Day[]; mustInclude: string[]; exclude: string[];
};

type ScheduledCourse = { course: string; lectureId: string; activityId?: string; requirementId: string };
type Schedule = { courses: ScheduledCourse[]; units: number; score: number };
```

## Solver algorithm
1. Eligible courses = not completed AND prereqs satisfied by completed (or concurrent-ok) AND fills an unmet
   requirement group AND offered this term AND not excluded.
2. Priority per course: lower-division/core first, then courses that unlock the most downstream courses.
3. Enumerate course sets whose units are within [minUnits, maxUnits]; mustInclude courses are forced in.
4. For each course set, backtrack over (lecture, linked activity) choices; prune on any time overlap or filter
   violation (days off, earliest/latest).
5. Score valid schedules (higher = better): requirement priority, fewer campus days, fewer gaps > 2h, fewer
   early classes. Deduplicate (two schedules that differ only by section count as distinct, but prefer variety
   in course sets for the top 4).
6. Return top 4; "Regenerate" returns the next 4 from the ranked list.
7. If 0 results: re-run with each filter relaxed one at a time and report which one(s) would make it feasible,
   e.g. "No schedule fits with Mon AND Fri off — removing 'Mon off' gives 6 options."

Cap search work (e.g. max ~50k nodes) so the UI never hangs.

## Conventions
- Small, pure functions; no `any`.
- Write/extend Vitest tests for every solver change and run `npm test` before saying a task is done.
- Don't invent course data. If data is missing, leave a TODO and tell me.
- Commit after each working phase with a clear message.
