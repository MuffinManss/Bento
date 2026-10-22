import { cached } from "./cache.ts";
import { parsePrereqHtml } from "./prereqParser.ts";
import type { Placement } from "./prereqParser.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerSection } from "./bannerTypes.ts";
import type { Prereq } from "../../src/solver/types.ts";

/**
 * Fetches (one representative row per course) and parses the prerequisite
 * tree for every course in `representativeRows`. Each row's own `term` is
 * used — not a single global term — since some rows are backfilled from an
 * older term the course was actually offered in. Raw HTML is cached to
 * raw/prereqs/<course>.html (shared across terms: a course's prereq rule
 * doesn't change just because we looked it up via an older offering).
 * Also returns any placement-exam alternatives found, keyed by course.
 */
export async function fetchPrereqs(
  client: BannerClient,
  representativeRows: Map<string, BannerSection>,
  rawDir: string,
  subjectDescToCode: Map<string, string>,
): Promise<{ trees: Map<string, Prereq>; warnings: string[]; placements: Map<string, Placement> }> {
  const warnings: string[] = [];
  const trees = new Map<string, Prereq>();
  const placements = new Map<string, Placement>();

  for (const [course, row] of representativeRows) {
    const cachePath = `${rawDir}/prereqs/${course}.html`;
    const html = await cached(cachePath, () =>
      client.post("/searchResults/getSectionPrerequisites", { term: row.term, courseReferenceNumber: row.courseReferenceNumber }),
    );
    const { tree, warnings: w, placement } = parsePrereqHtml(html, course, subjectDescToCode);
    warnings.push(...w);
    if (tree) trees.set(course, tree);
    if (placement) placements.set(course, placement);
  }

  return { trees, warnings, placements };
}
