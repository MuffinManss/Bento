import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Writes (or replaces) one named section of DATA_TODO.md, leaving every
 * other section untouched. Lets independent scripts (scrape-ucr,
 * parse-catalog, ...) each own their slice of the file and re-run freely.
 */
export function upsertDataTodoSection(filePath: string, sectionTitle: string, bodyLines: string[]): void {
  const begin = `<!-- BEGIN ${sectionTitle} -->`;
  const end = `<!-- END ${sectionTitle} -->`;
  const section = [begin, `## ${sectionTitle}`, "", ...bodyLines, end].join("\n");

  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "# DATA_TODO\n\nAmbiguities, gaps, and assumptions found while scraping/parsing UCR data. Never silently guessed — always flagged here.\n";

  const pattern = new RegExp(`${begin}[\\s\\S]*?${end}`);
  const next = pattern.test(existing) ? existing.replace(pattern, section) : `${existing.trimEnd()}\n\n${section}\n`;
  writeFileSync(filePath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}
