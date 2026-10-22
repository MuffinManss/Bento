// Parses UCR Degree Works (Ellucian) audit PDFs in the browser.
// `parsePdfAudit` lazy-loads pdfjs-dist so it doesn't slow the first paint.
// Nothing about the file or its text is sent to any server.

import { isRecognizedCode } from "./catalog";

export type ParsedCourse = {
  /** Normalized Bento catalog code, e.g. "CS010A". Best-guess if not in catalog. */
  code: string;
  /** Subject + number as printed, e.g. "CS 10A". */
  rawCode: string;
  title: string;
  /** Grade column value (upper-cased), e.g. "A", "B-", "REG", "TP". */
  grade: string;
  units: number;
  status: "completed" | "inprogress" | "notcompleted";
  /** Whether `code` exists in Bento's catalog. */
  inCatalog: boolean;
};

export type ParsedPdfAudit = {
  /** Grades A+–D-, S, P, TP/TA/TB/TC/TD. */
  completed: ParsedCourse[];
  /** Grade REG. */
  inProgress: ParsedCourse[];
  /** Grades F, NP, NC, W, I — not applied to the checklist. */
  notCompleted: ParsedCourse[];
  /** Normalized codes found in the audit that are not in Bento's catalog. */
  unmatched: string[];
  catalogYear: string | undefined;
  major: string | undefined;
  /** True when `catalogYear` was read and doesn't match "2026-2027". */
  catalogYearMismatch: boolean;
};

const EXPECTED_YEAR = "2026-2027";

const COMPLETED_GRADES = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-",
  "D+", "D", "D-", "S", "P", "TP", "TA", "TB", "TC", "TD",
]);
const INPROGRESS_GRADES = new Set(["REG"]);
const NOT_COMPLETED_GRADES = new Set(["F", "NP", "NC", "W", "I"]);

// Longest alternatives first so "A+" matches before "A", "REG" before bare letters, etc.
const GRADE_ALT = "REG|NP|NC|TP|TA|TB|TC|TD|A\\+|A-|B\\+|B-|C\\+|C-|D\\+|D-|A|B|C|D|F|S|P|W|I";

// Course line: SUBJ COURSE_NUM TITLE GRADE UNITS TERM YEAR
// Not anchored at ^ so it finds the course code even when a requirement label
// (from the x≈40 column) was merged onto the same text row by the PDF extractor.
// (.+?) is lazy and anchored by $ so it correctly captures the title regardless
// of whether the last word of the title looks like a grade.
const COURSE_LINE_RE = new RegExp(
  `([A-Z]{2,4})\\s+(\\d{1,3}-?[A-Z]{0,2})\\s+(.+?)\\s+(${GRADE_ALT})\\s+(\\(\\d+(?:\\.\\d+)?\\)|\\d+(?:\\.\\d+)?)\\s+((?:Fall|Winter|Spring|Summer)\\s+\\d{4})$`,
  "i",
);

const CATALOG_YEAR_RE = /Catalog\s+Year[\s:]*(\d{4}-\d{4})/i;
const MAJOR_RE = /^Major\s*:\s*(.+)/i;
// Line whose content resets the "Insufficient" skip state (new section header).
const SECTION_RESET_RE = /\bREQUIREMENT/i;
// "Exceptions" (plural) is the section heading; "Exception by:" is an inline
// note after individual courses and must NOT trigger a stop.
const STOP_RE = /^(EXCEPTIONS|LEGEND|DISCLAIMER)\b/i;
const INSUFFICIENT_RE = /^INSUFFICIENT\b/i;
const SATISFIED_BY_RE = /^Satisfied\s+by[\s:]/i;
const UCRV_RE = /^UCRV\s/i;

function spellings(subject: string, digits: string, suffix: string): string[] {
  return [3, 2, 1]
    .map((w) => `${subject}${digits.padStart(w, "0")}${suffix}`)
    .filter((s, i, a) => a.indexOf(s) === i && s.length > subject.length + suffix.length);
}

/** Normalize a raw subject + course number to the closest catalog code (or best guess). */
function normCode(rawSubj: string, rawNum: string, catalogCodes: ReadonlySet<string>): string {
  const subj = rawSubj.toUpperCase();
  const num = rawNum.toUpperCase().replace(/-/g, "");
  const m = num.match(/^(\d+)([A-Z]*)$/);
  if (!m) return `${subj}${num}`;
  const [, digits, suffix] = m;
  const opts = spellings(subj, digits, suffix);
  const hit = opts.find((c) => catalogCodes.has(c));
  return hit ?? opts[0] ?? `${subj}${num}`;
}

/**
 * Reconstructs text lines from pdfjs text items.
 *
 * Exported for testing. Called by `parsePdfAudit` for each PDF page.
 *
 * Key behaviour:
 * - Groups items into visual rows using ±3pt Y tolerance (items on the same
 *   printed row can have slightly different Y values due to sub-pixel rendering).
 * - All items in each row are kept, sorted left-to-right by X position.
 *   This means requirement label text (x ≈ 40) may prefix the course code when
 *   they share a visual row, but `parseDegreeWorksText` uses an unanchored regex
 *   so it finds the course code at any position in the line.
 *   Keeping all items is necessary because some Degree Works tables (Additional
 *   Units, In-progress) place the course code at the left margin (x ≈ 40–80),
 *   not in the standard course-code column (x ≈ 224).
 */
