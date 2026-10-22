import { Button, Caption1, Checkbox, Field, Link, MessageBar, MessageBarBody, Spinner, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowDownloadRegular, ArrowUploadRegular } from "@fluentui/react-icons";
import { useRef, useState } from "react";
import type { Ctx } from "../common/actions";
import { exportProject, importProject } from "../common/data/migration";
import { parseExport, summarize, type ExportFile, type ExportSummary } from "../common/domain/exportFile";
import { formatDateBr, formatMinutes, toLocalDate } from "../common/domain/time";
import type { Settings } from "../common/domain/types";
import { confirmDialog, extensionFullId } from "../common/sdk";
import { ErrorBar, Section } from "../common/ui/components";
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
    </Section>
  );
}
