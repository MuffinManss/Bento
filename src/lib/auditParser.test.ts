import { describe, expect, it } from "vitest";
import { parseAudit } from "./auditParser";
import { catalogCodes } from "./catalog";

describe("parseAudit", () => {
  it("normalizes spaced, unpadded codes to catalog format", () => {
    const text = "Completed: CS 10A (A-), CS 010B, CS061, MATH 9A, MATH 009B";
    expect(parseAudit(text, catalogCodes)).toEqual({ matched: ["CS010A", "CS010B", "CS061", "MATH009A", "MATH009B"], unmatched: [] });
  });

  it("handles honors 2-digit codes, hyphenated letter suffixes, and lowercase", () => {
    const { matched } = parseAudit("math 09ha  ENGR 001-I  phys 40hc  WRIT 020S", catalogCodes);
    expect(matched).toEqual(["MATH09HA", "ENGR001I", "PHYS040HC", "WRIT020S"]);
  });

  it("lists codes that aren't in the catalog, normalized and deduped", () => {
    const { matched, unmatched } = parseAudit("ENGL 001A, CS 100, HIST 10, ENGL 1A, cs 100", catalogCodes);
    expect(matched).toEqual(["CS100"]);
    expect(unmatched).toEqual(["ENGL001A", "HIST010"]);
  });

  it("ignores things that only look like codes: years, times, and grades", () => {
    expect(parseAudit("Fall 2026 term, 12:30 PM, GPA 3.85, grade B+, unit total 180.0", catalogCodes)).toEqual({ matched: [], unmatched: [] });
  });

  it("parses a realistic multi-line audit block", () => {
    const audit = `
      LOWER-DIVISION REQUIREMENTS                 Status: IN PROGRESS
        FA25  CS 010A   INTRO COMPUTER SCI I        4.0  A
        FA25  MATH 009A FIRST-YEAR CALCULUS          4.0  B+
        WI26  CS 010B   INTRO COMPUTER SCI II       4.0  IP
        FA25  ENGR 001I PROFESSIONAL DEVELOPMENT     1.0  S
    `;
    // Term labels (FA25, WI26) are not reported as unknown courses.
    expect(parseAudit(audit, catalogCodes)).toEqual({ matched: ["CS010A", "MATH009A", "CS010B", "ENGR001I"], unmatched: [] });
  });
});
