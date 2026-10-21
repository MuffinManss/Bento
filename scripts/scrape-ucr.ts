// Scrapes UCR's public Banner 9 class search into src/data/courses.json and
// src/data/sections.json.
//
// Usage: npm run scrape -- <termCode>     e.g. npm run scrape -- 202640
//
// Re-runs are cheap: every live request is cached under raw/, so only new
// or deleted cache files trigger network traffic. Delete the relevant
// raw/ file(s) to force a refetch.
//
// See the top of scripts/lib/bannerClient.ts and DATA_TODO.md for
// adaptations made against the live site's actual (vs. documented)
// behavior.

import { BannerClient } from "./lib/bannerClient.ts";
import { loadTerms } from "./lib/terms.ts";
import { loadSubjects, bySubjectDescription } from "./lib/subjects.ts";
import { searchSubject } from "./lib/searchSubject.ts";
import { buildOfferings } from "./lib/mapSections.ts";
import { fetchPrereqs } from "./lib/fetchPrereqs.ts";
import { buildCourse } from "./lib/courses.ts";
import { collectLeafCourses } from "./lib/prereqTree.ts";
import { writeJson } from "./lib/cache.ts";
import { upsertDataTodoSection } from "./lib/dataTodo.ts";
import { isInScopeCsCourse } from "./lib/scopeFilter.ts";
import { buildMetadataLookup, METADATA_SUBJECTS } from "./lib/metadataLookup.ts";
import type { BannerSection } from "./lib/bannerTypes.ts";
import type { Course, Offering } from "../src/solver/types.ts";

const BASE_URL = "https://registrationssb.ucr.edu/StudentRegistrationSsb/ssb";
const RAW_DIR = "raw";
const SCHEDULED_SUBJECT = "CS"; // the only subject we build Offering/section data for

