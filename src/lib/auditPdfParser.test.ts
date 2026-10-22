import { describe, expect, it } from "vitest";
import { itemsToLines, parseDegreeWorksText } from "./auditPdfParser";
import { catalogCodes } from "./catalog";

// Synthetic Degree Works audit — fake name/ID, no real student data.
// Covers: completed letter grades, transfer grades (TP/TD), in-progress REG,
// Satisfied-by lines, Insufficient section, duplicate codes, CS179N variant.
const FIXTURE = `
Catalog Year:    2025-2026
Student Name:    JANE DOE
Student ID:      999000000

Major:           Computer Science, B.S.

LOWER-DIVISION REQUIREMENTS                Status: IN PROGRESS

  CS 10A    INTRO COMPUTER SCI I             A     4    Fall 2024
  CS 10B    INTRO COMPUTER SCI II            B+    4    Winter 2025
  MATH 9A   FIRST-YEAR CALCULUS I            TP    4    Fall 2023
  MATH 9B   FIRST-YEAR CALCULUS II           TD    4    Winter 2024
  CS 61     MACHINE ORGANIZATION             REG   (4)  Fall 2026

  Satisfied by: CS 010A

  CS 010A   INTRO COMPUTER SCI I             A     4    Fall 2024

UPPER-DIVISION REQUIREMENTS                Status: NOT STARTED

  CS 179N   TOPICS IN CS: NETWORKS           A     4    Spring 2025

INSUFFICIENT

  CS 199    INDEPENDENT STUDY                W     4    Fall 2024

EXCEPTIONS

  ENGL 001A FIRST-YEAR COMPOSITION           A     4    Fall 2024
`;

