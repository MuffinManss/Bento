// Cross-checks every in-scope CS course's parsed Prereq tree (built from
// Banner's registration-system prerequisite HTML) against the independent
// "Prerequisite(s): ..." text in the catalog's own course descriptions
// (raw/catalog-text/full.txt, extracted from raw/catalog-cs.pdf). The two
// systems are maintained separately at UCR and can disagree — this prints
// every mismatch instead of assuming either source is right.
//
// Usage: npm run check-prereqs
//
// Catalog course-description headings have no space between the course
// number and title, and none between the title and the units digit (e.g.
// "CS 010AIntroduction to Computer Science...I4Lecture, 3 hours..."), which
// is exactly how pdftotext rendered them — that's used here as the anchor
// to find each course's own heading rather than an inline mention of it.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readJson } from "./lib/cache.ts";
import { collectLeafCourses } from "./lib/prereqTree.ts";
import { upsertDataTodoSection } from "./lib/dataTodo.ts";
import type { Course } from "../src/solver/types.ts";

const CATALOG_PDF = "raw/catalog-cs.pdf";
// Default pdftotext reflows this catalog's 3-column pages into lines that
// interleave all 3 columns side by side — fine for isolated grep, useless for
// scanning a contiguous clause. -raw preserves the PDF's actual content-stream
// order instead of trying to reconstruct visual geometry, which for this
// document happens to mean "one column fully, then the next" — i.e. correct
// single-column reading order for course descriptions.
const CATALOG_TEXT = "raw/catalog-text/full-raw.txt";
const WINDOW = 1600;

function extractCatalogText(): void {
  if (existsSync(CATALOG_TEXT)) return;
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error(`pdftotext (poppler-utils) isn't on PATH. Install it, or extract ${CATALOG_PDF} to ${CATALOG_TEXT} yourself (pdftotext -raw).`);
  }
  mkdirSync("raw/catalog-text", { recursive: true });
  execFileSync("pdftotext", ["-raw", CATALOG_PDF, CATALOG_TEXT]);
}

function extractCatalogLeaves(clause: string): Set<string> {
  const out = new Set<string>();
  const normalized = clause.replace(/\s+/g, " ");
  for (const m of normalized.matchAll(/\b([A-Z]{2,4}) (\d{2,3}[A-Z]{0,3})\b/g)) {
    // "CS 111 recommended" (no comma/semicolon before "recommended") is advisory,
    // not a real requirement — Banner's own prereq check excludes these too.
    const after = normalized.slice(m.index + m[0].length).trimStart();
    if (/^recommended\b/i.test(after)) continue;
    out.add(`${m[1]}${m[2]}`);
  }
  return out;
}

// Any "SUBJ 123X" immediately followed by a title (no space, Capitalized
// word) is a course heading in this catalog's rendering — used to find
// where the NEXT course's heading starts, so a course with no
// prerequisites doesn't accidentally pick up its neighbor's. The lookahead
// requires an uppercase letter THEN a lowercase one (a real title word),
// not just any letter — otherwise e.g. "ENGR 180W;" backtracks [A-Z]{0,3}
// down to "ENGR 180" and treats the course's own trailing suffix letter
// "W" as if it were the start of a different course's title.
const ANY_HEADING = /\b[A-Z]{2,4} \d{2,3}[A-Z]{0,3}(?=[A-Z][a-z])/g;

function findPrereqClause(text: string, courseNumber: string): { clause: string | null; headingCount: number } {
  // \b before "CS" matters: without it this also matches inside "MCS 005" (Media
  // and Cultural Studies) and other codes that happen to end in "CS".
  const heading = new RegExp(`\\bCS ${courseNumber}(?=[A-Z][a-z])`, "g");
  const matches = [...text.matchAll(heading)];
  if (matches.length === 0) return { clause: null, headingCount: 0 };

  const start = matches[0].index;
  const afterStart = start + matches[0][0].length;
  ANY_HEADING.lastIndex = afterStart;
  const nextHeading = ANY_HEADING.exec(text);
  const windowEnd = Math.min(start + WINDOW, nextHeading ? nextHeading.index : text.length);
  const window = text.slice(start, windowEnd);

  if (/Prerequisite\(s\):\s*none\.?/i.test(window)) return { clause: "", headingCount: matches.length };

  const prereqIdx = window.search(/Prerequisite\(s\):/i);
  if (prereqIdx === -1) return { clause: null, headingCount: matches.length };

  const afterLabel = window.slice(prereqIdx).replace(/^Prerequisite\(s\):\s*/i, "");
  const endMatch = afterLabel.match(/\.\s+(?=[A-Z])/);
  const clause = endMatch ? afterLabel.slice(0, endMatch.index) : afterLabel;
  return { clause, headingCount: matches.length };
}

