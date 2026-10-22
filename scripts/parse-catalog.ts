// Builds src/data/requirements.json from the UCR Computer Science B.S.
// major requirements, and reconciles any newly-referenced course codes
// into src/data/courses.json using the same metadata-subject lookup
// scrape-ucr.ts uses (cached — no extra network cost on a re-run).
//
// Usage: npm run parse-catalog -- <termCode>   (same term scrape-ucr.ts used)
//
// WHY THIS ISN'T A GENERIC PDF PARSER:
// The catalog's "Major Requirements" section is free-form prose with
// lettered sub-items, inline alternatives ("X or Y"), semicolon-separated
// compound items, and cross-references ("see 2.a)-f) above"). That
// structure is not safely machine-parseable without real risk of silently
// mis-grouping a degree requirement. Instead: the text was extracted once
// (see extractCatalogText below, cached to raw/catalog-text/), read in
// full, and the REQUIREMENTS array below is a hand-verified transcription
// of the "Computer Science Major" subsection (UCR 2026-27 General
// Catalog, Dept. of Computer Science and Engineering, Major Requirements
// > Computer Science Major; raw/catalog-text/full.txt around line 12530).
// Every simplification made to fit the RequirementGroup type is commented
// inline and also written to DATA_TODO.md.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readJson, writeJson } from "./lib/cache.ts";
import { upsertDataTodoSection } from "./lib/dataTodo.ts";
import { BannerClient } from "./lib/bannerClient.ts";
import { buildMetadataLookup } from "./lib/metadataLookup.ts";
import { loadSubjects, bySubjectDescription } from "./lib/subjects.ts";
import { fetchPrereqs } from "./lib/fetchPrereqs.ts";
import { buildCourse } from "./lib/courses.ts";
import { CATALOG_ONLY_COURSES, CHECKLIST_ONLY_CATALOG, CHECKLIST_ONLY_CODES } from "./lib/catalogOnlyCourses.ts";
import type { BannerSection } from "./lib/bannerTypes.ts";
import type { Course, RequirementGroup } from "../src/solver/types.ts";

const BASE_URL = "https://registrationssb.ucr.edu/StudentRegistrationSsb/ssb";
const CATALOG_PDF = "raw/catalog-cs.pdf";
const CATALOG_TEXT = "raw/catalog-text/full.txt";

function extractCatalogText(): void {
  if (existsSync(CATALOG_TEXT)) return;
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error(`pdftotext (poppler-utils) isn't on PATH. Install it, or extract ${CATALOG_PDF} to ${CATALOG_TEXT} yourself.`);
  }
  mkdirSync("raw/catalog-text", { recursive: true });
  execFileSync("pdftotext", [CATALOG_PDF, CATALOG_TEXT]);
}

// Depth electives only (catalog item 1.f) also allows "breadth" courses —
// CHEM/ECON/LING/PHIL/STAT — for up to 4 of the 8 units, but restricting the
// suggested list to depth-only guarantees the real "4 depth units minimum"
// sub-rule is always satisfied by any valid chooseUnits pick. See DATA_TODO.md.
const ENGINEERING_DEPTH_ELECTIVES = [
  "BIEN010", "EE020A", "EE030LA", "EE005", "EE016", "ENSC001", "ENSC002",
  "MATH010B", "ME002", "ME005", "ME018A", "ME018B", "ME009", "ME010",
  "MATH045", "MATH046",
];

