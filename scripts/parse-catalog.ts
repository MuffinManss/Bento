// Builds src/data/requirements.json from the UCR Computer Science B.S.
// major requirements, and reconciles any newly-referenced course codes
// into src/data/courses.json using data already cached by scrape-ucr.ts.
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
import { decodeEntities } from "./lib/text.ts";
import type { BannerSection } from "./lib/bannerTypes.ts";
import type { Course, RequirementGroup } from "../src/solver/types.ts";

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

// --- Computer Science Major (B.S.), Lower-division requirements (65 units min) ---
const LOWER_DIVISION: RequirementGroup[] = [
  { id: "cs-bs-ld-engr-intro", name: "Engineering Introduction Seminar", rule: { type: "all" }, courses: ["ENGR001I"] },
  { id: "cs-bs-ld-core", name: "Lower-Division CS Core", rule: { type: "all" }, courses: ["CS010A", "CS010B", "CS010C", "CS061"] },
  // "CS 011/MATH 011" is one cross-listed course, not a real choice between two different classes.
  { id: "cs-bs-ld-discrete-math", name: "Introduction to Discrete Structures", rule: { type: "chooseN", n: 1 }, courses: ["CS011", "MATH011"] },
  // Catalog: "MATH 005A, 005B, 005C; or MATH 009A, 009B, 009C" — two alternate 3-course
  // calculus tracks. chooseN can't express "one whole track, not any 3 mixed credits from
  // the union" — modeled as chooseN n=3 over the union as a best-effort approximation.
  // See DATA_TODO.md.
  { id: "cs-bs-ld-calculus-sequence", name: "Calculus Sequence (choose one track)", rule: { type: "chooseN", n: 3 }, courses: ["MATH005A", "MATH005B", "MATH005C", "MATH009A", "MATH009B", "MATH009C"] },
  { id: "cs-bs-ld-linear-algebra", name: "Linear Algebra", rule: { type: "all" }, courses: ["MATH010A"] },
  { id: "cs-bs-ld-diffeq-or-circuits", name: "Differential Equations or Circuit Analysis", rule: { type: "chooseN", n: 1 }, courses: ["MATH031", "EE020B"] },
  { id: "cs-bs-ld-physics", name: "Physics Sequence", rule: { type: "all" }, courses: ["PHYS040A", "PHYS040B", "PHYS040C"] },
  // Catalog item 1.f): "at least 8 additional units ... 4 of which must be engineering depth
  // electives and the remaining may be engineering breadth electives." chooseUnits can't
  // express the 4-unit depth/4-unit breadth split, so this is simplified to "8 units from
  // the combined depth+breadth list" — see DATA_TODO.md.
  {
    id: "cs-bs-ld-engineering-elective",
    name: "Engineering Depth/Breadth Elective",
    rule: { type: "chooseUnits", units: 8 },
    courses: [
      "BIEN010", "EE020A", "EE030LA", "EE005", "EE016", "ENSC001", "ENSC002", "MATH010B",
      "ME002", "ME005", "ME018A", "ME018B", "ME009", "ME010", "MATH045", "MATH046",
      "CHEM001A", "CHEM01HA", "CHEM001B", "CHEM01HB", "CHEM001C", "CHEM01HC",
      "CHEM01LA", "CHEM1HLA", "CHEM01LB", "CHEM1HLB", "CHEM01LC", "CHEM1HLC",
      "CHEM008A", "CHEM008HA", "CHEM08LA", "CHEM08HLA",
      "ECON005", "ECON060", "LING020", "LING021", "PHIL125", "PHIL126", "PHIL127",
      "STAT004", "STAT008", "STAT010",
    ],
  },
];