export function itemsToLines(rawItems: { str: string; transform: number[] }[]): string[] {
  // Filter empty strings.
  const items = rawItems.filter((item) => item.str.trim());

  // Sort top-to-bottom (descending Y in PDF coordinate space).
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);

  // Group into rows: items within ±3pt of the row's first item's Y.
  const rows: { y: number; words: { x: number; str: string }[] }[] = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const x = item.transform[4];
    const last = rows[rows.length - 1];
    if (last && Math.abs(y - last.y) <= 3) {
      last.words.push({ x, str: item.str });
    } else {
      rows.push({ y, words: [{ x, str: item.str }] });
    }
  }

  // Sort each row left-to-right and join.
  return rows.map(({ words }) =>
    words.sort((a, b) => a.x - b.x).map((w) => w.str).join(" "),
  );
}

/**
 * Parses text extracted from a UCR Degree Works audit PDF.
 * This is a pure function so tests can call it directly without rendering a real PDF.
 */
export function parseDegreeWorksText(
  text: string,
  catalogCodes: ReadonlySet<string>,
): ParsedPdfAudit {
  const lines = text.split(/\r?\n/);

  // Pass 1: extract catalog year and major from the whole document.
  let catalogYear: string | undefined;
  let major: string | undefined;
  for (const raw of lines) {
    const t = raw.trim();
    if (!catalogYear) {
      const m = t.match(CATALOG_YEAR_RE);
      if (m) catalogYear = m[1];
    }
    if (!major) {
      const m = t.match(MAJOR_RE);
      if (m) major = m[1].trim();
    }
    if (catalogYear && major) break;
  }

  // Pass 2: parse course rows, skipping excluded sections and duplicates.
  const seen = new Set<string>();
  const completed: ParsedCourse[] = [];
  const inProgress: ParsedCourse[] = [];
  const notCompleted: ParsedCourse[] = [];
  const unmatched: string[] = [];
  let inInsufficient = false;
  let stopped = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (stopped) continue;
    if (STOP_RE.test(line)) { stopped = true; continue; }
    if (INSUFFICIENT_RE.test(line)) { inInsufficient = true; continue; }
    // A new section header (contains "REQUIREMENT") resets the insufficient skip state.
    // Guard with !COURSE_LINE_RE so a title containing "REQUIREMENT" doesn't reset it.
    if (SECTION_RESET_RE.test(line) && !COURSE_LINE_RE.test(line)) {
      inInsufficient = false;
      continue;
    }
    if (inInsufficient) continue;
    if (SATISFIED_BY_RE.test(line)) continue;
    if (UCRV_RE.test(line)) continue;

    const m = line.match(COURSE_LINE_RE);
    if (!m) continue;
    const [, rawSubj, rawNum, rawTitle, rawGrade, rawUnits] = m;

    const grade = rawGrade.toUpperCase();
    const status: ParsedCourse["status"] | null =
      COMPLETED_GRADES.has(grade) ? "completed"
      : INPROGRESS_GRADES.has(grade) ? "inprogress"
      : NOT_COMPLETED_GRADES.has(grade) ? "notcompleted"
      : null;
    if (!status) continue;

    const code = normCode(rawSubj, rawNum, catalogCodes);
    if (seen.has(code)) continue;
    seen.add(code);

    // A code is "in catalog" if it's a known course OR a recognized variant prefix match.
    const inCatalog = isRecognizedCode(code, catalogCodes);
    if (!inCatalog && !unmatched.includes(code)) unmatched.push(code);

    const course: ParsedCourse = {
      code,
      rawCode: `${rawSubj.toUpperCase()} ${rawNum.toUpperCase().replace(/-/g, "")}`,
      title: rawTitle.trim(),
      grade,
      units: parseFloat(rawUnits.replace(/[()]/g, "")),
      status,
      inCatalog,
    };

    if (status === "completed") completed.push(course);
    else if (status === "inprogress") inProgress.push(course);
    else notCompleted.push(course);
  }

  return {
    completed,
    inProgress,
    notCompleted,
    unmatched,
    catalogYear,
    major,
    catalogYearMismatch: !!catalogYear && catalogYear !== EXPECTED_YEAR,
  };
}

/**
 * Reads a PDF File in the browser (never uploads it), extracts text with
 * pdfjs-dist (lazy-loaded on first call), and parses it as a Degree Works audit.
 */
export async function parsePdfAudit(
  file: File,
  catalogCodes: ReadonlySet<string>,
): Promise<ParsedPdfAudit> {
  const buffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  // Resolved by Vite's static analysis even inside a function.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).href;

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const rawItems = content.items
      .filter((item) => "str" in item)
      .map((item) => ({
        str: (item as { str: string }).str,
        transform: (item as { transform: number[] }).transform,
      }));

    pages.push(itemsToLines(rawItems).join("\n"));
  }

  return parseDegreeWorksText(pages.join("\n"), catalogCodes);
}
