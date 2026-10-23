import { segmentsMs, toLocalDate } from "./time";
import type { ActiveTimer, Settings, TimeSegment } from "./types";

/** Shorter than this, a timer was started by mistake: pausing it logs nothing. */
export const MIN_LOG_MS = 60_000;

/** The timer's segments with the open one ended at `at`. */
export function closedSegments(timer: ActiveTimer, at: string): TimeSegment[] {
  return timer.segments.map((s) => ({ start: s.start, end: s.end ?? at }));
}

/** A running timer that was probably forgotten: started on a previous day or running past the limit. */
export function isForgotten(timer: ActiveTimer, settings: Settings, at: Date = new Date()): boolean {
  const open = timer.segments.at(-1);
  if (timer.status !== "running" || !open || open.end) return false;
  return toLocalDate(open.start) !== toLocalDate(at) || segmentsMs(timer.segments, at) > settings.states.runningAlertHours * 3_600_000;
}
