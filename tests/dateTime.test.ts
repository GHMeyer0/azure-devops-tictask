import { describe, expect, it } from "vitest";
import { endTimeOptions, parseDateBr, parseTime, timeOf } from "../src/common/ui/dateTime";
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

describe("parseTime", () => {
  it.each([
    ["14:30", "14:30"],
    ["9:05", "09:05"],
    ["1430", "14:30"],
    ["14", "14:00"],
    ["14h30", "14:30"],
  ])("%s → %s", (text, expected) => expect(parseTime(text)).toBe(expected));

  it("rejects invalid times", () => {
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("10:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
});

describe("endTimeOptions", () => {
  it("starts 15 minutes after the start and shows the duration", () => {
    const options = endTimeOptions("11:05");
    expect(options.slice(0, 4)).toEqual([
      { value: "11:20", label: "11:20 (15m)" },
      { value: "11:35", label: "11:35 (30m)" },
      { value: "11:50", label: "11:50 (45m)" },
      { value: "12:05", label: "12:05 (1h)" },
    ]);
  });

  it("stops at the end of the day", () => {
    expect(endTimeOptions("23:30").map((o) => o.value)).toEqual(["23:45"]);
    expect(endTimeOptions("")).toEqual([]);
  });
});

describe("timeOf", () => {
  it("formats 24h", () => {
    expect(timeOf(new Date(2026, 9, 23, 9, 5))).toBe("09:05");
    expect(timeOf(new Date(2026, 9, 23, 17, 30))).toBe("17:30");
  });
});
