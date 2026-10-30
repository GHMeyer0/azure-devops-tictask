import {
  Button,
  Caption1,
  Checkbox,
  Field,
  Link,
  MessageBar,
  MessageBarBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ArrowUploadRegular, CheckmarkCircleRegular, SearchRegular } from "@fluentui/react-icons";
import { useRef, useState } from "react";
import type { Ctx } from "../common/actions";
import { adjustCompleted, exportProject, findCompletedMismatches, importProject, importTimeLog, type CompletedMismatch } from "../common/data/migration";
import { parseExport, summarize, type ExportFile, type ExportSummary } from "../common/domain/exportFile";
import { parseTimeLogCsv, summarizeTimeLog, TIMELOG_DAY_START, type TimeLogRow } from "../common/domain/timelogImport";
import { formatDateBr, formatHours, formatMinutes, toLocalDate } from "../common/domain/time";
import type { Settings } from "../common/domain/types";
import { confirmDialog, extensionFullId } from "../common/sdk";
import { ErrorBar, Section, WorkItemLink } from "../common/ui/components";
import { useRunner } from "../common/ui/hooks";
import { downloadText } from "./download";

const useStyles = makeStyles({
  box: { display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
});

function describe(s: ExportSummary): string {
  const period = s.from && s.to ? ` de ${formatDateBr(s.from)} a ${formatDateBr(s.to)}` : "";
  return `${s.entries} apontamentos (${s.deleted} excluídos)${period} · ${s.users} usuários · ${s.workItems} work items · ${formatMinutes(s.minutes)}`;
}

/** Export all entries + settings to JSON, and import such a file (moving between publishers). */
export function MigrationSection({ ctx, onSettingsImported }: { ctx: Ctx; onSettingsImported: (s: Settings) => void }) {
  const st = useStyles();
  const exporter = useRunner();
  const importer = useRunner();
  const [progress, setProgress] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [file, setFile] = useState<ExportFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [imported, setImported] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const current = extensionFullId();

  const doExport = () =>
    exporter.run(async () => {
      setExported(null);
      const data = await exportProject(ctx, (done, total) => setProgress(`Lendo meses ${done}/${total}…`));
      setProgress(null);
      const how = await downloadText(`tictask_${ctx.projectName}_${toLocalDate(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
      setExported(`${describe(summarize(data.entries))}. ${how === "downloaded" ? "Arquivo baixado." : "O download foi bloqueado: o JSON foi copiado para a área de transferência."}`);
    });

  const load = (text: string) => {
    setImported(null);
    const parsed = parseExport(text);
    if (parsed.ok) {
      setFile(parsed.file);
      setParseError(null);
    } else {
      setFile(null);
      setParseError(parsed.error);
    }
  };

  const doImport = () =>
    importer.run(async () => {
      if (!file) return;
      const otherProject = file.source.projectId !== ctx.projectId;
      const ok = await confirmDialog(
        `Importar ${file.entries.length} apontamentos${withSettings ? " e as configurações" : ""} para ${ctx.projectName} (${current})?` +
          (otherProject ? ` Atenção: o arquivo é do projeto ${file.source.projectName}.` : "") +
          " Os campos dos work items não são alterados; apontamentos com o mesmo id são sobrescritos.",
        "Importar dados",
        "Importar",
      );
      if (!ok) return;
      const result = await importProject(ctx, file, { settings: withSettings }, (done, total) => setProgress(`Gravando ${done}/${total}…`));
      setProgress(null);
      if (result.settings) onSettingsImported(result.settings);
      setImported(`${result.entries} apontamentos importados${result.settings ? " e configurações aplicadas" : ""}.`);
      setFile(null);
    });

  return (
    <Section title="Exportar / importar dados">
      <Caption1 className={st.muted}>
        Os dados ficam guardados por extensão ({current}). Para trocar de publisher: exporte aqui, instale a nova extensão, importe nela e só então desinstale esta. Termine o timer em andamento antes de exportar.
      </Caption1>

      <div className={st.box}>
        <div className={st.row}>
          <Button icon={<ArrowDownloadRegular />} disabled={exporter.busy} onClick={doExport}>
            Exportar dados do projeto
          </Button>
          {exporter.busy && <Spinner size="tiny" label={progress ?? "Exportando…"} />}
        </div>
        <Caption1 className={st.muted}>JSON com todos os apontamentos do projeto {ctx.projectName} (inclusive os excluídos, para auditoria) e as configurações.</Caption1>
        {exported && (
          <MessageBar intent="success">
            <MessageBarBody>{exported}</MessageBarBody>
          </MessageBar>
        )}
        <ErrorBar error={exporter.error} />
      </div>

      <div className={st.box}>
        <div className={st.row}>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(await f.text());
              e.target.value = "";
            }}
          />
          <Button icon={<ArrowUploadRegular />} disabled={importer.busy} onClick={() => input.current?.click()}>
            Escolher arquivo de exportação
          </Button>
          <Link onClick={() => setPaste(!paste)}>{paste ? "ocultar" : "ou colar o JSON"}</Link>
        </div>
        {paste && (
          <Field label="Conteúdo do JSON">
            <Textarea value={pasted} onChange={(_, d) => setPasted(d.value)} rows={4} onBlur={() => pasted.trim() && load(pasted)} />
          </Field>
        )}
        <ErrorBar error={parseError} />

        {file && (
          <>
            <Text>
              <b>{file.source.extension}</b> · projeto {file.source.projectName} · exportado em {new Date(file.exportedAt).toLocaleString("pt-BR")} por {file.exportedBy?.displayName}
            </Text>
            <Text size={200}>{describe(summarize(file.entries))}</Text>
            {file.source.projectId !== ctx.projectId && (
              <MessageBar intent="warning">
                <MessageBarBody>O arquivo é do projeto {file.source.projectName}; os apontamentos serão gravados em {ctx.projectName}.</MessageBarBody>
              </MessageBar>
            )}
            {file.source.extension === current && (
              <MessageBar intent="info">
                <MessageBarBody>O arquivo veio desta mesma extensão: importar só regrava os mesmos apontamentos.</MessageBarBody>
              </MessageBar>
            )}
            <Checkbox checked={withSettings} onChange={(_, d) => setWithSettings(!!d.checked)} label="Importar também as configurações (substitui as atuais)" />
            <div className={st.row}>
              <Button appearance="primary" icon={<ArrowUploadRegular />} disabled={importer.busy || !file.entries.length} onClick={doImport}>
                Importar {file.entries.length} apontamentos
              </Button>
              {importer.busy && <Spinner size="tiny" label={progress ?? "Importando…"} />}
            </div>
          </>
        )}
        {imported && (
          <MessageBar intent="success">
            <MessageBarBody>{imported}</MessageBarBody>
          </MessageBar>
        )}
        <ErrorBar error={importer.error} />
      </div>

      <TimeLogImport ctx={ctx} />
      <CompletedCheck ctx={ctx} />
    </Section>
  );
}

/** Import from the "Time Log" extension: the CSV of its admin page (Download all logs as CSV). */
function TimeLogImport({ ctx }: { ctx: Ctx }) {
  const st = useStyles();
  const runner = useRunner();
  const [rows, setRows] = useState<TimeLogRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const summary = rows ? summarizeTimeLog(rows) : null;
  const known = new Set(ctx.settings.activities.map((a) => a.name.toLowerCase()));
  const newTypes = summary?.types.filter((t) => !known.has(t.toLowerCase())) ?? [];

  const load = (text: string) => {
    setDone(null);
    const parsed = parseTimeLogCsv(text);
    setRows(parsed.ok ? parsed.rows : null);
    setParseError(parsed.ok ? null : parsed.error);
  };

  const doImport = () =>
    runner.run(async () => {
      if (!rows) return;
      const ok = await confirmDialog(
        `Importar ${rows.length} apontamentos do Time Log para ${ctx.projectName}? As horas dos work items não são alteradas (o Time Log já as aplicou); importar de novo o mesmo arquivo não duplica.`,
        "Importar do Time Log",
        "Importar",
      );
      if (!ok) return;
      const result = await importTimeLog(ctx, rows, (n, total) => setProgress(`Gravando ${n}/${total}…`));
      setProgress(null);
      setRows(null);
      setDone(
        `${result.entries} apontamentos importados.` +
          (result.missingWorkItems.length ? ` Work items que não existem mais (importados só com o número): ${result.missingWorkItems.map((id) => `#${id}`).join(", ")}.` : ""),
      );
    });

  return (
    <div className={st.box}>
      <Text weight="semibold">Importar do Time Log</Text>
      <Caption1 className={st.muted}>
        Para quem usava a extensão Time Log: em Configurações do projeto › Time Log Admin, clique em "Download all logs as CSV" e escolha o arquivo aqui. As horas dos work items não são alteradas,
        porque o Time Log já as somou. O Time Log não guarda horário: os apontamentos de cada pessoa no dia ficam em sequência a partir das {TIMELOG_DAY_START}.
      </Caption1>
      <div className={st.row}>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) load(await f.text());
            e.target.value = "";
          }}
        />
        <Button icon={<ArrowUploadRegular />} disabled={runner.busy} onClick={() => input.current?.click()}>
          Escolher CSV do Time Log
        </Button>
      </div>
      <ErrorBar error={parseError} />
      {summary && (
        <>
          <Text size={200}>
            {summary.rows} apontamentos{summary.from && summary.to ? ` de ${formatDateBr(summary.from)} a ${formatDateBr(summary.to)}` : ""} · {summary.workItems} work items · {formatMinutes(summary.minutes)}
          </Text>
          <Caption1>{summary.people.map((p) => `${p.name}: ${formatMinutes(p.minutes)}`).join(" · ")}</Caption1>
          {newTypes.length > 0 && (
            <MessageBar intent="info">
              <MessageBarBody>
                Tipos do Time Log que não são atividades do TicTask: {newTypes.join(", ")}. Eles são importados com esse nome; cadastre em Atividades se quiser cor e Activity no ADO.
              </MessageBarBody>
            </MessageBar>
          )}
          {summary.overADay > 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>{summary.overADay} apontamento(s) com mais de 24h: entram inteiros no dia, terminando em outro dia no Calendário.</MessageBarBody>
            </MessageBar>
          )}
          <div className={st.row}>
            <Button appearance="primary" icon={<ArrowUploadRegular />} disabled={runner.busy || !rows?.length} onClick={doImport}>
              Importar {summary.rows} apontamentos
            </Button>
            {runner.busy && <Spinner size="tiny" label={progress ?? "Importando…"} />}
          </div>
        </>
      )}
      {done && (
        <MessageBar intent="success">
          <MessageBarBody>{done}</MessageBarBody>
        </MessageBar>
      )}
      <ErrorBar error={runner.error} />
    </div>
  );
}

/**
 * Tasks whose Completed is not the sum of their entries (typed in the form, or left by a failed
 * save), with the option to set it from the entries. Tasks without entries are not touched.
 */
function CompletedCheck({ ctx }: { ctx: Ctx }) {
  const st = useStyles();
  const runner = useRunner();
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ tasks: number; mismatches: CompletedMismatch[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<string | null>(null);

  const check = () =>
    runner.run(async () => {
      setDone(null);
      const found = await findCompletedMismatches(ctx, (n, total) => setProgress(`Lendo meses ${n}/${total}…`));
      setProgress(null);
      setResult(found);
      setSelected(new Set(found.mismatches.map((m) => m.id)));
    });

  const adjust = () =>
    runner.run(async () => {
      if (!result) return;
      const ids = result.mismatches.filter((m) => selected.has(m.id)).map((m) => m.id);
      const ok = await confirmDialog(`Gravar em ${ids.length} ${ids.length === 1 ? "task" : "tasks"} o Completed igual à soma dos apontamentos? O Remaining não muda.`, "Ajustar Completed", "Ajustar");
      if (!ok) return;
      const failed = await adjustCompleted(ctx, ids, (n, total) => setProgress(`Gravando ${n}/${total}…`));
      setProgress(null);
      const left = new Set(failed.map((f) => f.id));
      setResult({ ...result, mismatches: result.mismatches.filter((m) => !selected.has(m.id) || left.has(m.id)) });
      setSelected(left);
      setDone(`${ids.length - failed.length} ${ids.length - failed.length === 1 ? "task ajustada" : "tasks ajustadas"}.` + (failed.length ? ` Não foi possível gravar: ${failed.map((f) => `#${f.id} (${f.error})`).join("; ")}.` : ""));
    });

  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };
  const all = !!result && result.mismatches.length > 0 && result.mismatches.every((m) => selected.has(m.id));

  return (
    <div className={st.box}>
      <Text weight="semibold">Conferir o Completed das tasks</Text>
      <Caption1 className={st.muted}>
        Em uma task com apontamentos, o Completed é a soma deles. Aqui aparecem as tasks em que ele ficou diferente (por exemplo, editado à mão no formulário) e você pode ajustá-las de uma vez. Tasks
        sem apontamento, outros tipos de work item e diferenças de menos de 1 minuto (arredondamento) não entram.
      </Caption1>
      <div className={st.row}>
        <Button icon={<SearchRegular />} disabled={runner.busy} onClick={check}>
          Conferir
        </Button>
        {runner.busy && <Spinner size="tiny" label={progress ?? "Conferindo…"} />}
      </div>
      {result && result.mismatches.length === 0 && (
        <MessageBar intent="success" icon={<CheckmarkCircleRegular />}>
          <MessageBarBody>Todas as {result.tasks} tasks com apontamento estão com o Completed igual à soma.</MessageBarBody>
        </MessageBar>
      )}
      {result && result.mismatches.length > 0 && (
        <>
          <Text size={200}>
            {result.mismatches.length} de {result.tasks} tasks com apontamento estão com o Completed diferente da soma.
          </Text>
          <div style={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Tasks com Completed diferente" style={{ minWidth: 640 }}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell style={{ width: 40 }}>
                    <Checkbox aria-label="Marcar todas" checked={all ? true : selected.size ? "mixed" : false} onChange={(_, d) => setSelected(d.checked ? new Set(result.mismatches.map((m) => m.id)) : new Set())} />
                  </TableHeaderCell>
                  <TableHeaderCell>Task</TableHeaderCell>
                  <TableHeaderCell style={{ width: 160 }}>Responsável</TableHeaderCell>
                  <TableHeaderCell style={{ width: 90 }}>Estado</TableHeaderCell>
                  <TableHeaderCell style={{ width: 90 }}>Completed</TableHeaderCell>
                  <TableHeaderCell style={{ width: 110 }}>Apontamentos</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.mismatches.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Checkbox aria-label={`Ajustar #${m.id}`} checked={selected.has(m.id)} onChange={(_, d) => toggle(m.id, !!d.checked)} />
                    </TableCell>
                    <TableCell>
                      <WorkItemLink id={m.id} title={m.title} />
                    </TableCell>
                    <TableCell>{m.assignedTo ?? "—"}</TableCell>
                    <TableCell>{m.state}</TableCell>
                    <TableCell>{formatHours(m.completed ?? 0)}</TableCell>
                    <TableCell>{formatHours(m.fromEntries)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className={st.row}>
            <Button appearance="primary" disabled={runner.busy || !selected.size} onClick={adjust}>
              Ajustar {selected.size} {selected.size === 1 ? "task" : "tasks"}
            </Button>
          </div>
        </>
      )}
      {done && (
        <MessageBar intent="success">
          <MessageBarBody>{done}</MessageBarBody>
        </MessageBar>
      )}
      <ErrorBar error={runner.error} />
    </div>
  );
}
