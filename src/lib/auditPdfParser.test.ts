import { describe, expect, it } from "vitest";
import { parseDegreeWorksText } from "./auditPdfParser";
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
