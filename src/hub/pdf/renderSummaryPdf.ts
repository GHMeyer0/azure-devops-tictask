import { jsPDF } from "jspdf";
import { autoTable, type Styles } from "jspdf-autotable";
import type { Dim } from "../../common/domain/summary";
import type { PdfTable } from "../../common/domain/summaryPdf";

// Bundled on its own (dist/pdf.js) and loaded by the hub only when a PDF is exported, so jsPDF does
// not weigh on every page load. Uses only the standard PDF fonts (Helvetica, WinAnsi: Portuguese
// accents are covered) and none of the jsPDF features that pull html2canvas/canvg/DOMPurify.

export interface SummaryPdfMeta {
  title: string;
  /** Lines under the title: period, who, rows… */
  lines: string[];
  /** Left side of every page footer (who generated it and when). */
  footer: string;
}

const MARGIN = 36;
const DIM_WIDTH: Record<Dim, number> = { user: 95, parent: 160, task: 160, activity: 118 };
/** Narrower dimensions when the period does not fit the page: more days per page. */
const DIM_WIDTH_NARROW: Record<Dim, number> = { user: 70, parent: 88, task: 93, activity: 100 };
const PERIOD_WIDTH = 36;
const TOTAL_WIDTH = 46;
const ADO_BLUE: [number, number, number] = [0, 120, 212];

export function renderSummaryPdf(table: PdfTable, meta: SummaryPdfMeta): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setProperties({ title: meta.title, creator: "TicTask" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(meta.title, MARGIN, MARGIN + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  meta.lines.forEach((line, i) => doc.text(line, MARGIN, MARGIN + 24 + i * 12));
  doc.setTextColor(0);

  // Dimension columns are wider and wrap; period columns are narrow and right-aligned. When the
  // period does not fit the page, the dimensions get narrower (more days per page) and the columns
  // continue on the next pages, without the week row (its merged cells do not split well).
  const available = width - 2 * MARGIN;
  const dimsWidth = table.dims.reduce((s, d) => s + DIM_WIDTH[d], 0);
  const fits = dimsWidth + table.periods * PERIOD_WIDTH + TOTAL_WIDTH <= available;
  const columnStyles: Record<number, Partial<Styles>> = {};
  const dims = table.dims.length;
  table.dims.forEach((d, i) => (columnStyles[i] = { cellWidth: (fits ? DIM_WIDTH : DIM_WIDTH_NARROW)[d] }));
  for (let i = 0; i < table.periods; i++) columnStyles[dims + i] = { cellWidth: PERIOD_WIDTH, halign: "right" };
  columnStyles[dims + table.periods] = { cellWidth: TOTAL_WIDTH, halign: "right", fontStyle: "bold" };

  autoTable(doc, {
    head: (fits ? table.head : table.flatHead) as never,
    body: table.body as never,
    foot: table.foot as never,
    startY: MARGIN + 24 + meta.lines.length * 12 + 4,
    margin: { top: MARGIN, right: MARGIN, bottom: MARGIN + 8, left: MARGIN },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 3, overflow: "linebreak", valign: "top", lineColor: [210, 210, 210], lineWidth: 0.5 },
    headStyles: { fillColor: ADO_BLUE, textColor: 255, fontStyle: "bold", valign: "middle" },
    footStyles: { fillColor: [225, 225, 225], textColor: 20, fontStyle: "bold" },
    columnStyles,
    showFoot: "lastPage",
    // Long periods: the period columns continue on the next pages, with the dimensions repeated.
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: Array.from({ length: dims }, (_, i) => i),
  });

  const pages = doc.getNumberOfPages();
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.text(meta.footer, MARGIN, height - MARGIN / 2);
    doc.text(`Página ${page} de ${pages}`, width - MARGIN, height - MARGIN / 2, { align: "right" });
  }
  return doc.output("blob");
}
