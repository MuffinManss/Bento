import { decodeEntities } from "./text.ts";
import type { Prereq } from "../../src/solver/types.ts";

/** A placement-exam alternative found in a course's prereqs ("Math: Score for Prereq 612 to 613"). */
export type Placement = { code: string; title: string; scoreRanges: string[] };

export type PrereqParseResult = {
  tree: Prereq | undefined;
  warnings: string[];
  /** Set if the prereqs accept a placement score — becomes a checklist-only "PLACE:<course>" item. */
  placement?: Placement;
};

type Leaf = { course: string; concurrentOk?: boolean };

const COURSE_NUMBER_RE = /^\d{2,3}[A-Z]{0,3}$/;
const PICK_RULE_RE = /^Rule: PICK(\d+): Pick \d+ of (\d+) courses.*?conditions\s*(.*?)\s*End of Rule PICK\d+$/i;
const PICK_ITEM_RE = /(.+?)\s+May (not )?be taken concurrently\./gi;
const SCORE_RE = /^(\w[\w ]*?): Score for Prereq (\d+) to (\d+)$/i;

/** "MATH009A" -> "MATH 009A" */
function displayCode(code: string): string {
  return code.replace(/^([A-Z]+)(\d)/, "$1 $2");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ""));
}

/**
 * Parses UCR's "Catalog Prerequisites" fragment (from
 * searchResults/getSectionPrerequisites) into a Prereq AND/OR tree.
 *
 * Grouping assumption (NOT verifiable from the HTML alone — see
 * DATA_TODO.md): every parenthesis in the source wraps exactly one leaf
 * term, so the parens carry no real nesting information. The actual
 * grouping is inferred from and/or token order: "or" binds adjacent leaf
 * terms together (alternate/equivalent courses), "and" chains those
 * or-groups. This matched every multi-term example found in Fall 2026 CS
 * prerequisites (e.g. "CS 011 or MATH 011 and MATH 009C or MATH 09HC..."
 * parses as (CS011 OR MATH011) AND (MATH009C OR MATH09HC) AND ...).
 *
 * Two non-leaf line kinds are also handled:
 * - "Rule: PICKn: Pick n of m courses ... End of Rule PICKn" (one line) becomes
 *   a single { pick: n, of: [...] } term in the and/or chain.
 * - "<Subject>: Score for Prereq X to Y" (placement exam) becomes a
 *   "PLACE:<this course>" leaf. It sits inside a "Course or Test:" group with
 *   no connector, so it's OR-ed with the course before it; consecutive score
 *   lines are alternatives and collapse into one leaf.
 */
