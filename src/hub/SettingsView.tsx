import { Button, Caption1, Checkbox, Field, Input, MessageBar, MessageBarBody, Radio, RadioGroup, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, ArrowResetRegular, DeleteRegular, SaveRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import type { Ctx } from "../common/actions";
import { loadPeople } from "../common/data/people";
import { isManager } from "../common/data/roles";
import { saveSettings } from "../common/data/settingsRepo";
import { plainOptions, type PickOption } from "../common/domain/options";
import { DEFAULT_SETTINGS } from "../common/domain/settings";
import type { ActivityDef, Settings, StateSettings } from "../common/domain/types";
import { ErrorBar, Section } from "../common/ui/components";
import { useRunner } from "../common/ui/hooks";
import { allowedActivities, statesOfTypes, workItemTypes, workItemTypeStates } from "../common/wit/witService";
import { ChatSection } from "./ChatSection";
import { MigrationSection } from "./MigrationSection";
import { MultiPicker, Picker } from "./Pickers";

const useStyles = makeStyles({
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px 24px" },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: "flex", gap: "8px", marginTop: "16px" },
});

/** Options loaded from Azure DevOps; null while loading, [] when the request fails. */
function useOptions(load: () => Promise<PickOption[]>, key: string): PickOption[] | null {
  const [options, setOptions] = useState<PickOption[] | null>(null);
  useEffect(() => {
    let alive = true;
    setOptions(null);
    load()
      .then((o) => alive && setOptions(o))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return options;
}

const lower = (e: string) => e.trim().toLowerCase();

/** Project settings (stored once per project, shared by everyone). */
export function SettingsView({ ctx, onSaved }: { ctx: Ctx; onSaved: (s: Settings) => void }) {
  const st = useStyles();
  const [s, setS] = useState<Settings>(() => structuredClone(ctx.settings));
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useRunner();
  const set = (patch: Partial<Settings>) => (setS({ ...s, ...patch }), setSaved(false));
  const setStates = (patch: Partial<StateSettings>) => set({ states: { ...s.states, ...patch } });
  const setActivity = (i: number, patch: Partial<ActivityDef>) => set({ activities: s.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const types = useOptions(() => workItemTypes(ctx.projectName).then(plainOptions), ctx.projectName);
  const taskStates = useOptions(() => workItemTypeStates(ctx.projectName, s.taskType).then(plainOptions), `${ctx.projectName}/${s.taskType}`);
  const parentStates = useOptions(() => statesOfTypes(ctx.projectName, s.parentTypes).then(plainOptions), `${ctx.projectName}/${s.parentTypes.join("|")}`);
  const witActivities = useOptions(() => allowedActivities(ctx.projectName, s.taskType).then(plainOptions), `${ctx.projectName}/${s.taskType}`);
  const people = useOptions(
    () => loadPeople(ctx.projectId).then((list) => list.map((p) => ({ value: p.email, label: `${p.name} (${p.email})`, short: p.name }))),
    ctx.projectId,
  );

  const save = () =>
    run(async () => {
      // The tab is hidden from non-managers; checked again here because saving affects everyone.
      if (!(await isManager(ctx))) throw new Error("Somente gestores (administradores de time ou listados em Gestores) podem alterar as configurações.");
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
              <TableHeaderCell style={{ width: 170 }}>Activity (campo ADO)</TableHeaderCell>
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
                  <Picker size="small" ariaLabel="Activity (campo ADO)" options={witActivities} value={a.witActivity ?? ""} allowEmpty emptyText="(não preencher)" onChange={(v) => setActivity(i, { witActivity: v || undefined })} />
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
        <Caption1 className={st.muted}>"Padrão" = criada pelo botão "Criar tasks padrão". "Activity" preenche Microsoft.VSTS.Common.Activity das tasks criadas (valores do processo para {s.taskType}).</Caption1>
      </Section>

      <Section title="Tipos e apontamento">
        <div className={st.grid}>
          <Field label="Gestores" hint="Além dos administradores de time: veem Time agora, timesheet/calendário de todos e as Configurações">
            <MultiPicker ariaLabel="Gestores" options={people} values={s.managers} keyOf={lower} onChange={(v) => set({ managers: v.map(lower) })} placeholder="Só os administradores de time" />
          </Field>
          <Field label="Tipos pai (US/Bug…)">
            <MultiPicker ariaLabel="Tipos pai" options={types} values={s.parentTypes} onChange={(v) => set({ parentTypes: v })} />
          </Field>
          <Field label="Tipo de task">
            <Picker ariaLabel="Tipo de task" options={types} value={s.taskType} onChange={(v) => set({ taskType: v })} />
          </Field>
          <Field label="Bloquear edição após (dias)">
            <Input type="number" min={0} value={String(s.lockDays)} onChange={(_, d) => set({ lockDays: Number(d.value) || 0 })} />
          </Field>
          <Switch label="Prefixar título da task com a atividade" checked={s.titleWithActivityPrefix} onChange={(_, d) => set({ titleWithActivityPrefix: d.checked })} />
          <Switch label="Registrar cada apontamento na discussão da task" checked={s.postComment} onChange={(_, d) => set({ postComment: d.checked })} />
          <Switch label='Mostrar aos gestores quem está com timer rodando ("Time agora")' checked={s.teamPresence} onChange={(_, d) => set({ teamPresence: d.checked })} />
        </div>
      </Section>

      <Section title="Estados">
        <div className={st.grid}>
          <Field label="Estado ao iniciar trabalho">
            <Picker ariaLabel="Estado ao iniciar trabalho" options={taskStates} value={s.states.active} onChange={(v) => setStates({ active: v })} />
          </Field>
          <Field label="Estado ao concluir">
            <Picker ariaLabel="Estado ao concluir" options={taskStates} value={s.states.closed} onChange={(v) => setStates({ closed: v })} />
          </Field>
          <Field label="Ativar automaticamente quando estiver em">
            <MultiPicker ariaLabel="Ativar automaticamente quando estiver em" options={taskStates} values={s.states.autoActivateFrom} onChange={(v) => setStates({ autoActivateFrom: v })} />
          </Field>
          <Field label="Estados fechados">
            <MultiPicker ariaLabel="Estados fechados" options={taskStates} values={s.states.closedStates} onChange={(v) => setStates({ closedStates: v })} />
          </Field>
          <Field label="Estados oferecidos ao pausar">
            <MultiPicker ariaLabel="Estados oferecidos ao pausar" options={taskStates} values={s.states.pauseStates} onChange={(v) => setStates({ pauseStates: v })} />
          </Field>
          <Field label="US/Bug: ativar quando estiver em" hint="Estados dos tipos pai selecionados">
            <MultiPicker ariaLabel="US/Bug: ativar quando estiver em" options={parentStates} values={s.states.parentAutoActivateFrom} onChange={(v) => setStates({ parentAutoActivateFrom: v })} />
          </Field>
          <Field label="US/Bug: estado ativo">
            <Picker ariaLabel="US/Bug: estado ativo" options={parentStates} value={s.states.parentActive} onChange={(v) => setStates({ parentActive: v })} />
          </Field>
          <Field label="Apontar em task fechada">
            <RadioGroup value={s.states.closedPolicy} onChange={(_, d) => setStates({ closedPolicy: d.value as StateSettings["closedPolicy"] })}>
              <Radio value="confirm" label="Pedir confirmação e reabrir" />
              <Radio value="block" label="Bloquear" />
            </RadioGroup>
          </Field>
        </div>
      </Section>

      <ChatSection ctx={ctx} value={s.chat} onChange={(chat) => set({ chat })} />

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
