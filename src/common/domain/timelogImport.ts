import { combineLocal } from "./time";
import type { TimeEntry } from "./types";

// Import from the "Time Log" extension (TimeLog.time-logging-extension), through the CSV of its admin
// page (Project settings › Time Log Admin › "Download all logs as CSV"). Columns:
//   id, minutes, user, userId, workItemId, date, dateWeek, type, comment
// Time Log keeps only the day and the duration: entries of the same person and day are laid one after
// the other from 08:00, so the day total is right and the times are approximate.

export interface TimeLogRow {
  id: string;
  minutes: number;
  user: string;
  userId: string;
  workItemId: number;
  date: string; // yyyy-MM-dd
  type: string;
  comment: string;
}

const REQUIRED = ["id", "minutes", "user", "userId", "workItemId", "date", "type", "comment"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** First time of the day for imported entries, which carry no time. */
export const TIMELOG_DAY_START = "08:00";

/** RFC 4180 CSV: quoted fields with "" escapes, commas and line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function parseTimeLogCsv(text: string): { ok: true; rows: TimeLogRow[] } | { ok: false; error: string } {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { ok: false, error: "O arquivo está vazio." };
  const col = new Map(header.map((h, i) => [h.trim(), i]));
  const missing = REQUIRED.filter((c) => !col.has(c));
  if (missing.length) return { ok: false, error: `Este arquivo não é o CSV do Time Log (faltam as colunas ${missing.join(", ")}).` };
  const get = (r: string[], c: (typeof REQUIRED)[number]) => (r[col.get(c)!] ?? "").trim();
  const rows: TimeLogRow[] = [];
  for (const [i, r] of lines.entries()) {
    const line = i + 2;
    const minutes = Number(get(r, "minutes"));
    const workItemId = Number(get(r, "workItemId"));
    const date = get(r, "date");
    if (!get(r, "id")) return { ok: false, error: `Linha ${line}: sem id.` };
    if (!Number.isInteger(minutes) || minutes <= 0) return { ok: false, error: `Linha ${line}: minutos inválidos (${get(r, "minutes")}).` };
    if (!Number.isInteger(workItemId) || workItemId <= 0) return { ok: false, error: `Linha ${line}: work item inválido (${get(r, "workItemId")}).` };
    if (!DATE.test(date)) return { ok: false, error: `Linha ${line}: data inválida (${date}).` };
    rows.push({ id: get(r, "id"), minutes, user: get(r, "user"), userId: get(r, "userId"), workItemId, date, type: get(r, "type"), comment: get(r, "comment") });
  }
  return { ok: true, rows };
}

export interface TimeLogSummary {
  rows: number;
  minutes: number;
  from?: string;
  to?: string;
  workItems: number;
  people: { name: string; userId: string; rows: number; minutes: number }[];
  types: string[];
  /** Entries longer than a day (Time Log allows them; they end on a later day here). */
  overADay: number;
}

export function summarizeTimeLog(rows: TimeLogRow[]): TimeLogSummary {
  const people = new Map<string, TimeLogSummary["people"][number]>();
  for (const r of rows) {
    const p = people.get(r.userId) ?? { name: r.user, userId: r.userId, rows: 0, minutes: 0 };
    p.rows++;
    p.minutes += r.minutes;
    people.set(r.userId, p);
  }
  const dates = rows.map((r) => r.date).sort();
  return {
    rows: rows.length,
    minutes: rows.reduce((s, r) => s + r.minutes, 0),
    from: dates[0],
    to: dates.at(-1),
    workItems: new Set(rows.map((r) => r.workItemId)).size,
    people: [...people.values()].sort((a, b) => b.minutes - a.minutes),
    types: [...new Set(rows.map((r) => r.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    overADay: rows.filter((r) => r.minutes > 24 * 60).length,
  };
}

/** Same row → same entry id, so importing the file again overwrites instead of duplicating. */
export const timeLogEntryId = (row: TimeLogRow) => `timelog-${row.id}`;

export interface TimeLogContext {
  projectId: string;
  by: { id: string; displayName: string };
  at: string;
  /** Activities of the settings: Time Log types are matched to them ignoring case. */
  activities: string[];
  workItems: Map<number, { title: string; type: string; parentId?: number; parentTitle?: string }>;
  /** E-mail of each user id (people of the project's teams); missing ones stay empty. */
  emails: Map<string, string>;
}

export function timeLogToEntries(rows: TimeLogRow[], ctx: TimeLogContext): TimeEntry[] {
  const activity = (type: string) => ctx.activities.find((a) => a.toLowerCase() === type.toLowerCase()) ?? (type || "Outros");
  const nextStart = new Map<string, number>();
  return rows.map((r) => {
    const key = `${r.userId}|${r.date}`;
    const start = nextStart.get(key) ?? Date.parse(combineLocal(r.date, TIMELOG_DAY_START));
    const end = start + r.minutes * 60_000;
    nextStart.set(key, end);
    const wi = ctx.workItems.get(r.workItemId);
    const segment = { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    return {
      id: timeLogEntryId(r),
      projectId: ctx.projectId,
      workItemId: r.workItemId,
      workItemTitle: wi?.title ?? `Work item #${r.workItemId}`,
      workItemType: wi?.type ?? "",
      ...(wi?.parentId ? { parentId: wi.parentId, parentTitle: wi.parentTitle } : {}),
      userId: r.userId,
      userName: r.user,
      userEmail: ctx.emails.get(r.userId) ?? "",
      date: r.date,
      start: segment.start,
      end: segment.end,
      minutes: r.minutes,
      segments: [segment],
      activity: activity(r.type),
      comment: r.comment,
      source: "manual",
      createdAt: ctx.at,
      createdBy: ctx.by.id,
      history: [{ at: ctx.at, by: ctx.by.displayName, action: "import", detail: `importado do Time Log (horário aproximado, a partir das ${TIMELOG_DAY_START})` }],
    };
  });
}