export function parsePrereqHtml(
  html: string,
  courseCode: string,
  subjectDescToCode: Map<string, string>,
): PrereqParseResult {
  const warnings: string[] = [];

  if (/No prerequisite information available/i.test(html)) {
    return { tree: undefined, warnings };
  }

  const preBlocks = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((m) => stripTags(m[1]));
  if (preBlocks.length === 0) {
    warnings.push(`${courseCode}: prereq HTML had no <pre> blocks and didn't say "no prerequisite" — inspect raw HTML manually.`);
    return { tree: undefined, warnings };
  }

  const header = preBlocks[0].trim();
  const headerMatch = header.match(/^Prerequisites:(\S+)/);
  if (!headerMatch) {
    warnings.push(`${courseCode}: expected a "Prerequisites:<code>" header line, got "${header}".`);
  } else if (headerMatch[1] !== courseCode) {
    warnings.push(`${courseCode}: prereq header named "${headerMatch[1]}" instead of the queried course — verify this CRN belongs to ${courseCode}.`);
  }

  // Anomaly check: every paren pair should wrap exactly one "Course or Test:" leaf.
  // (Parens are stripped below and ignored for the actual tree — see doc comment.)
  const body = preBlocks.slice(1).join("\n");
  for (const m of body.matchAll(/\(([\s\S]*?)\)/g)) {
    if (/Rule: PICK/i.test(m[1])) continue; // a PICKn rule's own "(Rule: ...)" header, parsed below
    const leafCount = [...m[1].matchAll(/Course or Test:/g)].length;
    if (leafCount !== 1) {
      warnings.push(`${courseCode}: found a parenthesized group with ${leafCount} leaf terms (expected exactly 1) — the flat and/or grouping assumption may not hold here. Group text: "${m[1].trim()}"`);
    }
  }

  const flat = body.replace(/[()]/g, "");
  const lines = flat
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const leaves: Prereq[] = [];
  const connectors: Array<"and" | "or"> = [];
  let current: { raw: string; concurrentOk?: boolean } | null = null;
  let placement: Placement | undefined;

  const flushCurrent = () => {
    if (!current) return;
    leaves.push(resolveLeaf(current.raw, current.concurrentOk, courseCode, subjectDescToCode, warnings));
    current = null;
  };

  for (const line of lines) {
    const pick = PICK_RULE_RE.exec(line);
    const score = SCORE_RE.exec(line);
    if (pick) {
      flushCurrent();
      const items = [...pick[3].matchAll(PICK_ITEM_RE)].map((m) => resolveLeaf(m[1].trim(), m[2] === undefined, courseCode, subjectDescToCode, warnings));
      if (items.length !== Number(pick[2])) warnings.push(`${courseCode}: PICK${pick[1]} rule says ${pick[2]} courses but ${items.length} were parsed — verify manually: "${line}"`);
      leaves.push({ pick: Number(pick[1]), of: items });
    } else if (score) {
      flushCurrent();
      const code = `PLACE:${courseCode}`;
      const last = leaves.length > connectors.length ? leaves[leaves.length - 1] : undefined;
      if (!(last && "course" in last && last.course === code)) {
        if (last) connectors.push("or"); // same "Course or Test:" group as the previous leaf
        leaves.push({ course: code });
      }
      placement ??= { code, title: `${score[1]} placement: ready for ${displayCode(courseCode)}`, scoreRanges: [] };
      placement.scoreRanges.push(`${score[2]}-${score[3]}`);
    } else if (/^Course or Test:/i.test(line)) {
      flushCurrent();
      current = { raw: line.replace(/^Course or Test:/i, "").trim() };
    } else if (/^and$/i.test(line) || /^or$/i.test(line)) {
      flushCurrent();
      connectors.push(line.toLowerCase() as "and" | "or");
    } else if (/^May be taken concurrently\.?$/i.test(line)) {
      if (current) current.concurrentOk = true;
    } else if (/^May not be taken concurrently\.?$/i.test(line)) {
      if (current) current.concurrentOk = false;
    } else if (/^Minimum Grade of /i.test(line)) {
      // Grade thresholds aren't representable in the Prereq type — ignored.
    } else {
      warnings.push(`${courseCode}: unrecognized prerequisite line, ignored: "${line}"`);
    }
  }
  flushCurrent();

  if (leaves.length === 0) {
    warnings.push(`${courseCode}: prereq HTML had content but no "Course or Test:" leaves were found.`);
    return { tree: undefined, warnings, placement };
  }
  if (connectors.length !== leaves.length - 1) {
    warnings.push(`${courseCode}: connector count (${connectors.length}) didn't match leaves-1 (${leaves.length - 1}) — tree below may be wrong, verify manually.`);
  }

  return { tree: buildTree(leaves, connectors), warnings, placement };
}

function resolveLeaf(
  raw: string,
  concurrentOk: boolean | undefined,
  courseCode: string,
  subjectDescToCode: Map<string, string>,
  warnings: string[],
): Leaf {
  const parts = raw.split(/\s+/).filter(Boolean);
  const number = parts[parts.length - 1] ?? "";
  const description = parts.slice(0, -1).join(" ");

  if (!COURSE_NUMBER_RE.test(number)) {
    warnings.push(`${courseCode}: leaf "${raw}" doesn't look like a course number — likely a test-score requirement, not representable as a Prereq course. Stored as a placeholder.`);
    const placeholder = `TEST:${raw.replace(/\s+/g, "_")}`;
    return concurrentOk === undefined ? { course: placeholder } : { course: placeholder, concurrentOk };
  }

  const code = subjectDescToCode.get(description.toLowerCase());
  if (!code) {
    warnings.push(`${courseCode}: couldn't resolve subject "${description}" to a subject code (leaf "${raw}") — check raw/subjects_*.json.`);
    const placeholder = `UNRESOLVED:${description.replace(/\s+/g, "")}${number}`;
    return concurrentOk === undefined ? { course: placeholder } : { course: placeholder, concurrentOk };
  }

  const courseRef = `${code}${number}`;
  return concurrentOk === undefined ? { course: courseRef } : { course: courseRef, concurrentOk };
}

function buildTree(leaves: Prereq[], connectors: Array<"and" | "or">): Prereq {
  // Split into maximal runs joined only by "or"; "and" (or a missing/mismatched
  // connector, treated as a hard boundary) separates runs.
  const groups: Prereq[][] = [[leaves[0]]];
  for (let i = 0; i < connectors.length && i + 1 < leaves.length; i++) {
    if (connectors[i] === "or") {
      groups[groups.length - 1].push(leaves[i + 1]);
    } else {
      groups.push([leaves[i + 1]]);
    }
  }
  // Any leaves past a mismatched connector count are appended as their own AND group.
  for (let i = connectors.length + 1; i < leaves.length; i++) {
    groups.push([leaves[i]]);
  }

  // Drop repeated alternatives (e.g. a placement leaf listed on both sides of a course).
  const distinct = groups.map((g) => g.filter((node, i) => g.findIndex((other) => JSON.stringify(other) === JSON.stringify(node)) === i));
  const groupNodes = distinct.map((g) => (g.length === 1 ? g[0] : { or: g }));
  return groupNodes.length === 1 ? groupNodes[0] : { and: groupNodes };
}