async function main(): Promise<void> {
  const term = process.argv[2];
  if (!term) {
    console.error("Usage: npm run scrape -- <termCode>   e.g. npm run scrape -- 202640");
    process.exit(1);
  }

  const warnings: string[] = [];
  const client = new BannerClient(BASE_URL);

  console.log(`Bootstrapping session...`);
  await client.bootstrap();

  console.log(`Checking which terms Banner currently publishes...`);
  const terms = await loadTerms(client, RAW_DIR);
  const newest = terms[0];
  const requested = terms.find((t) => t.code === term);
  let termNote: string;
  if (!requested) {
    termNote = `Requested term ${term} was NOT in Banner's published term list (newest available: ${newest?.code} "${newest?.description}"). Double check the term code.`;
    console.warn(termNote);
  } else if (newest && newest.code !== term) {
    termNote = `Requested term ${term} ("${requested.description}") is not the newest Banner publishes — newest is ${newest.code} ("${newest.description}"). Confirm this is intentional (e.g. falling back because a newer term isn't published yet).`;
    console.warn(termNote);
  } else {
    termNote = `Requested term ${term} ("${requested.description}") is the newest term Banner currently publishes.`;
  }

  console.log(`Loading subject code <-> description table...`);
  const subjects = await loadSubjects(client, term, RAW_DIR);
  const descToCode = bySubjectDescription(subjects);

  console.log(`Searching ${SCHEDULED_SUBJECT} sections for term ${term}...`);
  const allCsRows = await searchSubject(client, term, RAW_DIR, SCHEDULED_SUBJECT);
  const csRows = allCsRows.filter((r) => isInScopeCsCourse(r.subjectCourse));
  const outOfScopeCount = allCsRows.length - csRows.length;
  console.log(`  -> ${allCsRows.length} ${SCHEDULED_SUBJECT} section rows (${outOfScopeCount} excluded: grad-level or research/individual-study/internship/colloquium — not schedulable undergrad courses).`);

  console.log(`Searching metadata-only subjects (${METADATA_SUBJECTS.join(", ")}) for term ${term}, plus CS/MATH fallback terms for courses not offered now...`);
  const metadataRows = await buildMetadataLookup(client, term, RAW_DIR);
  console.log(`  -> ${metadataRows.size} distinct courses resolved across all metadata subjects/terms.`);

  // courses.json: one entry per unique CS course, plus one entry per distinct
  // course referenced as a prereq leaf that we have metadata for (fetched
  // above). Leaves from a subject we never scraped, or placeholder
  // TEST:/UNRESOLVED: codes, are flagged in DATA_TODO.md instead of fabricated.
  const csFirstRow = new Map<string, BannerSection>();
  for (const row of csRows) {
    if (!csFirstRow.has(row.subjectCourse)) csFirstRow.set(row.subjectCourse, row);
  }
  // Prereqs get fetched for every in-scope current-term CS course AND every
  // CS course backfilled from an older term (it's still a real course with a
  // real prereq rule, just not offered this term) — using each row's own term.
  const csPrereqRows = new Map(csFirstRow);
  for (const [code, row] of metadataRows) {
    if (row.subject === SCHEDULED_SUBJECT && isInScopeCsCourse(code) && !csPrereqRows.has(code)) {
      csPrereqRows.set(code, row);
    }
  }

  console.log(`Fetching prerequisites for every ${SCHEDULED_SUBJECT} course (${csPrereqRows.size}, including ${csPrereqRows.size - csFirstRow.size} not offered this term)...`);
  const { trees, warnings: prereqWarnings } = await fetchPrereqs(client, csPrereqRows, RAW_DIR, descToCode);
  warnings.push(...prereqWarnings);

  console.log(`Fetching linked lecture/activity sections and building offerings...`);
  const { offerings, warnings: offeringWarnings } = await buildOfferings(client, term, RAW_DIR, csRows);
  warnings.push(...offeringWarnings);

  const courses: Course[] = [];
  for (const [code, row] of csFirstRow) {
    courses.push(buildCourse(row, trees.get(code), warnings));
  }

  const referencedLeaves = new Set<string>();
  for (const tree of trees.values()) collectLeafCourses(tree, referencedLeaves);

  const missingLeaves: string[] = [];
  for (const leaf of referencedLeaves) {
    if (csFirstRow.has(leaf)) continue; // already a CS course
    if (leaf.startsWith("TEST:") || leaf.startsWith("UNRESOLVED:")) continue; // already flagged by the parser
    const row = metadataRows.get(leaf);
    if (row) {
      courses.push(buildCourse(row, trees.get(leaf), warnings, row.term === term));
    } else {
      missingLeaves.push(leaf);
    }
  }
  if (missingLeaves.length > 0) {
    warnings.push(
      `Referenced in a CS prerequisite but no title/units available (not offered in any searched term, or its subject wasn't scraped — only CS/${METADATA_SUBJECTS.join("/")} were): ${[...new Set(missingLeaves)].sort().join(", ")}`,
    );
  }

  courses.sort((a, b) => a.code.localeCompare(b.code));
  offerings.sort((a, b) => a.course.localeCompare(b.course));

  writeJson("src/data/courses.json", courses);
  writeJson("src/data/sections.json", offerings satisfies Offering[]);

  const csCourseCount = csFirstRow.size;
  upsertDataTodoSection("DATA_TODO.md", "scrape-ucr.ts", [
    `Last run: term ${term}, ${csCourseCount} CS courses offered this term (${offerings.length} offerings), ${csPrereqRows.size} CS courses total had their prerequisites fetched (including ${csPrereqRows.size - csCourseCount} not offered this term but still real prereq leaves/electives), ${trees.size} of those had a parsed prerequisite tree, ${courses.length} total courses.json entries.`,
    "",
    `**Term used:** ${termNote}`,
    "",
    "**Banner session quirk (adaptation):** changing the search subject on a second `searchResults` call within the same session is silently ignored by the server — it returns the first search's cached results. Fixed by re-POSTing `term/search` + `classSearch/resetDataForm` before every subject's search (see `scripts/lib/bannerClient.ts`).",
    "",
    "**AND/OR grouping assumption:** prerequisite HTML wraps every single leaf term in its own parentheses, so parens carry no real nesting information. The tree is built by treating \"or\" as binding adjacent leaf terms (equivalent/alternate courses) and \"and\" as chaining those groups — this matched every multi-term example seen, but is an inference, not something the HTML states directly. Cross-checked against the catalog's own course-description text with `npm run check-prereqs` (see its DATA_TODO section below for results).",
    "",
    `**Scope:** ${outOfScopeCount} CS section rows were excluded before any processing — grad-level courses (200+) and research/individual-study/internship/colloquium types (190, 193, 197, 198I, 287, 290, 297, 298I, 299, 302). None of these can ever be a degree requirement for the B.S., so they're not in sections.json/courses.json and don't generate warnings (see \`scripts/lib/scopeFilter.ts\`).`,
    "",
    "**Variable-unit / grouping / leaf-resolution warnings from this run:**",
    ...(warnings.length > 0 ? warnings.map((w) => `- ${w}`) : ["- (none)"]),
  ]);

  console.log(`\nWrote src/data/courses.json (${courses.length} courses) and src/data/sections.json (${offerings.length} offerings).`);
  console.log(`${warnings.length} item(s) flagged in DATA_TODO.md.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
