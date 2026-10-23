import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";
import { businessDaysBetween, combineLocal, firstOpenDate } from "../src/common/domain/time";
import { closedSegments, isForgotten } from "../src/common/domain/timer";
import type { ActiveTimer } from "../src/common/domain/types";

const at = (date: string, time: string) => new Date(combineLocal(date, time));
const timer = (start: string, status: ActiveTimer["status"] = "running", end?: string): ActiveTimer => ({
  id: "active",
  projectId: "p",
  workItem: { id: 1, title: "T", type: "Task" },
  activity: "Desenvolvimento",
  comment: "",
  status,
  segments: [{ start, ...(end ? { end } : {}) }],
});

describe("forgotten timer", () => {
  it("is a running timer started on a previous day", () => {
    expect(isForgotten(timer(combineLocal("2026-10-22", "17:30")), DEFAULT_SETTINGS, at("2026-10-23", "08:10"))).toBe(true);
  });

  it("is a running timer past the hour limit", () => {
    const t = timer(combineLocal("2026-10-23", "07:00"));
    expect(isForgotten(t, DEFAULT_SETTINGS, at("2026-10-23", "16:59"))).toBe(false);
    expect(isForgotten(t, DEFAULT_SETTINGS, at("2026-10-23", "17:01"))).toBe(true);
  });

  it("never applies to a timer paused by an older version", () => {
    const t = timer(combineLocal("2026-10-20", "09:00"), "paused", combineLocal("2026-10-20", "10:00"));
    expect(isForgotten(t, DEFAULT_SETTINGS, at("2026-10-23", "08:00"))).toBe(false);
  });
});

describe("closedSegments", () => {
  it("ends the open segment and keeps the closed ones", () => {
    const t = { ...timer(""), segments: [{ start: "a", end: "b" }, { start: "c" }] };
    expect(closedSegments(t, "z")).toEqual([
      { start: "a", end: "b" },
      { start: "c", end: "z" },
    ]);
  });
});

describe("businessDaysBetween", () => {
  it("counts weekdays after the first date", () => {
    expect(businessDaysBetween("2026-10-23", "2026-10-23")).toBe(0); // same day
    expect(businessDaysBetween("2026-10-23", "2026-10-26")).toBe(1); // Friday → Monday
    expect(businessDaysBetween("2026-10-19", "2026-10-26")).toBe(5); // a week
  });
});

describe("firstOpenDate", () => {
  it("is the oldest day an entry can still be created or edited", () => {
    expect(firstOpenDate(7, "2026-10-23")).toBe("2026-10-16");
    expect(firstOpenDate(0, "2026-10-23")).toBe("2026-10-23");
  });
});
