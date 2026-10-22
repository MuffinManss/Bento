# Bento — Schedules that just fit.

Bento generates up to four conflict-free quarter schedules for UCR Computer Science B.S. students. You tick the courses you've completed (or paste your degree audit), set preferences like days off and earliest start, and Bento suggests only courses whose prerequisites you've met and that fill a degree requirement you still need. It's a deterministic, rule-based constraint solver, not AI: the same input always gives the same schedules, every course is traceable to a requirement and satisfied prerequisites, and when nothing fits it tells you which filter to relax. Everything runs in the browser; student data never leaves the device.

> Class project for an entrepreneurship course. Always confirm in R'Web before registering.

## Screenshots

<!-- TODO: add screenshots, e.g. docs/screenshots/desktop.png and docs/screenshots/mobile.png -->

_Screenshots coming soon._

## Setup

Requires **Node.js 20.19+ or 22.12+** (Vite 8's requirement; also set in `package.json` `engines`).

```bash
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload. |
| `npm test` | Vitest — solver, parser, `.ics`, and formatter unit tests. |
| `npm run build` | Type-checks (`tsc -b`) and builds to `dist/`. |
| `npm run preview` | Serves the production build locally (check this before deploying). |
| `npm run scrape -- <term>` | Scrapes UCR's public Banner class search into `src/data/courses.json`, `sections.json`, and `meta.json`. Responses are cached under `raw/`. |
| `npm run parse-catalog -- <term>` | Writes `requirements.json` (hand-transcribed CS B.S. requirements) and adds catalog-only / checklist-only courses to `courses.json`. |
| `npm run check-prereqs` | Cross-checks Banner prerequisite trees against the catalog's printed text. |
| `npm run validate-data` | Validates all data files against the data model and each other. |
| `npm run samples` | Runs the solver for the sample students and prints readable weekly tables (saved copy: `docs/samples.txt`). |

## Refreshing data for a new term

Term codes are `YYYY` + `10` (Winter), `20` (Spring), `30` (Summer), `40` (Fall), e.g. `202710` = Winter 2027.

```bash
npm run scrape -- 202710          # sections, prereqs, term dates -> src/data/
npm run parse-catalog -- 202710   # requirements + catalog-only courses (run after scrape: scrape rewrites courses.json)
npm run check-prereqs
npm run validate-data             # must report 0 errors
npm test
npm run samples > docs/samples.txt
```

Then review `DATA_TODO.md` — every ambiguity, gap, and assumption the scripts hit is written there rather than guessed. The term label, first/last day of classes (used by the `.ics` export), and scrape date all come from `src/data/meta.json`, which `scrape` regenerates from Banner's meeting dates. Delete files under `raw/` to force a fresh download.

## How the solver works

1. **Eligibility** — a course is a candidate if it isn't completed, is offered this term, fills an unmet requirement group (respecting "choose N", unit totals, and one-calculus-track rules), and its prerequisite tree is satisfied (`and` / `or` / `pick N of`, concurrent-enrollment and placement-exam alternatives included).
2. **Course sets** — candidates are ranked (lower-division and core first, then courses that unlock the most later courses; CS tech electives before non-CS) and combined into sets within your unit range, with must-include courses forced in.
3. **Sections** — for each set, backtracking picks one lecture plus one linked activity from each group (e.g. CS 100 = lecture + one DIS + one LAB), pruning any time conflict, day off, or time-window violation. Online/async sections never conflict.
4. **Ranking** — schedules score higher for requirement priority and lower for campus days, gaps over 2 hours, and early classes. The top 4 show different course sets first; **Regenerate** pages through the rest.
5. **Infeasible** — if nothing fits, the solver re-runs with each filter relaxed one at a time and offers the ones that work as one-click fixes.

Search work is capped (50k nodes) and runs in a Web Worker, so the UI never freezes.

## Project structure

```
src/
  App.tsx                 # page layout and all app state (React only, no storage)
  components/             # CoursesStep, PreferencesStep, ResultsStep, WeekCalendar, ui
  data/
    courses.json          # catalog: code, title, units, prereq tree (+ placement / checklist-only items)
    requirements.json     # CS B.S. requirement groups
    sections.json         # term section data: lectures + linked activity groups
    meta.json             # term label, class start/end dates, scrape date
    index.ts              # typed loader
    sampleStudents.ts     # demo students
  lib/
    solver.worker.ts      # runs the solver off the main thread (useSolver.ts is the React hook)
    ics.ts                # .ics calendar export
    advisorText.ts        # "Copy for advisor" plain-text summary
    auditParser.ts        # degree-audit paste -> course codes
    catalog.ts, scheduleView.ts
  solver/                 # pure TypeScript, no React: prereqs, eligibility, conflicts, generate, explain
scripts/                  # Banner scraper, catalog transcription, data validation, sample runner
docs/samples.txt          # sample-student output for review
DATA_TODO.md              # data gaps and assumptions, regenerated by the scripts
```

## Deploying to Vercel

No server, database, or environment variables — it's a static site.

1. Push the repo to GitHub and **Import Project** in Vercel.
2. Vercel detects Vite: build command `npm run build`, output directory `dist`. Node version comes from `package.json` `engines`.
3. Deploy. No `vercel.json` is needed: Bento is a single page with no client-side routes, and the solver worker and data are bundled as static assets.

Before deploying a data refresh, run `npm run build && npm run preview` and load a sample student to confirm the worker and data load from the production build.
