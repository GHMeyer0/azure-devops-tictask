import type { Settings, TimeEntry, UserInfo } from "./types";

// File used to move data between extensions (e.g. from an internal publisher to a personal one):
// Extension Data is scoped per extension, so a new publisher.extension starts empty.

export const EXPORT_FORMAT = "time-tracker-export";
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  exportedBy: UserInfo;
  source: { extension: string; projectId: string; projectName: string };
  settings: Settings;
  /** Every entry of the project, including soft-deleted ones (audit trail). */
  entries: TimeEntry[];
}

export interface ExportSummary {
  entries: number;
  deleted: number;
  users: number;
  workItems: number;
  minutes: number;
  from?: string;
  to?: string;
}

export function buildExport(entries: TimeEntry[], settings: Settings, meta: { by: UserInfo; extension: string; projectId: string; projectName: string; at: string }): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: meta.at,
    exportedBy: meta.by,
    source: { extension: meta.extension, projectId: meta.projectId, projectName: meta.projectName },
    settings,
    entries: [...entries].map(stripEtag).sort((a, b) => a.start.localeCompare(b.start)),
  };
}

export function summarize(entries: TimeEntry[]): ExportSummary {
  const active = entries.filter((e) => !e.deleted);
  const dates = entries.map((e) => e.date).sort();
  return {
    entries: entries.length,
    deleted: entries.length - active.length,
    users: new Set(entries.map((e) => e.userId)).size,
    workItems: new Set(entries.map((e) => e.workItemId)).size,
    minutes: active.reduce((s, e) => s + e.minutes, 0),
    from: dates[0],
    to: dates.at(-1),
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function entryProblem(e: unknown, i: number): string | null {
  const x = e as Partial<TimeEntry>;
  if (!x || typeof x !== "object") return `apontamento ${i + 1} não é um objeto`;
  if (typeof x.id !== "string" || !x.id) return `apontamento ${i + 1} sem id`;
  if (typeof x.workItemId !== "number") return `apontamento ${x.id} sem workItemId`;
  if (typeof x.date !== "string" || !DATE.test(x.date)) return `apontamento ${x.id} com data inválida`;
  if (typeof x.minutes !== "number" || x.minutes < 0) return `apontamento ${x.id} com minutos inválidos`;
  if (typeof x.userId !== "string" || typeof x.start !== "string" || typeof x.end !== "string") return `apontamento ${x.id} incompleto`;
  return null;
}

export function parseExport(text: string): { ok: true; file: ExportFile } | { ok: false; error: string } {
  let data: Partial<ExportFile>;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "O arquivo não é um JSON válido." };
  }
  if (data?.format !== EXPORT_FORMAT) return { ok: false, error: "Este arquivo não é uma exportação do TimeTracker." };
  if (typeof data.version !== "number" || data.version > EXPORT_VERSION) return { ok: false, error: `Versão de exportação ${data.version} não suportada; atualize a extensão.` };
  if (!Array.isArray(data.entries)) return { ok: false, error: "Exportação sem a lista de apontamentos." };
  for (let i = 0; i < data.entries.length; i++) {
    const problem = entryProblem(data.entries[i], i);
    if (problem) return { ok: false, error: `Arquivo inválido: ${problem}.` };
  }
  return { ok: true, file: data as ExportFile };
}

function stripEtag(e: TimeEntry): TimeEntry {
  const { __etag: _ignored, ...rest } = e;
  return rest;
}

/**
 * Entries ready to be written into the target project: same ids (re-importing overwrites instead
 * of duplicating), project id of the target, and an "import" line in the audit history.
 */
export function prepareForImport(entries: TimeEntry[], target: { projectId: string; by: string; at: string; sourceExtension: string }): TimeEntry[] {
  const detail = `importado de ${target.sourceExtension}`;
  return entries.map((e) => {
    const clean = stripEtag(e);
    const history = clean.history ?? [];
    return {
      ...clean,
      projectId: target.projectId,
      segments: clean.segments ?? [],
      history: history.some((h) => h.action === "import" && h.detail === detail) ? history : [...history, { at: target.at, by: target.by, action: "import" as const, detail }],
    };
  });
}
