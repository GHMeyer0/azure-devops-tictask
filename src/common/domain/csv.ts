import { formatDateBr, minutesToHours, toLocalTime } from "./time";
import { DIMS, type Dim, type Summary } from "./summary";
import type { TimeEntry } from "./types";

/** Excel pt-BR friendly: ';' separator, ',' decimal, BOM so accents open correctly. */
const SEP = ";";

function cell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCsv(entries: TimeEntry[]): string {
  const header = ["Data", "Início", "Fim", "Horas", "Pausas", "Usuário", "E-mail", "Task", "Título", "WI pai", "Título do WI pai", "Atividade", "Comentário", "Motivo", "Origem", "Estado antes", "Estado depois", "Remaining depois", "Apontado em"];
  const lines = [...entries]
    .filter((e) => !e.deleted)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) =>
      [
        formatDateBr(e.date),
        toLocalTime(e.start),
        toLocalTime(e.end),
        minutesToHours(e.minutes),
        Math.max(0, e.segments.length - 1),
        e.userName,
        e.userEmail,
        e.workItemId,
        e.workItemTitle,
        e.parentId,
        e.parentTitle,
        e.activity,
        e.comment,
        [e.reason, e.reasonDetail].filter(Boolean).join(". "),
        e.source,
        e.before?.state,
        e.after?.state,
        e.after?.remaining,
        e.createdAt,
      ]
        .map(cell)
        .join(SEP),
    );
  return "﻿" + [header.map(cell).join(SEP), ...lines].join("\r\n");
}

/** "Resumo" as a flat sheet: every row repeats its dimension values (no merged cells, no subtotals). */
export function summaryToCsv(summary: Summary, dims: Dim[]): string {
  const header = [...dims.map((d) => DIMS.find((x) => x.value === d)!.label), ...summary.columns.map((c) => (c.from === c.to ? formatDateBr(c.from) : c.label)), "Total"];
  const lines = summary.rows
    .filter((r) => r.kind === "item")
    .map((r) => [...dims.map((d) => r.cells[d]!.label), ...r.perCol.map((m) => (m ? minutesToHours(m) : "")), minutesToHours(r.total)].map(cell).join(SEP));
  const totals = ["Total", ...dims.slice(1).map(() => ""), ...summary.colTotals.map(minutesToHours), minutesToHours(summary.total)].map(cell).join(SEP);
  return "﻿" + [header.map(cell).join(SEP), ...lines, totals].join("\r\n");
}
