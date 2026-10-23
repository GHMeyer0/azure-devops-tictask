import { describe, expect, it } from "vitest";
import { parseDateBr, timeOf } from "../src/common/ui/dateTime";
import { toLocalDate } from "../src/common/domain/time";

describe("parseDateBr", () => {
  const today = new Date(2026, 9, 23);
  it.each([
    ["23/10/2026", "2026-10-23"],
    ["3/1/2026", "2026-01-03"],
    ["23/10", "2026-10-23"],
    ["23-10-26", "2026-10-23"],
  ])("%s → %s", (text, expected) => {
    expect(toLocalDate(parseDateBr(text, today)!)).toBe(expected);
  });

  it("rejects invalid days", () => {
    expect(parseDateBr("31/02/2026", today)).toBeNull();
    expect(parseDateBr("amanhã", today)).toBeNull();
  });
});

describe("timeOf", () => {
  it("formats 24h", () => {
    expect(timeOf(new Date(2026, 9, 23, 9, 5))).toBe("09:05");
    expect(timeOf(new Date(2026, 9, 23, 17, 30))).toBe("17:30");
  });
});
