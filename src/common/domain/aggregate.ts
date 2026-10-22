import type { TimeEntry } from "./types";

export type GroupMode = "user" | "parent" | "activity";

export interface SheetRow {
  key: string;
  level: 0 | 1 | 2;
  label: string;
  workItemId?: number;
  /** Minutes per day (same order as `days`). */
  perDay: number[];
  total: number;
}

export interface Sheet {
  days: string[];
  rows: SheetRow[];
  dayTotals: number[];
  total: number;
}

interface Node {
  label: string;
  workItemId?: number;
  perDay: number[];
  children: Map<string, Node>;
}

function node(label: string, days: number, workItemId?: number): Node {
  return { label, workItemId, perDay: new Array(days).fill(0), children: new Map() };
}

/** Labels of the 3 levels for an entry, depending on the grouping mode. */
function levels(e: TimeEntry, mode: GroupMode): { key: string; label: string; workItemId?: number }[] {
  const task = { key: `wi-${e.workItemId}`, label: `#${e.workItemId} ${e.workItemTitle}`, workItemId: e.workItemId };
  const parent = e.parentId
    ? { key: `p-${e.parentId}`, label: `#${e.parentId} ${e.parentTitle ?? ""}`.trim(), workItemId: e.parentId }
    : { key: "p-none", label: "(sem item pai)" };
  const user = { key: `u-${e.userId}`, label: e.userName };
  const activity = { key: `a-${e.activity}`, label: e.activity || "(sem atividade)" };
  switch (mode) {
    case "user":
      return [user, task, activity];
    case "parent":
      return [parent, task, user];
    case "activity":
      return [activity, user, task];
  }
}

/**
 * Builds a timesheet grid (like the TimeLog "Time Log Summary"): 3 nested levels × days,
 * with row/column totals. Entries outside `days` and deleted entries are ignored.
 */
export function buildSheet(entries: TimeEntry[], days: string[], mode: GroupMode): Sheet {
  const index = new Map(days.map((d, i) => [d, i]));
  const root = node("", days.length);

  for (const e of entries) {
    const di = index.get(e.date);
    if (e.deleted || di === undefined) continue;
    let current = root;
    current.perDay[di] += e.minutes;
    for (const lv of levels(e, mode)) {
      let child = current.children.get(lv.key);
      if (!child) {
        child = node(lv.label, days.length, lv.workItemId);
        current.children.set(lv.key, child);
      }
      child.perDay[di] += e.minutes;
      current = child;
    }
  }

  const rows: SheetRow[] = [];
  const walk = (n: Node, level: 0 | 1 | 2, prefix: string) => {
    const sorted = [...n.children.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, "pt-BR"));
    for (const [key, child] of sorted) {
      const fullKey = `${prefix}/${key}`;
      rows.push({ key: fullKey, level, label: child.label, workItemId: child.workItemId, perDay: child.perDay, total: sum(child.perDay) });
      if (level < 2) walk(child, (level + 1) as 1 | 2, fullKey);
    }
  };
  walk(root, 0, "");

  return { days, rows, dayTotals: root.perDay, total: sum(root.perDay) };
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export interface Breakdown {
  label: string;
  minutes: number;
  color?: string;
}

/** Minutes grouped by a key, sorted descending (used for "por atividade" / "por pessoa"). */
export function breakdown(entries: TimeEntry[], keyOf: (e: TimeEntry) => string): Breakdown[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.deleted) continue;
    const k = keyOf(e);
    map.set(k, (map.get(k) ?? 0) + e.minutes);
  }
  return [...map.entries()].map(([label, minutes]) => ({ label, minutes })).sort((a, b) => b.minutes - a.minutes);
}

/** Last entry day per work item. */
export function lastEntryByWorkItem(entries: TimeEntry[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const e of entries) {
    if (e.deleted) continue;
    const prev = map.get(e.workItemId);
    if (!prev || e.date > prev) map.set(e.workItemId, e.date);
  }
  return map;
}
