import { describe, expect, it } from "vitest";
import { summaryToCsv } from "../src/common/domain/csv";
import { buildSummary, type SummaryItemRow } from "../src/common/domain/summary";
import { addMonths, formatMonth, monthEnd, monthStart } from "../src/common/domain/time";
import type { TimeEntry } from "../src/common/domain/types";

function entry(p: Partial<TimeEntry>): TimeEntry {
  return {
    id: Math.random().toString(36),
    projectId: "p",
    workItemId: 10,
    workItemTitle: "Dev",
    workItemType: "Task",
    parentId: 1,
    parentTitle: "US A",
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

const entries = [
  entry({ date: "2026-10-19", minutes: 60 }),
  entry({ date: "2026-10-20", minutes: 30 }),
  entry({ date: "2026-10-20", minutes: 45, activity: "Revisão" }),
  entry({ date: "2026-10-27", minutes: 120, workItemId: 11, workItemTitle: "Testes" }),
  entry({ date: "2026-10-21", minutes: 90, userId: "u2", userName: "Bruno", parentId: undefined, parentTitle: undefined, workItemId: 20, workItemTitle: "Reunião" }),
  entry({ date: "2026-10-21", minutes: 999, deleted: true }),
  entry({ date: "2026-11-02", minutes: 999 }),
];
const all = ["user", "parent", "task", "activity"] as const;
const items = (rows: ReturnType<typeof buildSummary>["rows"]) => rows.filter((r): r is SummaryItemRow => r.kind === "item");

describe("buildSummary", () => {
  it("one row per combination, merged cells and subtotal per person", () => {
    const s = buildSummary(entries, { from: "2026-10-01", to: "2026-10-31", bucket: "day", dims: [...all], hideEmpty: true });
    expect(s.columns.map((c) => c.from)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-27"]);
    expect(s.groups).toEqual([
      { label: "19–25/10", span: 3 },
      { label: "26–31/10", span: 1 },
    ]);
    expect(s.rows.map((r) => (r.kind === "item" ? r.cells.activity!.label : r.label))).toEqual(["Desenvolvimento/Correção", "Revisão", "Desenvolvimento/Correção", "Total Ana", "Desenvolvimento/Correção"]);
    const [a1, a2, a3] = items(s.rows);
    expect(a1.spans).toEqual({ user: 3, parent: 3, task: 2, activity: 1 });
    expect(a2.spans).toEqual({ user: 0, parent: 0, task: 0, activity: 1 });
    expect(a3.spans).toEqual({ user: 0, parent: 0, task: 1, activity: 1 });
    expect(a1.perCol).toEqual([60, 30, 0, 0]);
    expect(s.rows[3].total).toBe(255);
    expect(items(s.rows)[3].cells.parent!.label).toBe("(sem item pai)");
    expect(s.colTotals).toEqual([60, 75, 90, 120]);
    expect(s.total).toBe(345);
  });

  it("fewer dimensions aggregate the rows; weeks and months as columns", () => {
    const byWeek = buildSummary(entries, { from: "2026-10-01", to: "2026-10-31", bucket: "week", dims: ["parent"], hideEmpty: false });
    expect(byWeek.columns.map((c) => c.label)).toEqual(["01–04/10", "05–11/10", "12–18/10", "19–25/10", "26–31/10"]);
    expect(byWeek.groups).toEqual([]);
    expect(buildSummary([], { from: "2026-09-28", to: "2026-10-04", bucket: "week", dims: ["user"], hideEmpty: false }).columns[0].label).toBe("28/09–04/10");
    expect(byWeek.rows.map((r) => r.kind === "item" && [r.cells.parent!.label, r.total])).toEqual([
      ["#1 US A", 255],
      ["(sem item pai)", 90],
    ]);
    const byMonth = buildSummary(entries, { from: "2026-10-15", to: "2026-11-30", bucket: "month", dims: ["user"], hideEmpty: false });
    expect(byMonth.columns).toEqual([
      { from: "2026-10-15", to: "2026-10-31", label: "out/2026" },
      { from: "2026-11-01", to: "2026-11-30", label: "nov/2026" },
    ]);
    expect(items(byMonth.rows).map((r) => r.perCol)).toEqual([[255, 999], [90, 0]]);
  });

  it("csv repeats the dimension values", () => {
    const s = buildSummary(entries, { from: "2026-10-19", to: "2026-10-20", bucket: "day", dims: ["user", "task"], hideEmpty: false });
    const lines = summaryToCsv(s, ["user", "task"]).replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe("Pessoa;Task;19/10/2026;20/10/2026;Total");
    expect(lines[1]).toBe("Ana;#10 Dev;1;1,25;2,25");
    expect(lines[2]).toBe("Total;;1;1,25;2,25");
  });
});

describe("month helpers", () => {
  it("start, end, add and label", () => {
    expect(monthStart("2026-10-26")).toBe("2026-10-01");
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(formatMonth("2026-10-26")).toBe("out/2026");
  });
});
