// Extracts course codes from pasted degree-audit text (e.g. "CS 010A",
// "MATH 9A", "ENGR 001-I") and matches them against Bento's catalog codes
// (e.g. "CS010A", "MATH009A", "MATH09HA", "ENGR001I").

/** SUBJ + optional space + 1-3 digit number + optional hyphen + up to 2 suffix letters, as whole words (not "GPA 3.85"). */
const CODE_RE = /\b([A-Z]{2,4}) ?(\d{1,3})-?([A-Z]{0,2})\b(?!\.\d)/g;
/** Term labels audits print next to courses ("FA25", "WI 26") — not course codes. */
const TERM_RE = /^(FA|WI|SP|SU)\d{2}$/;

export type AuditMatch = {
  /** Catalog codes found, in order of first appearance. */
  matched: string[];
  /** Codes found in the text that aren't in the catalog (normalized, e.g. "ENGL001A"). */
  unmatched: string[];
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
    const hit = options.find((code) => catalogCodes.has(code));
    const bestGuess = hit ?? options[0];
    // CS 179 variant fix: any CS179[A-Z] (e.g. CS179N) counts toward the project seminar group.
    const cs179fix = !hit && /^CS179[A-Z]$/.test(bestGuess) && catalogCodes.has("CS179G");
    const code = cs179fix ? "CS179G" : bestGuess;
    const list = cs179fix || hit ? matched : unmatched;
    if (!list.includes(code)) list.push(code);
  }
  return { matched, unmatched };
}
