import { searchSubject } from "./searchSubject.ts";
import { loadTerms } from "./terms.ts";
import type { Term } from "./terms.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerSection } from "./bannerTypes.ts";

export const METADATA_SUBJECTS = ["MATH", "PHYS", "EE", "ENGR", "STAT", "CHEM", "ME", "PHIL", "LING", "ECON", "ENSC", "BIEN", "WRIT"];

// CS isn't a "metadata subject" (scrape-ucr.ts fetches it in full for its own
// sections.json pass), but it still needs this lookup's primary-term +
// fallback-term resolution for its prereq-leaf courses not offered now.
const PRIMARY_TERM_SUBJECTS = ["CS", ...METADATA_SUBJECTS];

// Subjects that can appear in requirements.json or a CS prerequisite. A course
// of theirs that isn't offered in the primary term still needs a title and unit
// count, so a student can tick it off as completed — e.g. ENGR001I is a
// required lower-division course but a fall-only one. Anything resolved from a
// fallback term is marked `offered: false` by the caller, so the solver never
// schedules it. The other metadata subjects only supply prereq-leaf titles and
// are left on the primary term to keep the request count down.
const FALLBACK_SUBJECTS = ["CS", "MATH", "PHYS", "ENGR", "EE", "STAT"];
const FALLBACK_TERM_COUNT = 3;

/**
 * The most recent terms older than `term`, newest first — derived from the
 * term list Banner publishes rather than hardcoded, so this doesn't silently
 * go stale when the primary term moves to the next quarter. Summer terms
 * (code ending "30") are skipped: their offerings are a thin subset of the
 * regular year, so they rarely add a course the other terms don't have.
 */
export function fallbackTerms(term: string, terms: Term[]): string[] {
  return terms
    .map((t) => t.code)
    .filter((code) => code < term && !code.endsWith("30"))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, FALLBACK_TERM_COUNT);
}

/** `fallbackTerms` against Banner's published term list (cached under rawDir). */
export async function loadFallbackTerms(client: BannerClient, term: string, rawDir: string): Promise<string[]> {
  return fallbackTerms(term, await loadTerms(client, rawDir));
}

/**
 * Builds a course-code -> section lookup across every metadata subject (plus
 * CS, since CS courses not offered this term can still be prereq leaves).
 * Primary-term data always wins; fallback terms only fill in codes no
 * earlier (newer) term had.
 */
export async function buildMetadataLookup(client: BannerClient, term: string, rawDir: string): Promise<Map<string, BannerSection>> {
  const lookup = new Map<string, BannerSection>();

  for (const subject of PRIMARY_TERM_SUBJECTS) {
    const rows = await searchSubject(client, term, rawDir, subject);
    for (const row of rows) {
      if (!lookup.has(row.subjectCourse)) lookup.set(row.subjectCourse, row);
    }
  }

  for (const fallbackTerm of await loadFallbackTerms(client, term, rawDir)) {
    for (const subject of FALLBACK_SUBJECTS) {
      const rows = await searchSubject(client, fallbackTerm, rawDir, subject);
      for (const row of rows) {
        if (!lookup.has(row.subjectCourse)) lookup.set(row.subjectCourse, row);
      }
    }
  }

  return lookup;
}
