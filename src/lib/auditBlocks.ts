// Reads Degree Works block statuses ("Lower-division Computer Science
// Requirements  COMPLETE") from audit text, so the student's audit — not
// Bento's 2026-27 catalog — decides which requirement groups are already met.
// Used by both the PDF parser and the paste fallback.

import type { RequirementGroup } from "../solver/types";

export type BlockStatus = "COMPLETE" | "IN-PROGRESS" | "INCOMPLETE";
export type AuditBlock = "lowerDivision" | "upperDivision";
/** Status of each major block the audit printed (missing = not found in the text). */
export type AuditBlocks = Partial<Record<AuditBlock, BlockStatus>>;

/** Why a requirement group counts as met without its courses: the audit's block status, or the student's own toggle. */
export type MetSource = "audit" | "manual";

/** Requirement-group id prefix covered by each audit block. */
const GROUP_PREFIX: Record<AuditBlock, string> = { lowerDivision: "cs-bs-ld-", upperDivision: "cs-bs-ud-" };

/** "Lower-division Computer Science Requirements" / "Upper-division Computer Science BS+MS Requirements" (not "... Major GPA"). */
const BLOCK_NAME = String.raw`\b(Lower|Upper)-[Dd]ivision Computer Science\b.*\bRequirements`;
const STATUS = "(COMPLETE|IN-PROGRESS|INCOMPLETE)";
/** Name and status on one line (PDF rows). */
const BLOCK_LINE_RE = new RegExp(`${BLOCK_NAME}\\s+${STATUS}\\s*$`);
/** Name alone; pasted web text can put the status on the next line. */
const BLOCK_NAME_ONLY_RE = new RegExp(`${BLOCK_NAME}\\s*$`);
const STATUS_ONLY_RE = new RegExp(`^${STATUS}$`);

function blockOf(division: string): AuditBlock {
  return division === "Lower" ? "lowerDivision" : "upperDivision";
}

/** First status printed for each major block. */
export function parseBlockStatuses(text: string): AuditBlocks {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line);
  const blocks: AuditBlocks = {};
  lines.forEach((line, index) => {
    const sameLine = line.match(BLOCK_LINE_RE);
    const nameOnly = sameLine ? null : line.match(BLOCK_NAME_ONLY_RE);
    const nextStatus = nameOnly ? lines[index + 1]?.match(STATUS_ONLY_RE) : null;
    const division = sameLine?.[1] ?? (nextStatus ? nameOnly?.[1] : undefined);
    const status = (sameLine?.[2] ?? nextStatus?.[1]) as BlockStatus | undefined;
    if (!division || !status) return;
    const block = blockOf(division);
    if (!blocks[block]) blocks[block] = status;
  });
  return blocks;
}

/** Ids of the requirement groups inside every block the audit marks COMPLETE. */
export function metGroupsFromBlocks(blocks: AuditBlocks, requirements: RequirementGroup[]): string[] {
  const prefixes = (Object.keys(GROUP_PREFIX) as AuditBlock[]).filter((block) => blocks[block] === "COMPLETE").map((block) => GROUP_PREFIX[block]);
  return requirements.filter((group) => prefixes.some((prefix) => group.id.startsWith(prefix))).map((group) => group.id);
}
