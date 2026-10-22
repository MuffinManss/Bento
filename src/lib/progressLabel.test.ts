import { describe, expect, it } from "vitest";
import { progressLabel } from "./progressLabel";

describe("progressLabel", () => {
  it("formats each rule type", () => {
    expect(progressLabel({ met: false, unit: "courses", done: 2, needed: 6 })).toBe("2/6 courses");
    expect(progressLabel({ met: true, unit: "count", done: 1, needed: 1 })).toBe("1/1");
    expect(progressLabel({ met: false, unit: "units", done: 8, needed: 32 })).toBe("8/32 units");
    expect(progressLabel({ met: false, unit: "track", done: 0, needed: 3 })).toBe("Choose a track · 0/3");
    expect(progressLabel({ met: false, unit: "track", done: 2, needed: 3, track: ["MATH009A", "MATH009B", "MATH009C"] })).toBe("MATH 009 track · 2/3");
  });
});
