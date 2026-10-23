import { formatDateBr, minutesToHours, toLocalTime } from "./time";
import type { TimeEntry } from "./types";

/** Excel pt-BR friendly: ';' separator, ',' decimal, BOM so accents open correctly. */
const SEP = ";";

function cell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCsv(entries: TimeEntry[]): string {
  const header = ["Data", "Início", "Fim", "Horas", "Pausas", "Usuário", "E-mail", "Task", "Título", "Item pai", "Título pai", "Atividade", "Comentário", "Motivo", "Origem", "Estado antes", "Estado depois", "Remaining depois", "Apontado em"];
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

export function sheetToCsv(days: string[], rows: { level: number; label: string; perDay: number[]; total: number }[], dayTotals: number[], total: number): string {
  const header = ["Nível 1", "Nível 2", "Nível 3", ...days.map(formatDateBr), "Total"];
  const lines = rows.map((r) => {
    const levelCells = ["", "", ""];
    levelCells[r.level] = r.label;
    return [...levelCells, ...r.perDay.map((m) => (m ? minutesToHours(m) : "")), minutesToHours(r.total)].map(cell).join(SEP);
  });
  const totals = ["Total", "", "", ...dayTotals.map(minutesToHours), minutesToHours(total)].map(cell).join(SEP);
  return "﻿" + [header.map(cell).join(SEP), ...lines, totals].join("\r\n");
}
