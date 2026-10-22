import { describe, expect, it } from "vitest";
import { parsePrereqHtml } from "./prereqParser.ts";

// Subject descriptions as Banner's subject table lowercases them (see subjects.ts).
const SUBJECTS = new Map([
  ["electrical engineering", "EE"],
  ["mathematics", "MATH"],
  ["physics", "PHYS"],
]);

/** Wraps <pre> bodies the way getSectionPrerequisites returns them (raw/ is gitignored, so these are inline copies). */
function html(course: string, ...blocks: string[]): string {
  return [`<pre>Prerequisites:${course}\n</pre>`, ...blocks.map((block) => `<pre>${block}</pre>`)].join("\n");
}

describe("parsePrereqHtml: Rule: PICKn", () => {
  // Verbatim shape of EE030LA's prereqs (term 202640).
  const ee030la = html(
    "EE030LA",
    "(Rule: PICK2: Pick 2 of 5 courses  for a total of 2 conditions )Electrical Engineering 020  May not be taken concurrently. Electrical Engineering 020A  May be taken concurrently. Electrical Engineering 020B  May be taken concurrently. Mathematics 045  May be taken concurrently. Mathematics 046  May be taken concurrently. End of Rule PICK2",
    "and\n Course or Test: Physics 040C \n Minimum Grade of D-\n May be taken concurrently. ",
    "or\n Course or Test: Physics 040HC \n Minimum Grade of D-\n May be taken concurrently. ",
  );

  it("parses the rule as a pick node AND-ed with the rest", () => {
    const { tree, warnings } = parsePrereqHtml(ee030la, "EE030LA", SUBJECTS);
    expect(warnings).toEqual([]);
    expect(tree).toEqual({
      and: [
        {
          pick: 2,
          of: [
            { course: "EE020", concurrentOk: false },
            { course: "EE020A", concurrentOk: true },
            { course: "EE020B", concurrentOk: true },
            { course: "MATH045", concurrentOk: true },
            { course: "MATH046", concurrentOk: true },
          ],
        },
        { or: [{ course: "PHYS040C", concurrentOk: true }, { course: "PHYS040HC", concurrentOk: true }] },
      ],
    });
  });

  it("warns if the stated course count doesn't match what was parsed", () => {
    const broken = ee030la.replace("Pick 2 of 5 courses", "Pick 2 of 6 courses");
    expect(parsePrereqHtml(broken, "EE030LA", SUBJECTS).warnings.join()).toMatch(/says 6 courses but 5 were parsed/);
  });
});

describe("parsePrereqHtml: placement scores", () => {
  it("ORs a score line with the course in the same 'Course or Test:' group (MATH009A)", () => {
    const math009a = html(
      "MATH009A",
      "(\nCourse or Test: Mathematics 005\nMinimum Grade of C-\nMay not be taken concurrently.\n)",
      "or\n(\nCourse or Test: Mathematics 005A\nMinimum Grade of C-\nMay not be taken concurrently.\nMath: Score for Prereq 612 to 613\nMay not be taken concurrently.\n)",
    );
    const { tree, warnings, placement } = parsePrereqHtml(math009a, "MATH009A", SUBJECTS);
    expect(warnings).toEqual([]);
    expect(tree).toEqual({ or: [{ course: "MATH005", concurrentOk: false }, { course: "MATH005A", concurrentOk: false }, { course: "PLACE:MATH009A" }] });
    expect(placement).toEqual({ code: "PLACE:MATH009A", title: "Math placement: ready for MATH 009A", scoreRanges: ["612-613"] });
  });

  it("collapses consecutive score lines into one leaf and dedupes repeats (MATH006A shape)", () => {
    const math006a = html(
      "MATH006A",
      "(\nMath: Score for Prereq 614 to 615\nMay not be taken concurrently.\nMath: Score for Prereq 628 to 629\nMay not be taken concurrently.\n)",
      "or\n(\nCourse or Test: Mathematics 003\nMay not be taken concurrently.\nMath: Score for Prereq 614 to 615\n)",
    );
    const { tree, placement } = parsePrereqHtml(math006a, "MATH006A", SUBJECTS);
    expect(tree).toEqual({ or: [{ course: "PLACE:MATH006A" }, { course: "MATH003", concurrentOk: false }] });
    expect(placement?.scoreRanges).toEqual(["614-615", "628-629", "614-615"]);
  });

  it("a score-only prereq becomes a placement-only requirement, not 'no prereq' (MATH005A)", () => {
    const { tree } = parsePrereqHtml(html("MATH005A", "Math: Score for Prereq 620 to 621\nMay not be taken concurrently.\n)"), "MATH005A", SUBJECTS);
    expect(tree).toEqual({ course: "PLACE:MATH005A" });
  });
});
