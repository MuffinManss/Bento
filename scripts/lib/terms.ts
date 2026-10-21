import { cached } from "./cache.ts";
import { decodeEntities } from "./text.ts";
import type { BannerClient } from "./bannerClient.ts";

export type Term = { code: string; description: string };

/** Fetches (and caches) the list of terms Banner currently exposes, newest first. */
export async function loadTerms(client: BannerClient, rawDir: string): Promise<Term[]> {
  const cachePath = `${rawDir}/terms.json`;
  const text = await cached(cachePath, () => client.get("/classSearch/getTerms", { searchTerm: "", offset: "1", max: "20" }));
  const raw = JSON.parse(text) as Term[];
  return raw.map((t) => ({ code: t.code, description: decodeEntities(t.description).trim() }));
}
