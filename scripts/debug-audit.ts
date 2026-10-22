// Debug script: reads raw/my-audit.pdf and shows per-page item layout + course parsing diff.
// Usage: npx tsx scripts/debug-audit.ts
// The PDF is gitignored; never commit it.

import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { itemsToLines, parseDegreeWorksText } from "../src/lib/auditPdfParser";

// pdfjs legacy build for Node.js
// @ts-ignore
const pdfjsLib = await import("../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
).href;

const buf = readFileSync("raw/my-audit.pdf");
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

console.log(`Pages: ${pdf.numPages}\n`);

type RawItem = { str: string; transform: number[] };

// ── 1. Per-page item dump (first 40 items per page) ──────────────────────────

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const items: RawItem[] = content.items
    .filter((i) => "str" in i && (i as { str: string }).str.trim())
    .map((i) => ({ str: (i as { str: string }).str, transform: (i as { transform: number[] }).transform }));

  console.log(`\n=== PAGE ${p} — ${items.length} items (first 40) ===`);
  for (const it of items.slice(0, 40)) {
    const x = it.transform[4].toFixed(1);
    const y = it.transform[5].toFixed(1);
    console.log(`  x=${x.padStart(6)}  y=${y.padStart(6)}  "${it.str}"`);
  }
}

// ── 2. Full per-page line reconstruction + course parse ───────────────────────

const allPages: string[] = [];

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const items: RawItem[] = content.items
    .filter((i) => "str" in i && (i as { str: string }).str.trim())
    .map((i) => ({ str: (i as { str: string }).str, transform: (i as { transform: number[] }).transform }));

  const lines = itemsToLines(items);
  allPages.push(lines.join("\n"));
}

const fullText = allPages.join("\n");

// Use a tiny stub catalogCodes so we can see all course codes found (matched + unmatched).
const emptyCatalog: ReadonlySet<string> = new Set();
const result = parseDegreeWorksText(fullText, emptyCatalog);

const allFound = [
  ...result.completed.map((c) => ({ ...c, bucket: "completed" })),
  ...result.inProgress.map((c) => ({ ...c, bucket: "inprogress" })),
  ...result.notCompleted.map((c) => ({ ...c, bucket: "notcompleted" })),
];

console.log(`\n=== COURSES FOUND (${allFound.length} total) ===`);
for (const c of allFound) {
  console.log(
    `  ${c.bucket.padEnd(11)}  grade=${c.grade.padEnd(4)}  units=${String(c.units).padEnd(4)}  ${c.code.padEnd(12)}  "${c.title}"`,
  );
}

// ── 3. Show reconstructed lines per page (full dump) ─────────────────────────

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const items: RawItem[] = content.items
    .filter((i) => "str" in i && (i as { str: string }).str.trim())
    .map((i) => ({ str: (i as { str: string }).str, transform: (i as { transform: number[] }).transform }));

  const lines = itemsToLines(items);
  console.log(`\n=== PAGE ${p} LINES (${lines.length}) ===`);
  for (const l of lines) {
    if (l.trim()) console.log(`  ${l}`);
  }
}
