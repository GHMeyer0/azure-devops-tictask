import { describe, expect, it } from "vitest";
import { addDays, dayRange, formatMinutes, monthKeys, parseDuration, segmentsMinutes, weekStart, minutesBetweenTimes } from "../src/common/domain/time";

describe("parseDuration", () => {
  it.each([
    ["1h30", 90],
    ["1h 30m", 90],
    ["2h", 120],
    ["45m", 45],
    ["45min", 45],
    ["1:30", 90],
    ["1,5", 90],
    ["1.5", 90],
    ["1.5h", 90],
    ["8", 480],
    ["90", 90],
    ["0,25", 15],
  ])("%s -> %i min", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "abc", "1h30x", "h"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe("formatMinutes", () => {
  it.each([
    [90, "1h30"],
    [120, "2h"],
    [45, "45m"],
    [0, "0h"],
    [5, "5m"],
    [65, "1h05"],
    [-30, "-30m"],
  ])("%i -> %s", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});

describe("dates", () => {
  it("weekStart returns monday", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19"); // Wednesday -> Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday -> Monday
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("addDays crosses months", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("dayRange is inclusive", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("monthKeys spans years", () => {
    expect(monthKeys("2026-11-15", "2027-02-01")).toEqual(["202611", "202612", "202701", "202702"]);
  });

  it("minutesBetweenTimes", () => {
    expect(minutesBetweenTimes("09:00", "10:30")).toBe(90);
  });
});

describe("segmentsMinutes", () => {
  it("sums closed segments and an open one until now", () => {
    const now = new Date("2026-10-21T15:00:00Z");
    const minutes = segmentsMinutes(
      [
        { start: "2026-10-21T09:00:00Z", end: "2026-10-21T12:00:00Z" },
        { start: "2026-10-21T13:00:00Z", end: "2026-10-21T14:30:00Z" },
        { start: "2026-10-21T14:45:00Z" },
      ],
      now,
    );
    expect(minutes).toBe(180 + 90 + 15);
  });
});
