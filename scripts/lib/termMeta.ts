// Builds src/data/meta.json: which term the data is for, its class start/end
// dates (from Banner's per-meeting startDate/endDate), and when the data was
// scraped. The UI reads it for the term badge, footer, and .ics export.

import { statSync } from "node:fs";
import type { BannerSection } from "./bannerTypes.ts";
import type { TermMeta } from "../../src/data/index.ts";

/** "09/24/2026" -> "2026-09-24" */
function isoDate(banner: string): string {
  const [month, day, year] = banner.split("/");
  return `${year}-${month}-${day}`;
}

/** Local calendar date (the scraper runs on a machine in the user's timezone), YYYY-MM-DD. */
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Term dates = the most common meeting startDate/endDate across the rows
 * actually scheduled. Rows whose dates differ (short sessions, late starts)
 * are returned as warnings since the solver/export assume one date range.
 */
export function buildTermMeta(term: string, termDescription: string, rows: BannerSection[], scrapeCacheFile: string): { meta: TermMeta; warnings: string[] } {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const { meetingTime } of row.meetingsFaculty) {
      if (!meetingTime.startDate || !meetingTime.endDate) continue;
      const key = `${meetingTime.startDate}|${meetingTime.endDate}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) throw new Error(`No meeting start/end dates found for term ${term} — can't derive term dates.`);
  const [start, end] = ranked[0][0].split("|");
  const warnings = ranked.slice(1).map(([key, count]) => `${count} meeting row(s) run ${key.replace("|", " to ")} instead of the term's ${start} to ${end} — calendar export uses the term dates for these.`);

  const meta: TermMeta = {
    term,
    termLabel: termDescription.replace(/\s*\(.*\)\s*$/, "").trim(),
    termStart: isoDate(start),
    termEnd: isoDate(end),
    // The cache file's mtime is when Banner was actually queried (re-runs reuse the cache).
    scrapedOn: localDate(statSync(scrapeCacheFile).mtime),
  };
  return { meta, warnings };
}
