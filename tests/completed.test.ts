import { describe, expect, it } from "vitest";
import { completedMismatch, completedOf, withEntry } from "../src/common/domain/remaining";
import { isPermanent, withRetry } from "../src/common/retry";

const e = (id: string, minutes: number, deleted?: boolean) => ({ id, minutes, deleted });

describe("Completed from the entries", () => {
  it("is the sum of the entries, deleted ones left out", () => {
    expect(completedOf([e("a", 5), e("b", 175), e("c", 60, true)])).toBe(3);
  });

  it("is null without entries, so a task never logged here keeps its own Completed", () => {
    expect(completedOf([])).toBeNull();
    expect(completedOf([e("a", 60, true)])).toBeNull();
  });

  it("flags a Completed typed in the form (#11246: 3h for 5 min of entries)", () => {
    expect(completedMismatch(3, [e("a", 5)])).toBe(0.08);
    expect(completedMismatch(0.08, [e("a", 5)])).toBeNull();
    expect(completedMismatch(undefined, [e("a", 60)])).toBe(1); // field lost on the host bridge
    expect(completedMismatch(4, [])).toBeNull(); // no entries: nothing to compare with
  });

  it("ignores rounding left by the old per-entry sums (less than a minute)", () => {
    expect(completedMismatch(1.04, [e("a", 62)])).toBeNull(); // #11249: 1.04 for 1.03
    expect(completedMismatch(4.66, [e("a", 279)])).toBeNull(); // #11250: 4.66 for 4.65
    expect(completedMismatch(4.67, [e("a", 279)])).toBe(4.65); // 1.2 min off
  });

  it("withEntry adds, replaces and keeps deletions", () => {
    const list = [e("a", 5), e("b", 10)];
    expect(completedOf(withEntry(list, e("c", 45)))).toBe(1);
    expect(completedOf(withEntry(list, e("b", 55)))).toBe(1);
    expect(completedOf(withEntry(list, e("b", 10, true)))).toBe(0.08);
  });
});

describe("withRetry", () => {
  it("tries a passing failure again", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls < 3) throw Object.assign(new Error("Service Unavailable"), { status: 503 });
      return "ok";
    }, [0, 0]);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("fails at once on an answer that will not change", async () => {
    let calls = 0;
    const rule = new Error("TF401320: Rule Error for field Original Estimate");
    await expect(withRetry(async () => (calls++, Promise.reject(rule)), [0, 0])).rejects.toBe(rule);
    expect(calls).toBe(1);
    expect(isPermanent({ status: 403 })).toBe(true);
    expect(isPermanent(new Error("O work item tem campos inválidos (Activity)."))).toBe(true);
    expect(isPermanent(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("gives up after the last attempt", async () => {
    let calls = 0;
    await expect(withRetry(async () => (calls++, Promise.reject(new Error("timeout"))), [0, 0])).rejects.toThrow("timeout");
    expect(calls).toBe(3);
  });
});
