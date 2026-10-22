// Extracts course codes from pasted degree-audit text (e.g. "CS 010A",
// "MATH 9A", "ENGR 001-I") and matches them against Bento's catalog codes
// (e.g. "CS010A", "MATH009A", "MATH09HA", "ENGR001I").

import { parseBlockStatuses } from "./auditBlocks";
import type { AuditBlocks } from "./auditBlocks";
import { isRecognizedCode } from "./catalog";

/** SUBJ + optional space + 1-3 digit number + optional hyphen + up to 2 suffix letters, as whole words (not "GPA 3.85"). */
const CODE_RE = /\b([A-Z]{2,4}) ?(\d{1,3})-?([A-Z]{0,2})\b(?!\.\d)/g;
/** Term labels audits print next to courses ("FA25", "WI 26") — not course codes. */
const TERM_RE = /^(FA|WI|SP|SU)\d{2}$/;

export type AuditMatch = {
  /** Catalog codes found, in order of first appearance. */
  matched: string[];
  /** Codes found in the text that aren't in the catalog (normalized, e.g. "ENGL001A"). */
  unmatched: string[];
  /** Lower-/upper-division block statuses, when the pasted text includes them. */
  blocks: AuditBlocks;
};

/**
 * Catalog spellings to try for one number, most common first: our codes
 * zero-pad to 3 digits ("CS010A"), except UCR's honors codes which use 2
 * ("MATH09HA").
 */
function spellings(subject: string, digits: string, suffix: string): string[] {
  return [3, 2, 1].map((width) => `${subject}${digits.padStart(width, "0")}${suffix}`).filter((code, i, all) => all.indexOf(code) === i && code.length > subject.length + suffix.length);
}

/** Finds every course code in `text` and splits them into catalog matches and unknown codes. */
export function parseAudit(text: string, catalogCodes: ReadonlySet<string>): AuditMatch {
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const [, subject, digits, suffix] of text.toUpperCase().matchAll(CODE_RE)) {
    if (TERM_RE.test(`${subject}${digits}${suffix}`)) continue;
    const options = spellings(subject, digits, suffix);
    // Accept catalog codes first, then any recognized variant-prefix code.
    const hit = options.find((code) => catalogCodes.has(code)) ?? options.find((code) => isRecognizedCode(code, catalogCodes));
    const code = hit ?? options[0];
    const list = hit ? matched : unmatched;
    if (!list.includes(code)) list.push(code);
  }
  return { matched, unmatched, blocks: parseBlockStatuses(text) };
}