// --- Computer Science Major (B.S.), Upper-division requirements (79 units min) ---
const UPPER_DIVISION: RequirementGroup[] = [
  { id: "cs-bs-ud-engr-intro", name: "Engineering Introduction Seminar II", rule: { type: "all" }, courses: ["ENGR101I"] },
  { id: "cs-bs-ud-core", name: "Upper-Division CS Core", rule: { type: "all" }, courses: ["CS100", "CS141", "CS150", "CS152", "CS153", "CS161"] },
  // Catalog: "CS 179 (E-Z)" — a lettered topics-seminar course; only variants actually
  // offered/known from scraped section data are listed. See DATA_TODO.md.
  { id: "cs-bs-ud-topics-seminar", name: "CS 179 Topics Seminar", rule: { type: "chooseN", n: 1 }, courses: ["CS179G", "CS179M"] },
  { id: "cs-bs-ud-logic-design", name: "Logic Design", rule: { type: "chooseN", n: 1 }, courses: ["CS120A", "EE120A"] },
  { id: "cs-bs-ud-discrete-structures", name: "Discrete Structures", rule: { type: "all" }, courses: ["CS111"] },
  { id: "cs-bs-ud-writing", name: "Technical Writing", rule: { type: "all" }, courses: ["ENGR180W"] },
  { id: "cs-bs-ud-stats", name: "Probability and Statistics", rule: { type: "all" }, courses: ["STAT155"] },
  // Catalog item 2.g): "at least 32 units of technical electives ... with at least half of
  // the (16) units selected from Computer Science courses." The "(16)" doesn't square with
  // the stated 32-unit total — transcribed as written; see DATA_TODO.md. The CS-vs-non-CS
  // split (half must be CS) also isn't expressible by chooseUnits and isn't enforced here.
  {
    id: "cs-bs-ud-tech-electives",
    name: "Technical Electives",
    rule: { type: "chooseUnits", units: 32 },
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

function loadCachedSubjectRows(term: string, subject: string): Map<string, BannerSection> {
  const byCourse = new Map<string, BannerSection>();
  for (let offset = 0; ; offset += 500) {
    const path = `raw/searchResults/${subject}_${term}_offset${offset}.json`;
    if (!existsSync(path)) break;
    const page = readJson<{ data: BannerSection[] | null }>(path);
    for (const row of page.data ?? []) {
      if (!byCourse.has(row.subjectCourse)) byCourse.set(row.subjectCourse, row);
    }
  }
  return byCourse;
}

function unitsFor(row: BannerSection): number {
  if (row.creditHours && row.creditHours > 0) return row.creditHours;
  return row.creditHourHigh ?? row.creditHourLow ?? 0;
}

function main(): void {
  const term = process.argv[2];
  if (!term) {
    console.error("Usage: npm run parse-catalog -- <termCode>   (same term scrape-ucr.ts used)");
    process.exit(1);
  }

  extractCatalogText();

  const courses = readJson<Course[]>("src/data/courses.json");
  const courseCodes = new Set(courses.map((c) => c.code));

  const mathRows = loadCachedSubjectRows(term, "MATH");
  const physRows = loadCachedSubjectRows(term, "PHYS");
  const lookup = new Map([...mathRows, ...physRows]);

  const missing: string[] = [];
  for (const code of allReferencedCourses(REQUIREMENTS)) {
    if (courseCodes.has(code)) continue;
    const row = lookup.get(code);
    if (row) {
      courses.push({ code: row.subjectCourse, title: decodeEntities(row.courseTitle), units: unitsFor(row) });
      courseCodes.add(code);
    } else {
      missing.push(code);
    }
  }

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
    "- `cs-bs-ld-calculus-sequence`: the catalog offers two alternate 3-course calculus tracks (MATH 005A/B/C or MATH 009A/B/C) — modeled as chooseN=3 over the union of both, which would incorrectly accept a mixed combo (e.g. one course from each track) as satisfying the requirement. There is no real UCR path where a student takes a mixed combo, but the type doesn't block it either. Flag if the solver needs to special-case this.",
    "- `cs-bs-ld-engineering-elective`: catalog requires the 8 units to split 4 depth + up to 4 breadth, from two different (overlapping) course lists. Modeled as a single chooseUnits=8 over the combined list — the depth/breadth split is NOT enforced.",
    "- `cs-bs-ud-topics-seminar`: catalog says \"CS 179 (E-Z)\", any lettered topics variant from E through Z. Only CS179G and CS179M are listed, because those are the only variants confirmed offered in the scraped term — other letters may be real in other terms and aren't enumerable from catalog text alone.",
    "- `cs-bs-ud-tech-electives`: catalog text says \"at least half of the **(16)** units\" must be CS courses, but the stated total is 32 units (half would be 16 — the numbers are internally consistent, but double check this isn't a stale catalog edit from a smaller unit total). The CS-vs-non-CS half-split is NOT enforced by chooseUnits either.",
    "- Course codes without a hyphen/space guess: `ENGR001I` (catalog: \"ENGR 001-I\") and `ENGR101I` (catalog: \"ENGR 101-I\") — format inferred from other hyphenated-suffix codes seen elsewhere, NOT verified live (ENGR subject was never scraped).",
    "- The catalog's engineering-elective depth list has what reads like a literal duplicate: \"EE 020A & 30LA\" and, later in the same sentence, \"EE 20A\" — transcribed as EE020A + EE030LA (once) rather than twice.",
    "- \"MATH 46\" in the catalog (no leading zero) was transcribed as `MATH046` to match this catalog's zero-padding elsewhere — not verified live.",
    "",
    `**Course codes referenced by requirements.json with no courses.json entry** (subject never scraped — ENGR, STAT, EE, PHIL, CHEM, ECON, LING, BIEN, ENSC, ME, MATH 100+ series — or not offered this term): ${missing.sort().join(", ")}`,
  ]);

  console.log(`Wrote src/data/requirements.json (${REQUIREMENTS.length} groups) and updated src/data/courses.json (${courses.length} courses, ${missing.length} still missing metadata).`);
}

main();