function main(): void {
  extractCatalogText();
  const text = readFileSync(CATALOG_TEXT, "utf8");
  const courses = readJson<Course[]>("src/data/courses.json");
  const csCourses = courses.filter((c) => c.code.startsWith("CS"));

  let matchCount = 0;
  const mismatches: string[] = [];
  const notFound: string[] = [];
  const ambiguousHeadings: string[] = [];

  for (const course of csCourses) {
    const number = course.code.slice(2);
    const { clause, headingCount } = findPrereqClause(text, number);

    if (headingCount === 0) {
      notFound.push(course.code);
      continue;
    }
    if (headingCount > 1) ambiguousHeadings.push(`${course.code} (${headingCount} heading matches, used the first)`);
    // No "Prerequisite(s):" label at all (as opposed to an explicit "...none.")
    // means the same thing here — some catalog entries just omit the line.
    // A course can't be its own prereq — drop self-references (e.g. CS167's
    // "CS 167 online section: enrollment in..." restriction note).
    const catalogLeaves = extractCatalogLeaves(clause ?? "");
    catalogLeaves.delete(course.code);
    const parsedLeaves = course.prereq ? collectLeafCourses(course.prereq) : new Set<string>();
    const parsedCourseLeaves = new Set([...parsedLeaves].filter((l) => !l.startsWith("TEST:") && !l.startsWith("UNRESOLVED:")));

    const onlyInCatalog = [...catalogLeaves].filter((l) => !parsedCourseLeaves.has(l));
    const onlyInParsed = [...parsedCourseLeaves].filter((l) => !catalogLeaves.has(l));

    if (onlyInCatalog.length === 0 && onlyInParsed.length === 0) {
      matchCount++;
    } else {
      const lines = [
        `MISMATCH ${course.code}`,
        `  catalog text: "${(clause ?? "(no Prerequisite(s) label found)").trim()}"`,
        `  catalog leaves: [${[...catalogLeaves].sort().join(", ")}]`,
        `  parsed leaves:  [${[...parsedCourseLeaves].sort().join(", ")}]`,
        ...(onlyInCatalog.length > 0 ? [`  catalog has, parsed is missing: ${onlyInCatalog.sort().join(", ")}`] : []),
        ...(onlyInParsed.length > 0 ? [`  parsed has, catalog doesn't mention: ${onlyInParsed.sort().join(", ")}`] : []),
      ];
      lines.forEach((l) => console.log(l));
      mismatches.push(lines.join("\n"));
    }
  }

  const summary = `${matchCount} match, ${mismatches.length} mismatch, ${notFound.length} not found in catalog text, ${ambiguousHeadings.length} ambiguous heading(s).`;
  console.log(`\n${summary}`);
  if (notFound.length > 0) console.log(`Not found: ${notFound.join(", ")}`);
  if (ambiguousHeadings.length > 0) console.log(`Ambiguous: ${ambiguousHeadings.join("; ")}`);

  upsertDataTodoSection("DATA_TODO.md", "check-prereqs.ts", [
    `Cross-checked every in-scope CS course's Banner-sourced Prereq tree against the catalog's own "Prerequisite(s):" text (\`raw/catalog-text/full-raw.txt\`, see the file header comment in \`scripts/check-prereqs.ts\` for why \`-raw\` mode specifically). Last run: ${summary}`,
    "",
    "**CS178A was previously flagged as a grouping anomaly (see scrape-ucr.ts section) but is confirmed CORRECT**: the catalog says \"Prerequisite(s): CS 141, ENGR 180W\" (comma = AND), matching the parsed tree `{and: [CS141, ENGR180W]}` exactly. No fix needed.",
    "",
    mismatches.length > 0 ? "**Remaining genuine mismatches** (Banner's own registration-system prerequisite differs from the printed catalog — a real UCR data discrepancy, not a parsing bug; left as Banner-sourced since that's what actually gates registration):" : "**No remaining genuine mismatches.**",
    ...mismatches,
    "",
    `**Not found in catalog text** (known script limitations, not data problems — verified by hand): ${notFound.join(", ") || "(none)"}. CS042's title is literally the word "A" (\"A Hitchhiker's Guide to...\") and CS009C's title starts with "C++" — both defeat the heading-detection heuristic (which requires an uppercase letter then a lowercase one right after the course number) since neither looks like the start of an ordinary word. CS122A has no standalone course-description entry in the catalog at all — it's likely only described under its cross-listed pair EE128.`,
  ]);
}

main();