describe("parseDegreeWorksText", () => {
  it("parses completed courses with letter grades", () => {
    const { completed } = parseDegreeWorksText(FIXTURE, catalogCodes);
    const codes = completed.map((c) => c.code);
    expect(codes).toContain("CS010A");
    expect(codes).toContain("CS010B");
  });

  it("parses transfer grades TP and TD as completed", () => {
    const { completed } = parseDegreeWorksText(FIXTURE, catalogCodes);
    const codes = completed.map((c) => c.code);
    expect(codes).toContain("MATH009A"); // TP grade
    expect(codes).toContain("MATH009B"); // TD grade
    const math9a = completed.find((c) => c.code === "MATH009A");
    expect(math9a?.grade).toBe("TP");
  });

  it("parses in-progress REG courses with parenthetical units", () => {
    const { inProgress } = parseDegreeWorksText(FIXTURE, catalogCodes);
    const codes = inProgress.map((c) => c.code);
    expect(codes).toContain("CS061");
    const cs61 = inProgress.find((c) => c.code === "CS061");
    expect(cs61?.grade).toBe("REG");
    expect(cs61?.units).toBe(4);
  });

  it("keeps CS179N as-is (not remapped to CS179G) and marks it inCatalog via variantPrefix", () => {
    const { completed } = parseDegreeWorksText(FIXTURE, catalogCodes);
    const codes = completed.map((c) => c.code);
    expect(codes).toContain("CS179N"); // actual code preserved
    expect(codes).not.toContain("CS179G"); // no remapping
    const cs179n = completed.find((c) => c.code === "CS179N");
    expect(cs179n?.inCatalog).toBe(true); // recognized via variantPrefix, not in the unmatched list
  });

  it("deduplicates courses that appear multiple times (e.g. after Satisfied-by)", () => {
    const { completed } = parseDegreeWorksText(FIXTURE, catalogCodes);
    expect(completed.filter((c) => c.code === "CS010A")).toHaveLength(1);
  });

  it("skips courses listed under the INSUFFICIENT heading", () => {
    const result = parseDegreeWorksText(FIXTURE, catalogCodes);
    const allCodes = [
      ...result.completed,
      ...result.inProgress,
      ...result.notCompleted,
    ].map((c) => c.code);
    // CS 199 is under INSUFFICIENT — must not appear at all
    expect(allCodes.some((c) => c.includes("199"))).toBe(false);
  });

  it("stops parsing at the EXCEPTIONS section", () => {
    const result = parseDegreeWorksText(FIXTURE, catalogCodes);
    const allCodes = [
      ...result.completed,
      ...result.inProgress,
      ...result.notCompleted,
    ].map((c) => c.code);
    // ENGL 001A is in EXCEPTIONS — must not appear
    expect(allCodes.some((c) => c.startsWith("ENGL"))).toBe(false);
  });

  it("reads catalog year and flags a mismatch when not 2026-2027", () => {
    const { catalogYear, catalogYearMismatch } = parseDegreeWorksText(FIXTURE, catalogCodes);
    expect(catalogYear).toBe("2025-2026");
    expect(catalogYearMismatch).toBe(true);
  });

  it("does not flag a mismatch for catalog year 2026-2027", () => {
    const text = FIXTURE.replace("2025-2026", "2026-2027");
    const { catalogYear, catalogYearMismatch } = parseDegreeWorksText(text, catalogCodes);
    expect(catalogYear).toBe("2026-2027");
    expect(catalogYearMismatch).toBe(false);
  });

  it("reads the major name", () => {
    const { major } = parseDegreeWorksText(FIXTURE, catalogCodes);
    expect(major).toBe("Computer Science, B.S.");
  });

  it("puts courses not in the catalog in the unmatched list", () => {
    // Remove CS010B from catalog to simulate an unmatched code.
    const subset = new Set([...catalogCodes].filter((c) => c !== "CS010B"));
    const { completed, unmatched } = parseDegreeWorksText(FIXTURE, subset);
    expect(unmatched).toContain("CS010B");
    // It still appears in completed (inCatalog: false)
    expect(completed.find((c) => c.code === "CS010B")?.inCatalog).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// itemsToLines — PDF item extraction (reproduces the real Degree Works failure)
// ---------------------------------------------------------------------------

/** Builds a synthetic pdfjs text item with the standard 6-element transform matrix. */
function item(str: string, x: number, y: number): { str: string; transform: number[] } {
  return { str, transform: [10, 0, 0, 10, x, y] };
}

describe("itemsToLines", () => {
  it("groups items on the same visual row (Y within 3pt) into one line", () => {
    const items = [
      item("CS", 224.7, 510.0),
      item("010A", 235.0, 510.0),
      item("INTRO: CS FOR SCI", 289.3, 510.0),
    ];
    const lines = itemsToLines(items);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("CS 010A INTRO: CS FOR SCI");
  });

  it("treats items within 3pt Y tolerance as one row", () => {
    // Y values 510.0 and 512.9 are within 3pt — should merge.
    const items = [item("SUBJ", 224.7, 510.0), item("001A", 240.0, 512.9)];
    const lines = itemsToLines(items);
    expect(lines).toHaveLength(1);
  });

  it("separates items more than 3pt apart into different rows", () => {
    // Y values 510.0 and 497.0 differ by 13pt — different rows.
    const items = [item("CS", 224.7, 510.0), item("MATH", 224.7, 497.0)];
    const lines = itemsToLines(items);
    expect(lines).toHaveLength(2);
  });

  it("filters label-column items (x < 150) when course-column items (x ≥ 150) are present", () => {
    // Simulates the real Degree Works bug: requirement label at x≈40 merged with
    // course code at x≈224 because their Y values differ by only 0.2pt.
    const items = [
      item("Intro to Computer Science for Sci, Math, and Engr I", 40.0, 510.2),
      item("CS", 224.7, 510.0),
      item("010A", 235.0, 510.0),
      item("INTRO: CS FOR SCI,MATH&ENGR I", 289.3, 510.0),
      item("TD", 464.0, 510.0),
      item("4.5", 497.0, 510.0),
      item("Summer", 519.0, 510.0),
      item("2021", 540.0, 510.0),
    ];
    const lines = itemsToLines(items);
    expect(lines).toHaveLength(1);
    // Must start with the course code, not the requirement label.
    expect(lines[0]).toMatch(/^CS\s+010A/);
    expect(lines[0]).not.toContain("Intro to Computer Science");
  });

  it("preserves label-column-only rows (section headers, catalog year, major)", () => {
    // These lines have no content items at x ≥ 150 — they must be kept intact.
    const items = [
      item("LOWER-DIVISION", 40.0, 700.0),
      item("REQUIREMENTS", 120.0, 700.0),
    ];
    const lines = itemsToLines(items);
    // Both items have x < 150 (well, 120 < 150) — but LOWER-DIVISION is at 40.
    // All items are below LABEL_X_THRESHOLD so hasContent = false → keep all.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("LOWER-DIVISION");
    expect(lines[0]).toContain("REQUIREMENTS");
  });

  it("end-to-end: label-merged PDF items produce correctly parsed courses", () => {
    // Reproduces the exact failure mode: label at x≈40 is 0.2pt away from
    // the course code items and merges into the same Y bucket.
    const pageItems = [
      // Catalog year line (no course column items)
      item("Catalog", 40.0, 750.0),
      item("Year:", 80.0, 750.0),
      item("2026-2027", 110.0, 750.0),
      // Major line
      item("Major:", 40.0, 730.0),
      item("Computer Science, B.S.", 80.0, 730.0),
      // Section header
      item("LOWER-DIVISION REQUIREMENT", 40.0, 700.0),
      // Course row: label at x=40 (y=510.2), course data at x≥224 (y=510.0)
      item("Intro to Computer Science for Sci, Math, and Engr I", 40.0, 510.2),
      item("CS", 224.7, 510.0),
      item("010A", 235.0, 510.0),
      item("INTRO: CS FOR SCI,MATH&ENGR I", 289.3, 510.0),
      item("TD", 464.0, 510.0),
      item("4.5", 497.0, 510.0),
      item("Summer", 519.0, 510.0),
      item("2021", 540.0, 510.0),
      // Another course row (different Y)
      item("Intro to Computer Science for Sci, Math, and Engr II", 40.0, 497.2),
      item("CS", 224.7, 497.0),
      item("010B", 235.0, 497.0),
      item("INTRO: CS FOR SCI,MATH&ENGR II", 289.3, 497.0),
      item("A", 464.0, 497.0),
      item("4", 497.0, 497.0),
      item("Winter", 519.0, 497.0),
      item("2022", 540.0, 497.0),
    ];
    const text = itemsToLines(pageItems).join("\n");
    const catalog = new Set(["CS010A", "CS010B"]);
    const { completed } = parseDegreeWorksText(text, catalog);
    const codes = completed.map((c) => c.code);
    expect(codes).toContain("CS010A");
    expect(codes).toContain("CS010B");
  });
});