// --- Computer Science Major (B.S.), Lower-division requirements (65 units min) ---
const LOWER_DIVISION: RequirementGroup[] = [
  { id: "cs-bs-ld-engr-intro", name: "Engineering Introduction Seminar", rule: { type: "all" }, courses: ["ENGR001I"] },
  { id: "cs-bs-ld-core", name: "Lower-Division CS Core", rule: { type: "all" }, courses: ["CS010A", "CS010B", "CS010C", "CS061"] },
  // "CS 011/MATH 011" is one cross-listed course, not a real choice between two different classes.
  { id: "cs-bs-ld-discrete-math", name: "Introduction to Discrete Structures", rule: { type: "chooseN", n: 1 }, courses: ["CS011", "MATH011"] },
  // Catalog: "MATH 005A, 005B, 005C; or MATH 009A, 009B, 009C" — two alternate 3-course
  // calculus tracks; a student must complete one whole track, not a mix of both.
  {
    id: "cs-bs-ld-calculus-sequence",
    name: "Calculus Sequence (choose one track)",
    rule: { type: "oneOfTracks", tracks: [["MATH005A", "MATH005B", "MATH005C"], ["MATH009A", "MATH009B", "MATH009C"]] },
    courses: ["MATH005A", "MATH005B", "MATH005C", "MATH009A", "MATH009B", "MATH009C"],
  },
  // Catalog 1.d continues "MATH 010A; and either MATH 031 or EE 020B" (no names given). Names follow
  // the course titles: MATH 010A "Calculus of Several Variables"; MATH 031 "Applied Linear Algebra" /
  // EE 020B "Linear Methods for Engineering Analysis and Design Using Matlab".
  { id: "cs-bs-ld-multivariable-calculus", name: "Multivariable Calculus", rule: { type: "all" }, courses: ["MATH010A"] },
  { id: "cs-bs-ld-linear-algebra", name: "Linear Algebra (MATH 031 or EE 020B)", rule: { type: "chooseN", n: 1 }, courses: ["MATH031", "EE020B"] },
  { id: "cs-bs-ld-physics", name: "Physics Sequence", rule: { type: "all" }, courses: ["PHYS040A", "PHYS040B", "PHYS040C"] },
  {
    id: "cs-bs-ld-engineering-elective",
    name: "Engineering Depth Elective",
    rule: { type: "chooseUnits", units: 8 },
    courses: ENGINEERING_DEPTH_ELECTIVES,
  },
];

// --- Computer Science Major (B.S.), Upper-division requirements (79 units min) ---
const UPPER_DIVISION: RequirementGroup[] = [
  { id: "cs-bs-ud-engr-intro", name: "Professional Development and Mentoring (ENGR 101-I)", rule: { type: "all" }, courses: ["ENGR101I"] },
  { id: "cs-bs-ud-core", name: "Upper-Division CS Core", rule: { type: "all" }, courses: ["CS100", "CS141", "CS150", "CS152", "CS153", "CS161"] },
  // Catalog: "CS 179 (E-Z) Project in Computer Science" — a lettered senior-project course; only variants actually
  // offered/known from scraped section data are listed. See DATA_TODO.md.
  { id: "cs-bs-ud-topics-seminar", name: "CS 179 Project in Computer Science", rule: { type: "chooseN", n: 1 }, courses: ["CS179G", "CS179M"] },
  { id: "cs-bs-ud-logic-design", name: "Logic Design", rule: { type: "chooseN", n: 1 }, courses: ["CS120A", "EE120A"] },
  { id: "cs-bs-ud-discrete-structures", name: "Discrete Structures", rule: { type: "all" }, courses: ["CS111"] },
  { id: "cs-bs-ud-writing", name: "Technical Writing", rule: { type: "all" }, courses: ["ENGR180W"] },
  { id: "cs-bs-ud-stats", name: "Probability and Statistics", rule: { type: "all" }, courses: ["STAT155"] },
  // Catalog item 2.g): "at least 32 units of technical electives ... with at least half of
  // the (16) units selected from Computer Science courses." The "(16)" doesn't square with
  // the stated 32-unit total — transcribed as written; see DATA_TODO.md. preferSubjects
  // steers the solver's picks toward CS courses first (it still can't hard-enforce the
  // "at least half" split — that's left for the solver to check).
  {
    id: "cs-bs-ud-tech-electives",
    name: "Technical Electives",
    rule: { type: "chooseUnits", units: 32 },
    preferSubjects: ["CS"],
    courses: [
      "CS105", "CS108", "CS110", "CS119L", "CS120B", "EE120B", "CS122A", "CS122B", "CS130",
      "CS131", "CS133", "CS135", "CS142", "CS144", "CS145", "CS147", "CS160", "CS162",
      "CS164", "CS165", "CS166", "CS167", "CS168", "EE168", "CS169", "CS170", "CS171",
      "CS172", "CS173", "CS175", "CS177", "CS178B", "CS179G", "CS179M", "CS180", "CS181",
      "CS182", "CS183", "CS193", "MATH120", "MATH126", "MATH135A", "MATH135B", "PHIL124",
    ],
  },
];

