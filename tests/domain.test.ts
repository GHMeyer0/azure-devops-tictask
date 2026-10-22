import { describe, expect, it } from "vitest";
import { breakdown, buildSheet } from "../src/common/domain/aggregate";
import { entriesToCsv } from "../src/common/domain/csv";
import { buildTaskTitle, DEFAULT_SETTINGS, guessActivity, mergeSettings } from "../src/common/domain/settings";
import { decideParentStart, decideStart, findInconsistencies } from "../src/common/domain/state";
import type { TimeEntry } from "../src/common/domain/types";

const S = DEFAULT_SETTINGS.states;

function entry(p: Partial<TimeEntry>): TimeEntry {
  return {
    id: Math.random().toString(36),
    projectId: "p",
    workItemId: 1,
    workItemTitle: "Task",
    workItemType: "Task",
    userId: "u1",
    userName: "Ana",
    userEmail: "ana@x.com",
    date: "2026-10-19",
    start: "2026-10-19T12:00:00.000Z",
    end: "2026-10-19T13:00:00.000Z",
    minutes: 60,
    segments: [],
    activity: "Desenvolvimento/Correção",
    comment: "",
    source: "manual",
    createdAt: "2026-10-19T13:00:00.000Z",
    createdBy: "u1",
    history: [],
    ...p,
  };
}

describe("state decisions", () => {
  it("activates New/Stopped/Waiting tasks", () => {
    expect(decideStart("New", S)).toEqual({ kind: "activate", to: "Active" });
    expect(decideStart("Waiting", S)).toEqual({ kind: "activate", to: "Active" });
    expect(decideStart("Active", S)).toEqual({ kind: "none" });
  });

  it("asks to reopen closed tasks, or blocks by policy", () => {
    expect(decideStart("Closed", S)).toEqual({ kind: "reopen", to: "Active" });
    expect(decideStart("Closed", { ...S, closedPolicy: "block" })).toEqual({ kind: "blocked" });
  });

  it("moves the parent from Ready for Development to Active", () => {
    expect(decideParentStart("Ready for Development", S)).toBe("Active");
    expect(decideParentStart("Resolved", S)).toBeNull();
  });

  it("flags inconsistencies", () => {
    const tasks = [
      { id: 1, title: "a", type: "Task", state: "Closed", remaining: 2, original: 2, completed: 0 },
      { id: 2, title: "b", type: "Task", state: "Active", remaining: 2, original: 2, completed: 0 },
      { id: 3, title: "c", type: "Task", state: "Active", remaining: 2, original: 2, completed: 0 },
    ];
    const last = new Map([[3, "2026-10-10"]]);
    const found = findInconsistencies(tasks, last, S, "2026-10-21").map((i) => i.taskId);
    expect(found).toEqual([1, 2, 3]);
  });
});

describe("settings helpers", () => {
  it("guesses the activity from Tiino task titles", () => {
    expect(guessActivity(DEFAULT_SETTINGS, "Revisão de PR")).toBe("Revisão");
    expect(guessActivity(DEFAULT_SETTINGS, "Testes e Ajustes se necessário")).toBe("Testes");
    expect(guessActivity(DEFAULT_SETTINGS, "investigação")).toBe("Investigação");
    expect(guessActivity(DEFAULT_SETTINGS, "Desenvolvimento do projeto")).toBe("Desenvolvimento/Correção");
    expect(guessActivity(DEFAULT_SETTINGS, "Algo", "Testing")).toBe("Testes");
  });

  it("builds task titles", () => {
    expect(buildTaskTitle(DEFAULT_SETTINGS, "Revisão", "")).toBe("Revisão de PR");
    expect(buildTaskTitle({ ...DEFAULT_SETTINGS, titleWithActivityPrefix: true }, "Testes", "cobrir regra")).toBe("Testes: cobrir regra");
  });

  it("merges partial stored settings", () => {
    const s = mergeSettings({ lockDays: 3, states: { active: "Doing" } as never });
    expect(s.lockDays).toBe(3);
    expect(s.states.active).toBe("Doing");
    expect(s.states.closed).toBe("Closed");
    expect(s.activities.length).toBeGreaterThan(0);
  });

  it("drops the old daily target from stored settings", () => {
    const s = mergeSettings({ lockDays: 3, dailyTargetHours: 8 } as never);
    expect(s.lockDays).toBe(3);
    expect("dailyTargetHours" in s).toBe(false);
    expect("dailyTargetHours" in DEFAULT_SETTINGS).toBe(false);
  });
});

describe("buildSheet", () => {
  const days = ["2026-10-19", "2026-10-20"];
  const entries = [
    entry({ date: "2026-10-19", minutes: 60 }),
    entry({ date: "2026-10-20", minutes: 30 }),
    entry({ date: "2026-10-20", minutes: 15, activity: "Revisão" }),
    entry({ date: "2026-10-20", minutes: 45, userId: "u2", userName: "Bruno", workItemId: 2, workItemTitle: "Outra" }),
    entry({ date: "2026-10-21", minutes: 999 }), // out of range
    entry({ date: "2026-10-19", minutes: 999, deleted: true }),
  ];

  it("totals per day and overall", () => {
    const sheet = buildSheet(entries, days, "user");
    expect(sheet.dayTotals).toEqual([60, 90]);
    expect(sheet.total).toBe(150);
  });

  it("nests user > task > activity", () => {
    const sheet = buildSheet(entries, days, "user");
    expect(sheet.rows.map((r) => [r.level, r.label, r.total])).toEqual([
      [0, "Ana", 105],
      [1, "#1 Task", 105],
      [2, "Desenvolvimento/Correção", 90],
      [2, "Revisão", 15],
      [0, "Bruno", 45],
      [1, "#2 Outra", 45],
      [2, "Desenvolvimento/Correção", 45],
    ]);
  });

  it("breakdown by activity", () => {
    expect(breakdown(entries.slice(0, 4), (e) => e.activity)).toEqual([
      { label: "Desenvolvimento/Correção", minutes: 135 },
      { label: "Revisão", minutes: 15 },
    ]);
  });
});

describe("csv", () => {
  it("uses ; and decimal comma, escapes text, skips deleted", () => {
    const csv = entriesToCsv([entry({ minutes: 90, comment: 'Ajuste; "PR"' }), entry({ deleted: true })]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(";1,5;");
    expect(lines[1]).toContain('"Ajuste; ""PR"""');
  });
});
