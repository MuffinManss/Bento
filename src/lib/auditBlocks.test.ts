import { describe, expect, it } from "vitest";
import { requirements } from "../data/index";
import { unmetRequirementGroups } from "../solver/eligibility";
import { metGroupsFromBlocks, parseBlockStatuses } from "./auditBlocks";
import { parseAudit } from "./auditParser";
import { parseDegreeWorksText } from "./auditPdfParser";
import { catalogCodes, unitsMap } from "./catalog";

// Synthetic Degree Works text (fake student), laid out like the PDF rows:
// a "Blocks Included" list with no statuses, then each block header with its status.
const AUDIT = `
Degree in Bachelor of Science IN-PROGRESS
Units Required: 180 Units Applied: 190 Catalog Year: 2022-2023
Blocks Included:
Lower-division Computer Science Requirements
Upper-division Computer Science BS+MS Requirements
DEPTH for Bourns College of Engineering COMPLETE
Lower-division Computer Science Requirements COMPLETE
Units Required: 60 Units Applied: 60 Catalog Year: 2022-2023 GPA: 3.00
CS 010A INTRO: CS FOR SCI,MATH&ENGR I A 4 Fall 2022
ENGINEERING COURSE OUTSIDE OF
COMPUTER SCIENCE
Course Outside Computer Science Field MATH 046 ORDINARY DIFF EQUATIONS B 4 Summer 2026
Exception by: Advisor, Some On: 05/27/2026 Also Allow: Allow MATH 046 to apply here
Upper-division Computer Science BS+MS Requirements IN-PROGRESS
Units Required: 78 Units Applied: 70 Catalog Year: 2022-2023
CS 100 SOFTWARE CONSTRUCTION A 5 Fall 2024
Upper-division Computer Science Major GPA COMPLETE
`;

const ldGroups = requirements.filter((group) => group.id.startsWith("cs-bs-ld-")).map((group) => group.id);
const udGroups = requirements.filter((group) => group.id.startsWith("cs-bs-ud-")).map((group) => group.id);

describe("parseBlockStatuses", () => {
  it("reads each block's status from its header, ignoring the status-less Blocks Included list and the GPA block", () => {
    expect(parseBlockStatuses(AUDIT)).toEqual({ lowerDivision: "COMPLETE", upperDivision: "IN-PROGRESS" });
  });

  it("accepts a status on the line after the block name (pasted web text)", () => {
    const pasted = "Lower-division Computer Science Requirements\nCOMPLETE\nUpper-division Computer Science BS+MS Requirements\t\nINCOMPLETE";
    expect(parseBlockStatuses(pasted)).toEqual({ lowerDivision: "COMPLETE", upperDivision: "INCOMPLETE" });
  });

  it("finds nothing in text without block headers", () => {
    expect(parseBlockStatuses("CS 010A INTRO A 4 Fall 2024")).toEqual({});
  });
});

describe("metGroupsFromBlocks", () => {
  it("a COMPLETE lower-division block marks every cs-bs-ld-* group met; an IN-PROGRESS block marks none", () => {
    expect(ldGroups.length).toBeGreaterThan(0);
    expect(metGroupsFromBlocks({ lowerDivision: "COMPLETE", upperDivision: "IN-PROGRESS" }, requirements)).toEqual(ldGroups);
  });

  it("a COMPLETE upper-division block marks every cs-bs-ud-* group met", () => {
    expect(metGroupsFromBlocks({ upperDivision: "COMPLETE" }, requirements)).toEqual(udGroups);
  });

  it("the Engineering Course Outside CS group is met by the audit even with only 4 units toward Bento's 8", () => {
    const parsed = parseDegreeWorksText(AUDIT, catalogCodes);
    const completed = new Set(parsed.completed.map((course) => course.code));
    expect(completed.has("MATH046")).toBe(true);
    const withoutAudit = unmetRequirementGroups(requirements, completed, unitsMap).map((group) => group.id);
    expect(withoutAudit).toContain("cs-bs-ld-engineering-elective");
    const withAudit = unmetRequirementGroups(requirements, completed, unitsMap, new Set(metGroupsFromBlocks(parsed.blocks, requirements))).map((group) => group.id);
    expect(withAudit.filter((id) => id.startsWith("cs-bs-ld-"))).toEqual([]);
    expect(withAudit).toContain("cs-bs-ud-core");
  });
});

describe("audit parsers report block statuses", () => {
  it("PDF text and pasted text both carry them", () => {
    expect(parseDegreeWorksText(AUDIT, catalogCodes).blocks).toEqual({ lowerDivision: "COMPLETE", upperDivision: "IN-PROGRESS" });
    expect(parseAudit(AUDIT, catalogCodes).blocks).toEqual({ lowerDivision: "COMPLETE", upperDivision: "IN-PROGRESS" });
  });
});
