import { DIMS, type Bucket, type Dim } from "../common/domain/summary";
import { addDays, addMonths, monthEnd, monthStart, weekStart } from "../common/domain/time";

// Toolbar choices of the Resumo, kept in the browser (localStorage) for the next visit.

export type Preset = "week" | "lastWeek" | "month" | "lastMonth";
export const PRESETS: { value: Preset; label: string }[] = [
  { value: "week", label: "Esta semana" },
  { value: "lastWeek", label: "Semana passada" },
  { value: "month", label: "Este mês" },
  { value: "lastMonth", label: "Mês passado" },
];

export function presetRange(p: Preset, today: string): { from: string; to: string } {
  const ws = weekStart(today);
  switch (p) {
    case "week":
      return { from: ws, to: addDays(ws, 6) };
    case "lastWeek":
      return { from: addDays(ws, -7), to: addDays(ws, -1) };
    case "month":
      return { from: monthStart(today), to: monthEnd(today) };
    case "lastMonth": {
      const m = addMonths(monthStart(today), -1);
      return { from: m, to: monthEnd(m) };
    }
  }
}

export type Scope = { kind: "me" } | { kind: "all" } | { kind: "team"; teamId: string };

/** "Quem" as saved: me, all or team:<id>. */
export const scopeOf = (key: string | undefined): Scope => (key?.startsWith("team:") ? { kind: "team", teamId: key.slice(5) } : key === "all" ? { kind: "all" } : { kind: "me" });

export interface Prefs {
  /** 2 since Projeto (0.11): rows saved before get Projeto after Pessoa, once. */
  v: number;
  bucket: Bucket;
  dims: Dim[];
  hideEmpty: boolean;
  /** Also lists each entry (edit/delete), below the table. */
  detailed: boolean;
  /** Hours of every project the user can open, or only of this project. */
  allProjects: boolean;
  /** Period picked in the list: the dates follow from it on the next visit. */
  period: Preset;
  /** "Quem" (managers): me, all or team:<id>. */
  scope: string;
  person: string;
}

export const PREFS_KEY = "tt-summary";
export const DEFAULT_PREFS: Prefs = {
  v: 2,
  bucket: "day",
  dims: ["user", "project", "parent", "activity"],
  hideEmpty: true,
  detailed: false,
  allProjects: true,
  period: "month",
  scope: "me",
  person: "",
};

export function parsePrefs(raw: string | null): Prefs {
  try {
    const p = JSON.parse(raw ?? "null") as Partial<Prefs> | null;
    if (!p || typeof p !== "object") return DEFAULT_PREFS;
    let dims = (p.dims ?? []).filter((d) => DIMS.some((x) => x.value === d));
    if ((p.v ?? 1) < 2 && dims.length && !dims.includes("project")) dims = DIMS.map((x) => x.value).filter((d) => d === "project" || dims.includes(d));
    const period = PRESETS.some((x) => x.value === p.period) ? p.period! : DEFAULT_PREFS.period;
    return { ...DEFAULT_PREFS, ...p, v: 2, period, dims: dims.length ? dims : DEFAULT_PREFS.dims };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function readPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}
