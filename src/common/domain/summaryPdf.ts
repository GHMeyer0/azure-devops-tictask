import { DIMS, type Dim, type Summary } from "./summary";
import { formatMinutes } from "./time";

// The "Resumo" as the cells of a PDF table (jspdf-autotable cell definitions, kept free of the
// library so it can be tested): same rows, merged dimension cells, subtotals and totals as on screen.

export interface PdfCell {
  content: string;
  rowSpan?: number;
  colSpan?: number;
  styles?: { fontStyle?: "bold" | "normal"; halign?: "left" | "center" | "right"; fillColor?: [number, number, number] };
}

export interface PdfTable {
  head: PdfCell[][];
  /** The head in one row (no week row above the days): used when the columns break into pages. */
  flatHead: PdfCell[][];
  body: PdfCell[][];
  foot: PdfCell[][];
  /** Dimension columns on the left (repeated when the period columns break into pages). */
  dims: Dim[];
  /** Number of period columns (after the dimensions, before the total). */
  periods: number;
}

const SUBTOTAL_FILL: [number, number, number] = [240, 240, 240];
const right = (content: string, bold = false): PdfCell => ({ content, styles: { halign: "right", ...(bold ? { fontStyle: "bold" } : {}) } });
const hours = (minutes: number) => (minutes ? formatMinutes(minutes) : "");

export function summaryPdfTable(summary: Summary, dims: Dim[]): PdfTable {
  const dimLabel = (d: Dim) => DIMS.find((x) => x.value === d)!.label;
  // "Qui 22/10" in two lines keeps the day columns narrow.
  const columns = summary.columns.map((c) => ({ content: c.label.replace(" ", "\n"), styles: { halign: "right" as const } }));
  const flatHead: PdfCell[][] = [[...dims.map((d) => ({ content: dimLabel(d) })), ...columns, { content: "Total", styles: { halign: "right" } }]];
  const head: PdfCell[][] = summary.groups.length
    ? [
        [
          ...dims.map((d) => ({ content: dimLabel(d), rowSpan: 2 })),
          ...summary.groups.map((g) => ({ content: g.label, colSpan: g.span, styles: { halign: "center" as const } })),
          { content: "Total", rowSpan: 2, styles: { halign: "right" } },
        ],
        columns,
      ]
    : flatHead;

  const body: PdfCell[][] = summary.rows.map((row) => {
    const periods = [...row.perCol.map((m) => right(hours(m), row.kind === "subtotal")), right(formatMinutes(row.total), true)];
    if (row.kind === "subtotal") {
      const fill = (c: PdfCell): PdfCell => ({ ...c, styles: { ...c.styles, fillColor: SUBTOTAL_FILL } });
      return [fill({ content: row.label, colSpan: dims.length, styles: { fontStyle: "bold" } }), ...periods.map(fill)];
    }
    // A merged dimension cell is written once, on its first row, spanning the rows below it.
    const cells = dims.filter((d) => row.spans[d]! > 0).map((d) => ({ content: row.cells[d]!.label, rowSpan: row.spans[d]! }));
    return [...cells, ...periods];
  });

  const foot: PdfCell[][] = [[{ content: "Total", colSpan: dims.length }, ...summary.colTotals.map((m) => right(hours(m), true)), right(formatMinutes(summary.total), true)]];
  return { head, flatHead, body, foot, dims, periods: summary.columns.length };
}
