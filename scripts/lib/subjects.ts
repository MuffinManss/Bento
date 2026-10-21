import { cached } from "./cache.ts";
import { decodeEntities } from "./text.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerSubject } from "./bannerTypes.ts";

/**
 * Fetches (and caches) Banner's subject code <-> description table, e.g.
 * { code: "CS", description: "Computer Science" }. Used to resolve the
 * "Course or Test: <Subject Description> <Number>" lines in prerequisite
 * HTML back into course codes like "CS010A".
 */
export async function loadSubjects(client: BannerClient, term: string, rawDir: string): Promise<BannerSubject[]> {
  const cachePath = `${rawDir}/subjects_${term}.json`;
  const text = await cached(cachePath, () =>
    client.get("/classSearch/get_subject", {
      term,
      offset: "1",
      max: "500",
      searchTerm: "",
    }),
  );
  const raw = JSON.parse(text) as BannerSubject[];
  return raw.map((s) => ({ code: s.code, description: decodeEntities(s.description).trim() }));
}

export function bySubjectDescription(subjects: BannerSubject[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of subjects) map.set(s.description.toLowerCase(), s.code);
  return map;
}
