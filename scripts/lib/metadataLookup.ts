import { searchSubject } from "./searchSubject.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerSection } from "./bannerTypes.ts";

export const METADATA_SUBJECTS = ["MATH", "PHYS", "EE", "ENGR", "STAT", "CHEM", "ME", "PHIL", "LING", "ECON", "ENSC", "BIEN", "WRIT"];

// CS isn't a "metadata subject" (scrape-ucr.ts fetches it in full for its own
// sections.json pass), but it still needs this lookup's primary-term +
// fallback-term resolution for its prereq-leaf courses not offered now.
const PRIMARY_TERM_SUBJECTS = ["CS", ...METADATA_SUBJECTS];

// Catalog courses not offered in the primary term get a second look in
// these older terms.
const FALLBACK_TERMS: Record<string, string[]> = {
  CS: ["202620", "202610"],
  MATH: ["202620", "202610"],
  PHYS: ["202620", "202610"],
};

/**
 * Builds a course-code -> section lookup across every metadata subject (plus
 * CS, since CS courses not offered this term can still be prereq leaves).
 * Primary-term data always wins; fallback terms only fill in codes the
 * primary term didn't have.
 */
export async function buildMetadataLookup(client: BannerClient, term: string, rawDir: string): Promise<Map<string, BannerSection>> {
  const lookup = new Map<string, BannerSection>();

  for (const subject of PRIMARY_TERM_SUBJECTS) {
    const rows = await searchSubject(client, term, rawDir, subject);
    for (const row of rows) {
      if (!lookup.has(row.subjectCourse)) lookup.set(row.subjectCourse, row);
    }
  }

  for (const [subject, fallbackTerms] of Object.entries(FALLBACK_TERMS)) {
    for (const fallbackTerm of fallbackTerms) {
      const rows = await searchSubject(client, fallbackTerm, rawDir, subject);
      for (const row of rows) {
        if (!lookup.has(row.subjectCourse)) lookup.set(row.subjectCourse, row);
      }
    }
  }

  return lookup;
}
