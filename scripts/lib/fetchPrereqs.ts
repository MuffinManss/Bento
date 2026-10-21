import { cached } from "./cache.ts";
import { parsePrereqHtml } from "./prereqParser.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerSection } from "./bannerTypes.ts";
import type { Prereq } from "../../src/solver/types.ts";

/**
 * Fetches (one CRN per course) and parses the prerequisite tree for every
 * unique course code in `rows`. Raw HTML is cached to raw/prereqs/<course>.html.
 */
export async function fetchPrereqs(
  client: BannerClient,
  term: string,
  rawDir: string,
  rows: BannerSection[],
  subjectDescToCode: Map<string, string>,
): Promise<{ trees: Map<string, Prereq>; warnings: string[] }> {
  const warnings: string[] = [];
  const trees = new Map<string, Prereq>();

  const representativeCrn = new Map<string, string>();
  for (const row of rows) {
    if (!representativeCrn.has(row.subjectCourse)) {
      representativeCrn.set(row.subjectCourse, row.courseReferenceNumber);
    }
  }

  for (const [course, crn] of representativeCrn) {
    const cachePath = `${rawDir}/prereqs/${course}.html`;
    const html = await cached(cachePath, () => client.post("/searchResults/getSectionPrerequisites", { term, courseReferenceNumber: crn }));
    const { tree, warnings: w } = parsePrereqHtml(html, course, subjectDescToCode);
    warnings.push(...w);
    if (tree) trees.set(course, tree);
  }

  return { trees, warnings };
}
