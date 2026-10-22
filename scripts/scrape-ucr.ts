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
import { readJson, writeJson } from "./lib/cache.ts";
import { upsertDataTodoSection } from "./lib/dataTodo.ts";
import { isInScopeCourse, isInScopeCsCourse, isInScopeSection } from "./lib/scopeFilter.ts";
import { buildMetadataLookup, METADATA_SUBJECTS } from "./lib/metadataLookup.ts";
import { buildTermMeta } from "./lib/termMeta.ts";
import type { BannerSection } from "./lib/bannerTypes.ts";
import type { Course, Offering, RequirementGroup } from "../src/solver/types.ts";

const BASE_URL = "https://registrationssb.ucr.edu/StudentRegistrationSsb/ssb";
const RAW_DIR = "raw";
const SCHEDULED_SUBJECT = "CS"; // scraped in full (every in-scope course)
// Also get section + prereq data, but only for courses in requirements.json or referenced by a CS prereq.
const SECTION_SUBJECTS = ["MATH", "PHYS", "ENGR", "EE", "STAT"];
const REQUIREMENTS_PATH = "src/data/requirements.json";

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
  const csRows = allCsRows.filter(isInScopeSection);
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
  const { trees, warnings: prereqWarnings, placements: csPlacements } = await fetchPrereqs(client, csPrereqRows, RAW_DIR, descToCode);
  warnings.push(...prereqWarnings);

  // CS prereq leaves are computed from CS trees only — non-CS prereq trees
  // fetched below don't widen the scope any further.
  const referencedLeaves = new Set<string>();
  for (const tree of trees.values()) collectLeafCourses(tree, referencedLeaves);

  // Non-CS section subjects: only courses a CS B.S. student could need —
  // listed in requirements.json, or a leaf of some CS prerequisite.
  const requirementCodes = new Set(readJson<RequirementGroup[]>(REQUIREMENTS_PATH).flatMap((group) => group.courses));
  const wanted = (code: string) => requirementCodes.has(code) || referencedLeaves.has(code);
  const sectionRows: BannerSection[] = [];
  for (const subject of SECTION_SUBJECTS) {
    const rows = (await searchSubject(client, term, RAW_DIR, subject)).filter((r) => isInScopeSection(r) && wanted(r.subjectCourse));
    console.log(`  -> ${subject}: ${rows.length} in-scope section rows for ${new Set(rows.map((r) => r.subjectCourse)).size} wanted courses.`);
    sectionRows.push(...rows);
  }

  // Prereq trees for every wanted non-CS course we have any row for — this
  // term's, or an older term's (via metadataRows) if it isn't offered now.
  const sectionPrereqRows = new Map<string, BannerSection>();
  for (const row of sectionRows) if (!sectionPrereqRows.has(row.subjectCourse)) sectionPrereqRows.set(row.subjectCourse, row);
  for (const [code, row] of metadataRows) {
    if (SECTION_SUBJECTS.includes(row.subject) && wanted(code) && isInScopeCourse(row.subject, code) && !sectionPrereqRows.has(code)) sectionPrereqRows.set(code, row);
  }
  console.log(`Fetching prerequisites for ${sectionPrereqRows.size} wanted ${SECTION_SUBJECTS.join("/")} courses...`);
  const { trees: sectionTrees, warnings: sectionPrereqWarnings, placements: sectionPlacements } = await fetchPrereqs(client, sectionPrereqRows, RAW_DIR, descToCode);
  warnings.push(...sectionPrereqWarnings);

  console.log(`Fetching linked lecture/activity sections and building offerings...`);
  const { offerings, warnings: offeringWarnings } = await buildOfferings(client, term, RAW_DIR, [...csRows, ...sectionRows]);
  warnings.push(...offeringWarnings);

  const courses: Course[] = [];
  for (const [code, row] of csFirstRow) {
    courses.push(buildCourse(row, trees.get(code), warnings));
  }
  for (const [code, row] of sectionPrereqRows) {
    courses.push(buildCourse(row, sectionTrees.get(code), warnings, row.term === term));
  }
  // Placement-exam results ("PLACE:MATH009A") are checklist-only items a student
  // can tick, so a freshman who placed in can be offered the course.
  const placements = [...csPlacements.values(), ...sectionPlacements.values()];
  for (const placement of placements) courses.push({ code: placement.code, title: placement.title, units: 0, offered: false, placement: true });

  const missingLeaves: string[] = [];
  for (const leaf of referencedLeaves) {
    if (csFirstRow.has(leaf) || sectionPrereqRows.has(leaf)) continue; // already added above
    if (leaf.startsWith("TEST:") || leaf.startsWith("UNRESOLVED:") || leaf.startsWith("PLACE:")) continue; // flagged by the parser / added above
    const row = metadataRows.get(leaf);
    if (row) {
      courses.push(buildCourse(row, trees.get(leaf), warnings, row.term === term));
    } else {
      missingLeaves.push(leaf);
    }
  }
  if (missingLeaves.length > 0) {
    warnings.push(
      `Referenced in a CS prerequisite but no Banner title/units (not offered in any searched term, or its subject wasn't scraped — only CS/${METADATA_SUBJECTS.join("/")} were); parse-catalog.ts fills these from the catalog text where it can — see its section: ${[...new Set(missingLeaves)].sort().join(", ")}`,
    );
  }

  courses.sort((a, b) => a.code.localeCompare(b.code));
  offerings.sort((a, b) => a.course.localeCompare(b.course));

  writeJson("src/data/courses.json", courses);
  writeJson("src/data/sections.json", offerings satisfies Offering[]);

  const { meta, warnings: termWarnings } = buildTermMeta(term, requested?.description ?? term, [...csRows, ...sectionRows], `${RAW_DIR}/searchResults/${SCHEDULED_SUBJECT}_${term}_offset0.json`);
  warnings.push(...termWarnings);
  writeJson("src/data/meta.json", meta);

  const csCourseCount = csFirstRow.size;
  upsertDataTodoSection("DATA_TODO.md", "scrape-ucr.ts", [
    `Last run: term ${term}, ${csCourseCount} CS courses offered this term, ${csPrereqRows.size} CS courses total had their prerequisites fetched (including ${csPrereqRows.size - csCourseCount} not offered this term but still real prereq leaves/electives), ${trees.size} of those had a parsed prerequisite tree. Plus ${sectionPrereqRows.size} ${SECTION_SUBJECTS.join("/")} courses that appear in requirements.json or a CS prereq (${new Set(sectionRows.map((r) => r.subjectCourse)).size} with sections this term), ${sectionTrees.size} with a parsed prerequisite tree. ${offerings.length} offerings, ${courses.length} total courses.json entries.`,
    "",
    `**Term used:** ${termNote}`,
    "",
    "**Banner session quirk (adaptation):** changing the search subject on a second `searchResults` call within the same session is silently ignored by the server — it returns the first search's cached results. Fixed by re-POSTing `term/search` + `classSearch/resetDataForm` before every subject's search (see `scripts/lib/bannerClient.ts`).",
    "",
    "**AND/OR grouping assumption:** prerequisite HTML wraps every single leaf term in its own parentheses, so parens carry no real nesting information. The tree is built by treating \"or\" as binding adjacent leaf terms (equivalent/alternate courses) and \"and\" as chaining those groups — this matched every multi-term example seen, but is an inference, not something the HTML states directly. Cross-checked against the catalog's own course-description text with `npm run check-prereqs` (see its DATA_TODO section below for results).",
    "",
    `**Scope:** ${outOfScopeCount} CS section rows were excluded before any processing — grad-level courses (200+), research/individual-study/internship/colloquium numbers (190, 193, 197, 198I, 287, 290, 297, 298I, 299, 302), and research/thesis/internship/individual-study schedule types. ${SECTION_SUBJECTS.join("/")} use the same rule (200+ and 190-199 excluded) and are further limited to courses in requirements.json or a CS prereq. None of the excluded rows can ever be a degree requirement for the B.S., so they're not in sections.json/courses.json and don't generate warnings (see \`scripts/lib/scopeFilter.ts\`).`,
    "",
    "**Linked sections:** Banner's `fetchLinkedSections` returns every valid lecture+activities combination. These are grouped by activity type into `Lecture.linked` (one `ActivityGroup` per type); the solver takes one activity from EACH group. Every lecture's combinations are checked to be the exact cross product of its groups — any that aren't are listed in the warnings below.",
    "",
    `**Placement exams:** prereq lines like "Math: Score for Prereq 612 to 613" are OR-alternatives to a course (Banner's "Course or Test:"). Each course that accepts one gets a checklist-only \`PLACE:<course>\` item. The score codes are Banner's own and their meaning isn't published; which codes unlock which course: ${placements.map((p) => `${p.code} (${p.scoreRanges.join(", ")})`).join("; ") || "(none)"}.`,
    "",
    `**Term dates:** ${meta.termStart} to ${meta.termEnd} (most common meeting startDate/endDate in Banner), scraped ${meta.scrapedOn} — written to src/data/meta.json for the term badge, footer, and .ics export.`,
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
