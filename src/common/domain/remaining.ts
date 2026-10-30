import { minutesToHours, round2 } from "./time";
import type { TimeEntry, WorkItemSnapshot } from "./types";

// Empty fields are null, but a task sent to a dialog crosses the host bridge, which turns null into
// undefined: the checks below use `== null` to cover both.
export type HoursFields = Pick<WorkItemSnapshot, "original" | "remaining" | "completed">;

export interface HoursUpdate {
  completed: number;
  remaining: number;
  /** Only set when the entry also defines the original estimate. */
  original?: number;
}

/** A task with no estimate at all must get one before the first entry. */
export function needsEstimate(fields: HoursFields): boolean {
  return fields.original == null && fields.remaining == null;
}

/** Remaining before the entry: the field itself, or estimate − completed when Remaining was never filled. */
export function currentRemaining(fields: HoursFields): number {
  if (fields.remaining != null) return fields.remaining;
  if (fields.original != null) return Math.max(0, round2(fields.original - (fields.completed ?? 0)));
  return 0;
}

/**
 * New entry of `hours`: Completed grows, Remaining shrinks (never below 0).
 * `estimate` is required when the task has no estimate yet; it becomes Original Estimate.
 */
export function applyCreate(fields: HoursFields, hours: number, estimate?: number): HoursUpdate {
  const completed = round2((fields.completed ?? 0) + hours);
  if (needsEstimate(fields) && estimate !== undefined) {
    return { completed, original: round2(estimate), remaining: Math.max(0, round2(estimate - hours)) };
  }
  return { completed, remaining: Math.max(0, round2(currentRemaining(fields) - hours)) };
}

/** Entry changed from `oldHours` to `newHours`: the difference is applied to both fields. */
export function applyEdit(fields: HoursFields, oldHours: number, newHours: number): HoursUpdate {
  const delta = round2(newHours - oldHours);
  return {
    completed: Math.max(0, round2((fields.completed ?? 0) + delta)),
    remaining: Math.max(0, round2(currentRemaining(fields) - delta)),
  };
}

/** Entry removed: Completed shrinks; optionally the hours go back to Remaining. */
export function applyDelete(fields: HoursFields, hours: number, restoreRemaining: boolean): HoursUpdate {
  const remaining = currentRemaining(fields);
  return {
    completed: Math.max(0, round2((fields.completed ?? 0) - hours)),
    remaining: restoreRemaining ? round2(remaining + hours) : remaining,
  };
}

/**
 * Completed of a task from its entries (hours, deleted entries left out). Once a task has entries,
 * Completed is always their sum, also for hours typed in the form or logged before the extension;
 * null when it has none, so a task never logged here keeps its own Completed.
 */
export function completedOf(entries: Pick<TimeEntry, "minutes" | "deleted">[]): number | null {
  const live = entries.filter((e) => !e.deleted);
  return live.length ? minutesToHours(live.reduce((s, e) => s + e.minutes, 0)) : null;
}

/** The entries of a task with `entry` in its current version (added, replaced or deleted). */
export function withEntry<T extends Pick<TimeEntry, "id">>(entries: T[], entry: T): T[] {
  return [...entries.filter((e) => e.id !== entry.id), entry];
}

/**
 * The sum of the task's entries when Completed differs from it by a minute or more (only when the
 * task has entries). Less than that is rounding: up to 0.9 each entry added its hours rounded to
 * 2 decimals, so a Completed of 1.04 for 62 minutes (1.03) is not a difference.
 */
export function completedMismatch(completed: number | null | undefined, entries: Pick<TimeEntry, "minutes" | "deleted">[]): number | null {
  const sum = completedOf(entries);
  return sum !== null && Math.abs(sum - (completed ?? 0)) * 60 >= 1 ? sum : null;
}

/** Percentage of the estimate already consumed (null when there is no estimate). */
export function consumption(fields: HoursFields): number | null {
  const estimate = fields.original ?? (fields.remaining != null ? (fields.completed ?? 0) + fields.remaining : null);
  if (!estimate) return null;
  return Math.round(((fields.completed ?? 0) / estimate) * 100);
}
