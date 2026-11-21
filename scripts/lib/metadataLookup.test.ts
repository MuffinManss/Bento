import { describe, expect, it } from "vitest";
import { fallbackTerms } from "./metadataLookup.ts";
import type { Term } from "./terms.ts";

// Banner's list, newest first, as getTerms returns it.
const terms: Term[] = [
  { code: "202710", description: "Winter 2027" },
  { code: "202640", description: "Fall 2026 (View Only)" },
  { code: "202630", description: "Summer 2026 (View Only)" },
  { code: "202620", description: "Spring 2026 (View Only)" },
  { code: "202610", description: "Winter 2026 (View Only)" },
  { code: "202540", description: "Fall 2025 (View Only)" },
];

describe("fallbackTerms", () => {
  it("takes the three most recent older terms, newest first", () => {
    expect(fallbackTerms("202710", terms)).toEqual(["202640", "202620", "202610"]);
  });

  it("skips summer terms", () => {
    expect(fallbackTerms("202710", terms)).not.toContain("202630");
  });

  it("never includes the primary term or a newer one", () => {
    expect(fallbackTerms("202620", terms)).toEqual(["202610", "202540"]);
  });

  it("returns nothing when no older term is published", () => {
    expect(fallbackTerms("202540", terms)).toEqual([]);
  });
});
