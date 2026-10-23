import type { TimerSegment } from "./types";

const MS_MINUTE = 60_000;

/**
 * Parses a duration typed by the user into minutes.
 * Accepts "1h30", "1h 30m", "2h", "45m", "45min", "1:30", "1,5", "1.5" (hours) and "90" (minutes when > 24).
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  let m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);

  m = /^(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)(?:m|min)?)?$/.exec(s);
  if (m && (m[1] !== undefined || m[2] !== undefined) && /h|m/.test(s)) {
    const hours = m[1] ? Number(m[1].replace(",", ".")) : 0;
    const minutes = m[2] ? Number(m[2]) : 0;
    return Math.round(hours * 60 + minutes);
  }

  m = /^(\d+(?:[.,]\d+)?)$/.exec(s);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    // Plain numbers are hours ("1,5"), except large integers which are clearly minutes ("90").
    return n > 24 && Number.isInteger(n) ? n : Math.round(n * 60);
  }
  return null;
}

/** 90 -> "1h30", 120 -> "2h", 45 -> "45m", 0 -> "0h". */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.round(Math.abs(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0 && m > 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h${String(m).padStart(2, "0")}`;
}

/** Hours (decimal, as stored in work item fields) formatted like formatMinutes. */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  return formatMinutes(Math.round(hours * 60));
}

/** Live clock "01:02:03". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function minutesToHours(minutes: number): number {
  return round2(minutes / 60);
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar day "yyyy-MM-dd" for a Date or ISO string. */
export function toLocalDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local time "HH:mm" for an ISO string. */
export function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Combines a local day "yyyy-MM-dd" and "HH:mm" into an ISO timestamp. */
export function combineLocal(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const d = parseLocalDate(date);
  const offset = (d.getDay() + 6) % 7;
  return addDays(date, -offset);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000);
}

/** Inclusive list of days from..to. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "yyyyMM" keys of every month touched by from..to (inclusive). */
export function monthKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    keys.push(`${y}${pad2(m)}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

export function monthKey(date: string): string {
  return date.slice(0, 7).replace("-", "");
}

/** Worked minutes of timer segments; an open segment counts until `now`. */
export function segmentsMinutes(segments: TimerSegment[], now: Date = new Date()): number {
  return Math.round(segmentsMs(segments, now) / MS_MINUTE);
}

export function segmentsMs(segments: TimerSegment[], now: Date = new Date()): number {
  return segments.reduce((sum, s) => {
    const end = s.end ? new Date(s.end).getTime() : now.getTime();
    return sum + Math.max(0, end - new Date(s.start).getTime());
  }, 0);
}

/** Minutes between two "HH:mm" values on the same day. */
export function minutesBetweenTimes(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  return th * 60 + tm - (fh * 60 + fm);
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "Seg 20/10" */
export function formatDayShort(date: string): string {
  const d = parseLocalDate(date);
  return `${WEEKDAYS[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** "20/10/2026" */
export function formatDateBr(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function isWeekend(date: string): boolean {
  const day = parseLocalDate(date).getDay();
  return day === 0 || day === 6;
}

/** Business days (Mon–Fri) from `from` to `to`, not counting `from` itself: Friday → Monday is 1. */
export function businessDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (!isWeekend(d)) count++;
  return count;
}

/**
 * First day still open for entries: older ones can no longer be edited or deleted (Settings.lockDays),
 * so they cannot be created or moved there either.
 */
export function firstOpenDate(lockDays: number, today: string): string {
  return addDays(today, -lockDays);
}
