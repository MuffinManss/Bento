import { describe, expect, it } from "vitest";
import { hasConflict, meetingsConflict } from "./conflicts";
import type { Meeting } from "./types";

describe("meetingsConflict", () => {
  it("conflicts when the same day's time ranges overlap", () => {
    const a: Meeting = { days: ["M"], start: "09:00", end: "09:50" };
    const b: Meeting = { days: ["M"], start: "09:30", end: "10:20" };
    expect(meetingsConflict(a, b)).toBe(true);
  });

  it("does NOT conflict when meetings are back-to-back (touching endpoints)", () => {
    const a: Meeting = { days: ["M"], start: "09:00", end: "09:50" };
    const b: Meeting = { days: ["M"], start: "09:50", end: "10:40" };
    expect(meetingsConflict(a, b)).toBe(false);
  });

  it("does NOT conflict when the meetings are on different days, even at the same time", () => {
    const a: Meeting = { days: ["M"], start: "09:00", end: "09:50" };
    const b: Meeting = { days: ["T"], start: "09:00", end: "09:50" };
    expect(meetingsConflict(a, b)).toBe(false);
  });

  it("conflicts when only one of several shared days overlaps in time", () => {
    const a: Meeting = { days: ["M", "W", "F"], start: "09:00", end: "09:50" };
    const b: Meeting = { days: ["W"], start: "09:30", end: "10:00" };
    expect(meetingsConflict(a, b)).toBe(true);
  });

  it("does not conflict when one meeting fully precedes the other with no shared day overlap in time", () => {
    const a: Meeting = { days: ["R"], start: "08:00", end: "08:50" };
    const b: Meeting = { days: ["R"], start: "10:00", end: "10:50" };
    expect(meetingsConflict(a, b)).toBe(false);
  });
});

describe("hasConflict", () => {
  it("is true if any pair of meetings across the two lists conflicts", () => {
    const a: Meeting[] = [
      { days: ["M"], start: "09:00", end: "09:50" },
      { days: ["W"], start: "09:00", end: "09:50" },
    ];
    const b: Meeting[] = [{ days: ["W"], start: "09:30", end: "10:20" }];
    expect(hasConflict(a, b)).toBe(true);
  });

  it("is false when no pair overlaps", () => {
    const a: Meeting[] = [{ days: ["M"], start: "09:00", end: "09:50" }];
    const b: Meeting[] = [{ days: ["T"], start: "09:00", end: "09:50" }];
    expect(hasConflict(a, b)).toBe(false);
  });

  it("is false for an empty meetings list (e.g. a fully async/online component)", () => {
    const a: Meeting[] = [];
    const b: Meeting[] = [{ days: ["M"], start: "09:00", end: "09:50" }];
    expect(hasConflict(a, b)).toBe(false);
  });
});
