import { sum } from "./aggregate";
import { addDays, dayRange, formatDayMonth, formatDayShort, formatMonth, isWeekend, monthEnd, monthStart, weekStart } from "./time";
import type { TimeEntry } from "./types";

// "Resumo" (hub): like the TimeLog "Time Log Summary", a flat table with one column per dimension
// (Pessoa, US/Bug, Task, Atividade) and one per day, week or month. Repeated dimension values are
// merged (rowSpan) instead of nested like the Timesheet tree.

export type Bucket = "day" | "week" | "month";
export type Dim = "user" | "parent" | "task" | "activity";

export const DIMS: { value: Dim; label: string }[] = [
  { value: "user", label: "Pessoa" },
  { value: "parent", label: "US/Bug" },
  { value: "task", label: "Task" },
  { value: "activity", label: "Atividade" },
];

export interface SummaryColumn {
  /** First day of the bucket inside the range. */
  from: string;
  to: string;
  label: string;
  weekend?: boolean;
  /** Week of a day column ("19–25/10"), shown as a header above its days. */
  group?: string;
}

export interface SummaryCell {
  key: string;
  label: string;
  workItemId?: number;
  title?: string;
}

export interface SummaryItemRow {
  kind: "item";
  key: string;
  cells: Partial<Record<Dim, SummaryCell>>;
  /** rowSpan of each dimension cell: 0 when merged into the cell above. */
  spans: Partial<Record<Dim, number>>;
  perCol: number[];
  total: number;
}

/** Total of a value of the first dimension (e.g. a person), after its rows. */
export interface SummarySubtotalRow {
  kind: "subtotal";
  key: string;
  label: string;
  perCol: number[];
  total: number;
}

export type SummaryRow = SummaryItemRow | SummarySubtotalRow;

export interface Summary {
  columns: SummaryColumn[];
  /** Header row above the day columns (one per week); empty when not useful. */
  groups: { label: string; span: number }[];
  rows: SummaryRow[];
  colTotals: number[];
  total: number;
}

/** "12–18/10", or "28/09–04/10" across months: short enough for a single day column. */
function rangeLabel(from: string, to: string): string {
  return from.slice(0, 7) === to.slice(0, 7) ? `${from.slice(8)}–${formatDayMonth(to)}` : `${formatDayMonth(from)}–${formatDayMonth(to)}`;
}

function columnsOf(from: string, to: string, bucket: Bucket): SummaryColumn[] {
  const cols: SummaryColumn[] = [];
  const clamp = (a: string, b: string) => ({ from: a < from ? from : a, to: b > to ? to : b });
  if (bucket === "day") {
    for (const d of dayRange(from, to)) {
      const w = clamp(weekStart(d), addDays(weekStart(d), 6));
      cols.push({ from: d, to: d, label: formatDayShort(d), weekend: isWeekend(d), group: rangeLabel(w.from, w.to) });
    }
  } else if (bucket === "week") {
    for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
      const w = clamp(ws, addDays(ws, 6));
      cols.push({ ...w, label: rangeLabel(w.from, w.to) });
    }
  } else {
    for (let ms = monthStart(from); ms <= to; ms = addDays(monthEnd(ms), 1)) {
      cols.push({ ...clamp(ms, monthEnd(ms)), label: formatMonth(ms) });
    }
  }
  return cols;
}

function cellOf(e: TimeEntry, dim: Dim): SummaryCell {
  switch (dim) {
    case "user":
      return { key: e.userId, label: e.userName };
    case "parent":
      return e.parentId
        ? { key: String(e.parentId), label: `#${e.parentId} ${e.parentTitle ?? ""}`.trim(), workItemId: e.parentId, title: e.parentTitle }
        : { key: "", label: "(sem item pai)" };
    case "task":
      return { key: String(e.workItemId), label: `#${e.workItemId} ${e.workItemTitle}`, workItemId: e.workItemId, title: e.workItemTitle };
    case "activity":
      return { key: e.activity, label: e.activity || "(sem atividade)" };
  }
}

