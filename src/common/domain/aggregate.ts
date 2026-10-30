import type { TimeEntry } from "./types";

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
