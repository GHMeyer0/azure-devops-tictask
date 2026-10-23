import { describe, expect, it } from "vitest";
import { lastPause, pauseToLog } from "../src/common/domain/pause";
import { combineLocal } from "../src/common/domain/time";
import type { ActiveTimer, TimeEntry } from "../src/common/domain/types";

const at = (time: string) => combineLocal("2026-10-23", time);

function timer(status: ActiveTimer["status"], segments: [string, string?][]): ActiveTimer {
  return {
    id: "active",
    projectId: "p",
    workItem: { id: 1, title: "Task", type: "Task" },
    activity: "Desenvolvimento",
    comment: "",
    status,
    segments: segments.map(([s, e]) => ({ start: at(s), end: e ? at(e) : undefined })),
  };
}

function entry(start: string, end: string, deleted = false): TimeEntry {
  return {
    id: start,
    projectId: "p",
    workItemId: 2,
    workItemTitle: "Apoio",
    workItemType: "Task",
    userId: "u",
    userName: "Eu",
    userEmail: "eu@x",
    date: "2026-10-23",
    start: at(start),
    end: at(end),
    minutes: 0,
    segments: [],
    activity: "Revisão",
    comment: "",
    source: "manual",
    createdAt: at(start),
    createdBy: "u",
    history: [],
    deleted,
  };
}

const lunch = { start: "12:00", end: "14:00" };

describe("lastPause", () => {
  it("is open while the timer is paused", () => {
    expect(lastPause(timer("paused", [["09:00", "10:00"]]), at("10:45"))).toEqual({ start: at("10:00"), end: at("10:45"), minutes: 45 });
  });

  it("is the gap between the last two segments once resumed", () => {
    expect(lastPause(timer("running", [["09:00", "10:00"], ["10:30"]]), at("11:00"))).toEqual({ start: at("10:00"), end: at("10:30"), minutes: 30 });
  });

  it("does not exist for a timer that never paused", () => {
    expect(lastPause(timer("running", [["09:00"]]), at("11:00"))).toBeNull();
    expect(lastPause(null, at("11:00"))).toBeNull();
  });
});

describe("pauseToLog", () => {
  const pause = { start: at("15:00"), end: at("15:45"), minutes: 45 };

  it("offers a long pause with nothing logged in it", () => {
    expect(pauseToLog(pause, [], lunch)).toEqual(pause);
  });

  it("skips short pauses", () => {
    expect(pauseToLog({ start: at("15:00"), end: at("15:05"), minutes: 5 }, [], lunch)).toBeNull();
  });

  it("skips the lunch break", () => {
    expect(pauseToLog({ start: at("12:10"), end: at("13:20"), minutes: 70 }, [], lunch)).toBeNull();
  });

  it("skips a pause already logged elsewhere, ignoring deleted entries", () => {
    expect(pauseToLog(pause, [entry("15:00", "15:40")], lunch)).toBeNull();
    expect(pauseToLog(pause, [entry("15:00", "15:40", true)], lunch)).toEqual(pause);
    expect(pauseToLog(pause, [entry("15:30", "15:45")], lunch)).toEqual(pause);
  });
});
