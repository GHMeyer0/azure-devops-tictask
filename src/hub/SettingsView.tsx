import { Button, Caption1, Checkbox, Field, Input, MessageBar, MessageBarBody, Radio, RadioGroup, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, ArrowResetRegular, DeleteRegular, SaveRegular } from "@fluentui/react-icons";
import { useState } from "react";
import type { Ctx } from "../common/actions";
import { saveSettings } from "../common/data/settingsRepo";
import { DEFAULT_SETTINGS } from "../common/domain/settings";
import type { ActivityDef, Settings, StateSettings } from "../common/domain/types";
import { ErrorBar, Section } from "../common/ui/components";
import { useRunner } from "../common/ui/hooks";
import { MigrationSection } from "./MigrationSection";

const useStyles = makeStyles({
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px 24px" },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: "flex", gap: "8px", marginTop: "16px" },
});

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function ListField({ label, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <Field label={label} hint={hint}>
      <Input value={text} onChange={(_, d) => setText(d.value)} onBlur={() => onChange(list(text))} />
    </Field>
  );
}

/** Project settings (stored once per project, shared by everyone). */
export function SettingsView({ ctx, onSaved }: { ctx: Ctx; onSaved: (s: Settings) => void }) {
  const st = useStyles();
  const [s, setS] = useState<Settings>(() => structuredClone(ctx.settings));
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useRunner();
  const set = (patch: Partial<Settings>) => (setS({ ...s, ...patch }), setSaved(false));
  const setStates = (patch: Partial<StateSettings>) => set({ states: { ...s.states, ...patch } });
  const setActivity = (i: number, patch: Partial<ActivityDef>) => set({ activities: s.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const save = () =>
    run(async () => {
      const clean = { ...s, activities: s.activities.filter((a) => a.name.trim()) };
      await saveSettings(ctx.projectId, clean);
      onSaved(clean);
      setSaved(true);
    });

  return (
    <div>
      <MessageBar intent="info">
        <MessageBarBody>As configurações valem para todo o projeto {ctx.projectName}. Ajuste os estados conforme o processo (ex.: Tiino usa Active, Stopped, Waiting e Closed na Task).</MessageBarBody>
      </MessageBar>

      <Section title="Atividades" actions={<Button size="small" icon={<AddRegular />} onClick={() => set({ activities: [...s.activities, { name: "", defaultTitle: "", standard: false, defaultEstimate: 1, color: "#69797e" }] })}>Adicionar</Button>}>
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 48 }}>Cor</TableHeaderCell>
              <TableHeaderCell>Nome</TableHeaderCell>
              <TableHeaderCell>Título sugerido da task</TableHeaderCell>
              <TableHeaderCell style={{ width: 150 }}>Activity (campo ADO)</TableHeaderCell>
              <TableHeaderCell style={{ width: 90 }}>Estimativa (h)</TableHeaderCell>
              <TableHeaderCell style={{ width: 90 }}>Padrão</TableHeaderCell>
              <TableHeaderCell style={{ width: 44 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.activities.map((a, i) => (
              <TableRow key={i}>
                <TableCell>
                  <input type="color" value={a.color} onChange={(e) => setActivity(i, { color: e.target.value })} style={{ width: 32, height: 24, border: "none", background: "none" }} />
                </TableCell>
                <TableCell>
                  <Input size="small" value={a.name} onChange={(_, d) => setActivity(i, { name: d.value })} style={{ width: "100%" }} />
                </TableCell>
                <TableCell>
                  <Input size="small" value={a.defaultTitle} onChange={(_, d) => setActivity(i, { defaultTitle: d.value })} style={{ width: "100%" }} />
                </TableCell>
                <TableCell>
                  <Input size="small" value={a.witActivity ?? ""} placeholder="Development" onChange={(_, d) => setActivity(i, { witActivity: d.value || undefined })} style={{ width: "100%" }} />
                </TableCell>
                <TableCell>
                  <Input size="small" type="number" min={0} step={0.5} value={String(a.defaultEstimate)} onChange={(_, d) => setActivity(i, { defaultEstimate: Number(d.value) || 0 })} style={{ width: 70 }} />
                </TableCell>
                <TableCell>
                  <Checkbox checked={a.standard} onChange={(_, d) => setActivity(i, { standard: !!d.checked })} />
                </TableCell>
                <TableCell>
                  <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => set({ activities: s.activities.filter((_, j) => j !== i) })} aria-label="Remover" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Caption1 className={st.muted}>"Padrão" = criada pelo botão "Criar tasks padrão". "Activity" preenche Microsoft.VSTS.Common.Activity quando o valor existe no processo.</Caption1>
      </Section>

      <Section title="Tipos e apontamento">
        <div className={st.grid}>
          <ListField
            label="Gestores (e-mails)"
            value={s.managers}
            onChange={(v) => set({ managers: v })}
            hint="Além dos administradores de time: veem Time agora, timesheet/calendário de todos e as Configurações"
          />
          <ListField label="Tipos pai (US/Bug…)" value={s.parentTypes} onChange={(v) => set({ parentTypes: v })} hint="Separados por vírgula" />
          <Field label="Tipo de task">
            <Input value={s.taskType} onChange={(_, d) => set({ taskType: d.value })} />
          </Field>
          <Field label="Bloquear edição após (dias)">
            <Input type="number" min={0} value={String(s.lockDays)} onChange={(_, d) => set({ lockDays: Number(d.value) || 0 })} />
          </Field>
          <Field label="Meta diária (horas)">
            <Input type="number" min={0} step={0.5} value={String(s.dailyTargetHours)} onChange={(_, d) => set({ dailyTargetHours: Number(d.value) || 0 })} />
          </Field>
          <Switch label="Prefixar título da task com a atividade" checked={s.titleWithActivityPrefix} onChange={(_, d) => set({ titleWithActivityPrefix: d.checked })} />
          <Switch label="Registrar cada apontamento na discussão da task" checked={s.postComment} onChange={(_, d) => set({ postComment: d.checked })} />
          <Switch label='Mostrar aos gestores quem está com timer rodando ("Time agora")' checked={s.teamPresence} onChange={(_, d) => set({ teamPresence: d.checked })} />
        </div>
      </Section>

      <Section title="Estados">
        <div className={st.grid}>
          <Field label="Estado ao iniciar trabalho">
            <Input value={s.states.active} onChange={(_, d) => setStates({ active: d.value })} />
          </Field>
          <Field label="Estado ao concluir">
            <Input value={s.states.closed} onChange={(_, d) => setStates({ closed: d.value })} />
          </Field>
          <ListField label="Ativar automaticamente quando estiver em" value={s.states.autoActivateFrom} onChange={(v) => setStates({ autoActivateFrom: v })} />
          <ListField label="Estados fechados" value={s.states.closedStates} onChange={(v) => setStates({ closedStates: v })} />
          <ListField label="Estados oferecidos ao pausar" value={s.states.pauseStates} onChange={(v) => setStates({ pauseStates: v })} />
          <ListField label="US/Bug: ativar quando estiver em" value={s.states.parentAutoActivateFrom} onChange={(v) => setStates({ parentAutoActivateFrom: v })} />
          <Field label="US/Bug: estado ativo">
            <Input value={s.states.parentActive} onChange={(_, d) => setStates({ parentActive: d.value })} />
          </Field>
          <Field label="Apontar em task fechada">
            <RadioGroup value={s.states.closedPolicy} onChange={(_, d) => setStates({ closedPolicy: d.value as StateSettings["closedPolicy"] })}>
              <Radio value="confirm" label="Pedir confirmação e reabrir" />
              <Radio value="block" label="Bloquear" />
            </RadioGroup>
          </Field>
        </div>
      </Section>

      <ErrorBar error={error} />
      {saved && (
        <MessageBar intent="success">
          <MessageBarBody>Configurações salvas.</MessageBarBody>
        </MessageBar>
      )}
      <div className={st.actions}>
        <Button appearance="primary" icon={<SaveRegular />} disabled={busy} onClick={save}>
          Salvar
        </Button>
        <Button icon={<ArrowResetRegular />} onClick={() => set(structuredClone(DEFAULT_SETTINGS))}>
          Restaurar padrão
        </Button>
      </div>

      <MigrationSection
        ctx={ctx}
        onSettingsImported={(imported) => {
          setS(structuredClone(imported));
          onSaved(imported);
        }}
      />
    </div>
  );
}