const REQUIREMENTS: RequirementGroup[] = [...LOWER_DIVISION, ...UPPER_DIVISION];

function allReferencedCourses(groups: RequirementGroup[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) for (const c of g.courses) out.add(c);
  return out;
}

async function main(): Promise<void> {
  const term = process.argv[2];
  if (!term) {
    console.error("Usage: npm run parse-catalog -- <termCode>   (same term scrape-ucr.ts used)");
    process.exit(1);
  }

  extractCatalogText();

  const courses = readJson<Course[]>("src/data/courses.json");
  const courseCodes = new Set(courses.map((c) => c.code));

  const client = new BannerClient(BASE_URL);
  await client.bootstrap();
  const lookup = await buildMetadataLookup(client, term, "raw");
  const subjects = await loadSubjects(client, term, "raw");
  const descToCode = bySubjectDescription(subjects);

  const catalogOnly = new Map(CATALOG_ONLY_COURSES.map((c) => [c.code, c]));

  const reconcileWarnings: string[] = [];
  const missing: string[] = [];
  const newCsRows = new Map<string, BannerSection>();
  for (const code of allReferencedCourses(REQUIREMENTS)) {
    if (courseCodes.has(code)) continue;
    const row = lookup.get(code);
    if (row) {
      if (row.subject === "CS") newCsRows.set(code, row);
      else courses.push(buildCourse(row, undefined, reconcileWarnings, row.term === term));
      courseCodes.add(code);
    } else if (catalogOnly.has(code)) {
      courses.push(catalogOnly.get(code)!);
      courseCodes.add(code);
    } else {
      missing.push(code);
    }
  }

  // Checklist-only prereq alternates (never scheduled, so always offered: false).
  const checklistCatalog = new Map(CHECKLIST_ONLY_CATALOG.map((c) => [c.code, c]));
  for (const code of CHECKLIST_ONLY_CODES) {
    if (courseCodes.has(code)) continue;
    const row = lookup.get(code);
    const course = row ? buildCourse(row, undefined, reconcileWarnings, false) : checklistCatalog.get(code);
    if (course) {
      courses.push(course);
      courseCodes.add(code);
    } else {
      missing.push(code);
    }
  }

  // Any newly-referenced CS course (e.g. tech electives not offered this
  // term) still has a real prerequisite rule — fetch and parse it too,
  // rather than leaving it blank just because it came in via requirements.json.
  const { trees: newCsTrees, warnings: newCsWarnings } = await fetchPrereqs(client, newCsRows, "raw", descToCode);
  reconcileWarnings.push(...newCsWarnings);
  for (const [code, row] of newCsRows) courses.push(buildCourse(row, newCsTrees.get(code), reconcileWarnings, row.term === term));

  courses.sort((a, b) => a.code.localeCompare(b.code));
  writeJson("src/data/courses.json", courses);
  writeJson(
    "src/data/requirements.json",
    [...REQUIREMENTS].sort((a, b) => a.id.localeCompare(b.id)),
  );

  upsertDataTodoSection("DATA_TODO.md", "parse-catalog.ts", [
    "`requirements.json` covers only the **Computer Science Major (B.S.)** — not the Computer Science Applications or Computer Science with Business Applications majors, which share the same catalog pages but are different degrees.",
    "",
    "Source: UCR 2026-27 General Catalog (`raw/catalog-cs.pdf`), Department of Computer Science and Engineering > Major Requirements > \"Computer Science Major\". Hand-transcribed after extracting the full catalog text to `raw/catalog-text/full.txt` (search for \"Computer Science Major\", around line 12530) — see the file header comment in `scripts/parse-catalog.ts` for why this wasn't auto-parsed from prose.",
    "",
    "**Simplifications made to fit the RequirementGroup type (all flagged where they occur above too):**",
    "- `cs-bs-ld-calculus-sequence`: now uses `oneOfTracks` — the catalog's two alternate 3-course calculus tracks (MATH 005A/B/C or MATH 009A/B/C) are modeled as exactly that, so a solver respecting this rule can't mix courses across tracks.",
    "- `cs-bs-ld-engineering-elective`: catalog requires the 8 units to split 4 depth + up to 4 breadth, from two different (overlapping) course lists. The suggested `courses` list is restricted to depth-only electives (dropping the breadth-only CHEM/ECON/LING/PHIL/STAT options) — any chooseUnits=8 pick from this list is guaranteed to satisfy the real \"4 depth units minimum\" sub-rule, at the cost of not offering the breadth-only alternative.",
    "- `cs-bs-ud-topics-seminar`: catalog says \"CS 179 (E-Z)\", any lettered topics variant from E through Z. Only CS179G and CS179M are listed, because those are the only variants confirmed offered in the scraped term — other letters may be real in other terms and aren't enumerable from catalog text alone.",
    "- `cs-bs-ud-tech-electives`: catalog text says \"at least half of the **(16)** units\" must be CS courses, but the stated total is 32 units (half would be 16 — the numbers are internally consistent, but double check this isn't a stale catalog edit from a smaller unit total). Added `preferSubjects: [\"CS\"]` so a solver can bias its picks toward CS courses, but the \"at least half\" split itself still isn't enforced by chooseUnits.",
    "- `ENGR001I`, `ENGR101I`, and `MATH046` (catalog: \"ENGR 001-I\", \"ENGR 101-I\", \"MATH 46\") were originally guessed code formats, not verified live. Now confirmed correct against live Banner data once ENGR/MATH were added to the metadata scrape: ENGR001I = \"Computer Science\" (there's also an ENGR001G for Computer Engineering and ENGR001M for CS+Business — 001I is the right one), ENGR101I likewise, and MATH046 = \"Introduction to Ordinary Differential Equations\" (distinct from MATH045, the physical-sciences/engineering variant).",
    "- The catalog's engineering-elective depth list has what reads like a literal duplicate: \"EE 020A & 30LA\" and, later in the same sentence, \"EE 20A\" — transcribed as EE020A + EE030LA (once) rather than twice.",
    "",
    "**Courses with no live Banner section in any scraped term** (`scripts/lib/catalogOnlyCourses.ts`): CS133, CS142, CS167, CS177, ENSC002, ME002, ME005, PHIL124, STAT155, and ENGR101I were all hand-transcribed from this catalog's own course-description text instead, each marked `offered: false` since there's no evidence any of them ran in Fall/Winter/Spring 2025-26. Dropped non-course restrictions that can't be a Prereq leaf: CS167's online-section enrollment restriction, CS177's \"C++ programming proficiency\", PHIL124's \"consent of instructor\", STAT155's university-GE-style \"or equivalent\" disclaimers, and ENGR101I's class-standing/major restriction (confirmed via \"ENGR 001 (E-Z)\"'s letter key that I = Computer Science, matching live ENGR001I data).",
    "",
    "**CS122B could not be resolved at all** — no live Banner section in term 202640 or its CS fallback terms (202620, 202610), AND no standalone course-description entry anywhere in the catalog text (only appears inside other courses' technical-elective lists, e.g. \"CS 110, CS 122A, CS 122B, CS 130...\"). It's likely only described under a cross-listed pair in a different catalog section (CS122A's own catalog entry couldn't be found either, for the same reason — see check-prereqs.ts's \"not found\" list). Left out of courses.json rather than guessed; still listed in `cs-bs-ud-tech-electives`'s `courses` array as a known elective option.",
    "",
    `**Course codes referenced by requirements.json with no courses.json entry** (subject never scraped, or not offered in any searched term, and no catalog description found): ${missing.length > 0 ? missing.sort().join(", ") : "(none)"}`,
  ]);

  console.log(`Wrote src/data/requirements.json (${REQUIREMENTS.length} groups) and updated src/data/courses.json (${courses.length} courses, ${missing.length} still missing metadata).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
