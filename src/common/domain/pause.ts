import { combineLocal, toLocalDate } from "./time";
import type { ActiveTimer, TimeEntry } from "./types";

// A pause of the timer is often work on something else (helping a teammate, a meeting). When it
// is long enough and nothing was logged in it yet, the extension offers to log it on another item.

/** Pauses shorter than this are coffee breaks, not work worth logging. */
export const PAUSE_MIN_MINUTES = 10;

export interface Pause {
  start: string; // ISO
  end: string; // ISO
  minutes: number;
}

const ms = (iso: string) => Date.parse(iso);

function overlapMs(a: { start: string; end: string }, b: { start: string; end: string }): number {
  return Math.max(0, Math.min(ms(a.end), ms(b.end)) - Math.max(ms(a.start), ms(b.start)));
}

/** The timer's most recent pause: still open (paused now) or between its last two segments. */
export function lastPause(timer: ActiveTimer | null, nowIso: string): Pause | null {
  if (!timer) return null;
  const segs = timer.segments;
  let start: string | undefined;
  let end: string | undefined;
  if (timer.status === "paused") {
    start = segs.at(-1)?.end;
    end = nowIso;
  } else if (segs.length >= 2) {
    start = segs.at(-2)?.end;
    end = segs.at(-1)?.start;
  }
  if (!start || !end || ms(end) <= ms(start)) return null;
  // A pause across midnight is not a block of work to log on one day.
  if (toLocalDate(start) !== toLocalDate(end)) return null;
  return { start, end, minutes: Math.round((ms(end) - ms(start)) / 60_000) };
}

/**
 * The pause, when it should be offered for logging: long enough, mostly outside lunch and not
 * already covered (half or more) by the user's entries of that day.
 */
export function pauseToLog(pause: Pause | null, entries: TimeEntry[], lunch?: { start: string; end: string }, minMinutes = PAUSE_MIN_MINUTES): Pause | null {
  if (!pause || pause.minutes < minMinutes) return null;
  const total = ms(pause.end) - ms(pause.start);
  const date = toLocalDate(pause.start);
  if (lunch && overlapMs(pause, { start: combineLocal(date, lunch.start), end: combineLocal(date, lunch.end) }) * 2 >= total) return null;
  const logged = entries
    .filter((e) => !e.deleted)
    .flatMap((e) => (e.segments.length ? e.segments : [{ start: e.start, end: e.end }]))
    .reduce((sum, s) => sum + overlapMs(pause, s), 0);
  return logged * 2 >= total ? null : pause;
}