/** Work items by id (no parent last), people and activities by name. */
function compareCells(dim: Dim, a: SummaryCell, b: SummaryCell): number {
  if (dim === "parent" || dim === "task") {
    if (!a.workItemId || !b.workItemId) return (a.workItemId ? 0 : 1) - (b.workItemId ? 0 : 1);
    return a.workItemId - b.workItemId;
  }
  return a.label.localeCompare(b.label, "pt-BR");
}

/**
 * Builds the summary of `entries` in from..to, one row per combination of `dims` (in that order,
 * at least one). `hideEmpty` drops columns without hours. Deleted entries and days outside the
 * range are ignored.
 */
export function buildSummary(entries: TimeEntry[], opts: { from: string; to: string; bucket: Bucket; dims: Dim[]; hideEmpty: boolean }): Summary {
  const { from, to, dims } = opts;
  let columns = columnsOf(from, to, opts.bucket);
  const colOfDay = new Map<string, number>();
  columns.forEach((c, i) => dayRange(c.from, c.to).forEach((d) => colOfDay.set(d, i)));

  const items = new Map<string, { cells: Partial<Record<Dim, SummaryCell>>; perCol: number[] }>();
  for (const e of entries) {
    const ci = colOfDay.get(e.date);
    if (e.deleted || ci === undefined) continue;
    const cells: Partial<Record<Dim, SummaryCell>> = {};
    for (const d of dims) cells[d] = cellOf(e, d);
    const key = dims.map((d) => cells[d]!.key).join("\u0001");
    let item = items.get(key);
    if (!item) {
      item = { cells, perCol: new Array(columns.length).fill(0) };
      items.set(key, item);
    }
    item.perCol[ci] += e.minutes;
  }

  let sorted = [...items.entries()].sort(([, a], [, b]) => {
    for (const d of dims) {
      const c = compareCells(d, a.cells[d]!, b.cells[d]!);
      if (c) return c;
    }
    return 0;
  });

  const colTotals = new Array(columns.length).fill(0);
  for (const [, item] of sorted) item.perCol.forEach((m, i) => (colTotals[i] += m));
  if (opts.hideEmpty) {
    const keep = colTotals.map((m) => m > 0);
    columns = columns.filter((_, i) => keep[i]);
    sorted = sorted.map(([k, item]) => [k, { ...item, perCol: item.perCol.filter((_, i) => keep[i]) }]);
    colTotals.splice(0, colTotals.length, ...colTotals.filter((_, i) => keep[i]));
  }

  // Dimension cells equal to the row above (and with the same values before them) are merged.
  const itemRows: SummaryItemRow[] = sorted.map(([key, item]) => ({ kind: "item", key, cells: item.cells, spans: {}, perCol: item.perCol, total: sum(item.perCol) }));
  dims.forEach((dim, di) => {
    let head: SummaryItemRow | null = null;
    for (let r = 0; r < itemRows.length; r++) {
      const row = itemRows[r];
      const prev = itemRows[r - 1];
      const same = head && prev && dims.slice(0, di + 1).every((d) => prev.cells[d]!.key === row.cells[d]!.key);
      if (same) {
        head!.spans[dim]! += 1;
        row.spans[dim] = 0;
      } else {
        row.spans[dim] = 1;
        head = row;
      }
    }
  });

  // Subtotal per value of the first dimension when it has more than one row (and there are several).
  const rows: SummaryRow[] = [];
  const first = dims[0];
  const groupCount = itemRows.filter((r) => r.spans[first]! > 0).length;
  for (let r = 0; r < itemRows.length; r += itemRows[r].spans[first]!) {
    const group = itemRows.slice(r, r + itemRows[r].spans[first]!);
    rows.push(...group);
    if (dims.length > 1 && groupCount > 1 && group.length > 1) {
      const perCol = columns.map((_, i) => sum(group.map((g) => g.perCol[i])));
      rows.push({ kind: "subtotal", key: `sub-${group[0].key}`, label: `Total ${group[0].cells[first]!.label}`, perCol, total: sum(perCol) });
    }
  }

  const groups: Summary["groups"] = [];
  if (opts.bucket === "day") {
    for (const c of columns) {
      const last = groups[groups.length - 1];
      if (last && last.label === c.group) last.span++;
      else groups.push({ label: c.group!, span: 1 });
    }
  }

  return { columns, groups: groups.length > 1 ? groups : [], rows, colTotals, total: sum(colTotals) };
}
