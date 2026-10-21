import { cached } from "./cache.ts";
import type { BannerClient } from "./bannerClient.ts";
import type { BannerSearchResponse, BannerSection } from "./bannerTypes.ts";

const PAGE_SIZE = 500;

/**
 * Re-selects the term (clearing Banner's cached search criteria — see
 * bannerClient.ts) then fetches every page of a subject's section search,
 * caching each page under raw/searchResults/.
 */
export async function searchSubject(client: BannerClient, term: string, rawDir: string, subject: string): Promise<BannerSection[]> {
  await client.selectTerm(term);

  const rows: BannerSection[] = [];
  let offset = 0;
  let totalCount = Infinity;

  while (offset < totalCount) {
    const cachePath = `${rawDir}/searchResults/${subject}_${term}_offset${offset}.json`;
    const text = await cached(cachePath, () =>
      client.get("/searchResults/searchResults", {
        txt_subject: subject,
        txt_term: term,
        pageOffset: String(offset),
        pageMaxSize: String(PAGE_SIZE),
        sortColumn: "subjectDescription",
        sortDirection: "asc",
      }),
    );
    const page = JSON.parse(text) as BannerSearchResponse;
    totalCount = page.totalCount;
    rows.push(...(page.data ?? []));
    offset += PAGE_SIZE;
  }

  return rows;
}
