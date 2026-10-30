import { describe, expect, it } from "vitest";
import { buildSummary } from "../src/common/domain/summary";
import { summaryPdfTable } from "../src/common/domain/summaryPdf";
import type { TimeEntry } from "../src/common/domain/types";
import { renderSummaryPdf } from "../src/hub/pdf/renderSummaryPdf";

function entry(p: Partial<TimeEntry>): TimeEntry {
  return {
    id: Math.random().toString(36),
    projectId: "p",
    workItemId: 10,
    workItemTitle: "Desenvolvimento",
    workItemType: "Task",
    parentId: 1,
    parentTitle: "Cobrança automática",
    userId: "u1",
    userName: "Ana",
    userEmail: "ana@x.com",
    date: "2026-10-19",
    start: "2026-10-19T12:00:00.000Z",
    end: "2026-10-19T13:00:00.000Z",
    minutes: 60,
    segments: [],
    activity: "Desenvolvimento/Correção",
    comment: "",
    source: "manual",
    createdAt: "2026-10-19T13:00:00.000Z",
    createdBy: "u1",
    history: [],
    ...p,
  };
}

const entries = [
  entry({ date: "2026-10-19", minutes: 60 }),
  entry({ date: "2026-10-20", minutes: 30 }),
  entry({ date: "2026-10-20", minutes: 45, activity: "Revisão" }),
  entry({ date: "2026-10-27", minutes: 120, workItemId: 11, workItemTitle: "Testes e ajustes" }),
  entry({ date: "2026-10-21", minutes: 90, userId: "u2", userName: "Bruno", parentId: undefined, parentTitle: undefined, workItemId: 20, workItemTitle: "Reunião com cliente" }),
];
const opts = { from: "2026-10-19", to: "2026-10-31", bucket: "day" as const, dims: ["user", "parent", "task", "activity"] as const, hideEmpty: true };
const summary = buildSummary(entries, { ...opts, dims: [...opts.dims] });

describe("summaryPdfTable", () => {
  const table = summaryPdfTable(summary, [...opts.dims]);

  it("heads the dimensions, the weeks over the days and the total", () => {
    expect(table.head).toHaveLength(2);
    expect(table.head[0].map((c) => c.content)).toEqual(["Pessoa", "WI pai", "Task", "Atividade", "19–25/10", "26–31/10", "Total"]);
    expect(table.head[0][4].colSpan).toBe(3);
    expect(table.head[1]).toHaveLength(summary.columns.length);
  });

  it("merges repeated dimension cells and keeps the subtotals and the total", () => {
    // Ana: one cell for the person spanning her 3 rows; then her subtotal.
    expect(table.body[0][0]).toMatchObject({ content: "Ana", rowSpan: 3 });
    expect(table.body[1][0].content).not.toBe("Ana");
    const subtotal = table.body.find((r) => r[0].content === "Total Ana")!;
    expect(subtotal[0].colSpan).toBe(4);
    expect(subtotal.at(-1)!.content).toBe("4h15");
    expect(table.foot[0].at(-1)!.content).toBe("5h45");
    expect(table.periods).toBe(summary.columns.length);
  });

  it("renders a landscape PDF with the title, accents and page numbers", async () => {
    const blob = renderSummaryPdf(table, { title: "Resumo de horas · Contoso", lines: ["19/10/2026 a 31/10/2026 · por dia"], footer: "Gerado por Ana em 30/10/2026 10:00 · TicTask" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toMatch(/\/MediaBox \[0 0 841\.8\d* 595\.2\d*\]/); // A4 landscape
    expect(text).toContain("Página 1 de 1");
    expect(text).toContain("Reunião com cliente");
  });

  it("continues a month of day columns on the next pages", async () => {
    const month = buildSummary(entries, { ...opts, dims: [...opts.dims], from: "2026-10-01", to: "2026-10-31", hideEmpty: false });
    const blob = renderSummaryPdf(summaryPdfTable(month, [...opts.dims]), { title: "Resumo", lines: [], footer: "" });
    const text = new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toMatch(/Página 1 de [2-9]/);
  });
});
