import { describe, expect, it } from "vitest";
import { applyCreate, applyDelete, applyEdit, consumption, currentRemaining, needsEstimate } from "../src/common/domain/remaining";

const f = (original: number | null, remaining: number | null, completed: number | null) => ({ original, remaining, completed });

describe("applyCreate", () => {
  it("adds to Completed and subtracts from Remaining", () => {
    expect(applyCreate(f(5, 5, 0), 2)).toEqual({ completed: 2, remaining: 3 });
  });

  it("never goes below zero", () => {
    expect(applyCreate(f(1, 0.5, 0.5), 1.5)).toEqual({ completed: 2, remaining: 0 });
  });

  it("uses estimate − completed when Remaining was never filled (Tiino case)", () => {
    // Task with OriginalEstimate=3, Completed=1 and no Remaining.
    expect(applyCreate(f(3, null, 1), 1)).toEqual({ completed: 2, remaining: 1 });
  });

  it("requires and applies an estimate for tasks without one", () => {
    expect(needsEstimate(f(null, null, null))).toBe(true);
    expect(applyCreate(f(null, null, null), 1.5, 4)).toEqual({ completed: 1.5, original: 4, remaining: 2.5 });
  });

  it("rounds to 2 decimals", () => {
    expect(applyCreate(f(1, 1, 0), 1 / 3)).toEqual({ completed: 0.33, remaining: 0.67 });
  });
});

describe("applyEdit", () => {
  it("applies only the difference", () => {
    expect(applyEdit(f(5, 3, 2), 2, 3)).toEqual({ completed: 3, remaining: 2 });
    expect(applyEdit(f(5, 3, 2), 2, 1)).toEqual({ completed: 1, remaining: 4 });
  });
});

describe("applyDelete", () => {
  it("restores Remaining when asked", () => {
    expect(applyDelete(f(5, 3, 2), 2, true)).toEqual({ completed: 0, remaining: 5 });
  });
  it("keeps Remaining otherwise", () => {
    expect(applyDelete(f(5, 3, 2), 2, false)).toEqual({ completed: 0, remaining: 3 });
  });
});

describe("helpers", () => {
  it("currentRemaining", () => {
    expect(currentRemaining(f(null, null, 2))).toBe(0);
    expect(currentRemaining(f(4, null, 5))).toBe(0);
  });
  it("consumption", () => {
    expect(consumption(f(4, 1, 3))).toBe(75);
    expect(consumption(f(null, 1, 3))).toBe(75);
    expect(consumption(f(null, null, 3))).toBeNull();
  });
});
