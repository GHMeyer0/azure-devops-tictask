import {
  Body1,
  Button,
  Caption1,
  Checkbox,
  Input,
  Radio,
  RadioGroup,
  SpinButton,
  Switch,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title3,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowResetRegular,
  ArrowSyncRegular,
  ChatRegular,
  CheckmarkCircleRegular,
  DatabaseRegular,
  DeleteRegular,
  DismissRegular,
  SaveRegular,
  SettingsRegular,
  TagMultipleRegular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import type { Ctx } from "../common/actions";
import { loadPeople } from "../common/data/people";
import { isManager } from "../common/data/roles";
import { saveSettings } from "../common/data/settingsRepo";
import { plainOptions, type PickOption } from "../common/domain/options";
import { DEFAULT_SETTINGS } from "../common/domain/settings";
import type { ActivityDef, Settings, StateSettings } from "../common/domain/types";
import { ErrorBar } from "../common/ui/components";
import { useRunner } from "../common/ui/hooks";
import { allowedActivities, statesOfTypes, workItemTypes, workItemTypeStates } from "../common/wit/witService";
import { MigrationSection } from "./MigrationSection";
import { MultiPicker, Picker } from "./Pickers";
import { ChatSettingsSection } from "./settings/ChatSettings";
import { SettingRow, SettingsCard } from "./settings/layout";

const useStyles = makeStyles({
  layout: { display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: "24px", alignItems: "start", "@media (max-width: 900px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  nav: { position: "sticky", top: "8px" },
  content: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "960px", minWidth: 0 },
  header: { display: "flex", flexDirection: "column", gap: "4px" },
  muted: { color: tokens.colorNeutralForeground3 },
  footer: {
    position: "sticky",
    bottom: 0,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    padding: "12px 16px",
    marginTop: "8px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
  },
  status: { marginRight: "auto", display: "flex", alignItems: "center", gap: "6px" },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  colorInput: { width: "32px", height: "24px", border: "none", padding: 0, background: "none", cursor: "pointer" },
});

type SectionKey = "geral" | "atividades" | "estados" | "chat" | "dados";

const SECTIONS: { key: SectionKey; label: string; description: string; icon: React.ReactElement }[] = [
  { key: "geral", label: "Geral", description: "Quem administra, tipos de work item e regras de apontamento.", icon: <SettingsRegular /> },
  { key: "atividades", label: "Atividades", description: "Tipos de trabalho oferecidos ao apontar e as tasks padrão criadas nas US/Bugs.", icon: <TagMultipleRegular /> },
  { key: "estados", label: "Estados", description: "Como o estado da task e do item pai acompanha o apontamento.", icon: <ArrowSyncRegular /> },
  { key: "chat", label: "Google Chat", description: "Lembretes de apontamento e o resumo da manhã, enviados pelo n8n.", icon: <ChatRegular /> },
  { key: "dados", label: "Dados", description: "Exportar e importar apontamentos e configurações do projeto.", icon: <DatabaseRegular /> },
];

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

function readSection(): SectionKey {
  try {
    return (localStorage.getItem("tt-settings-section") as SectionKey) || "geral";
  } catch {
    return "geral";
  }
}

/** Project settings (stored once per project, shared by everyone; managers only). */
export function SettingsView({ ctx, onSaved, initialSection }: { ctx: Ctx; onSaved: (s: Settings) => void; initialSection?: SectionKey }) {
  const st = useStyles();
  const [original, setOriginal] = useState<Settings>(() => structuredClone(ctx.settings));
  const [s, setS] = useState<Settings>(() => structuredClone(ctx.settings));
  const [section, setSection] = useState<SectionKey>(() => initialSection ?? readSection());
  const [justSaved, setJustSaved] = useState(false);
  const { busy, error, run } = useRunner();
  const dirty = JSON.stringify(s) !== JSON.stringify(original);
  const set = (patch: Partial<Settings>) => (setS({ ...s, ...patch }), setJustSaved(false));
  const setStates = (patch: Partial<StateSettings>) => set({ states: { ...s.states, ...patch } });
  const setActivity = (i: number, patch: Partial<ActivityDef>) => set({ activities: s.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  useEffect(() => {
    try {
      localStorage.setItem("tt-settings-section", section);
    } catch {
      /* storage unavailable */
    }
  }, [section]);

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
      setS(clean);
      setOriginal(clean);
      onSaved(clean);
      setJustSaved(true);
    });

  const current = SECTIONS.find((x) => x.key === section)!;

  return (
    <div className={st.layout}>
      <TabList className={st.nav} vertical selectedValue={section} onTabSelect={(_, d) => setSection(d.value as SectionKey)}>
        {SECTIONS.map((x) => (
          <Tab key={x.key} value={x.key} icon={x.icon}>
            {x.label}
          </Tab>
        ))}
      </TabList>

      <div className={st.content}>
        <div className={st.header}>
          <Title3>{current.label}</Title3>
          <Body1 className={st.muted}>
            {current.description} Vale para todo o projeto {ctx.projectName}.
          </Body1>
        </div>

        {section === "geral" && (
          <>
            <SettingsCard title="Gestores" description="Administradores de time do projeto já são gestores.">
              <SettingRow first label="Gestores adicionais" description="Veem Time agora, timesheet e calendário de todos, e podem alterar estas configurações.">
                <MultiPicker ariaLabel="Gestores adicionais" options={people} values={s.managers} keyOf={lower} onChange={(v) => set({ managers: v.map(lower) })} placeholder="Nenhum além dos administradores" />
              </SettingRow>
            </SettingsCard>
            <SettingsCard title="Tipos de work item">
              <SettingRow first label="Tipos pai" description='Onde o "Iniciar" pergunta "O que você vai fazer?" e oferece as tasks padrão.'>
                <MultiPicker ariaLabel="Tipos pai" options={types} values={s.parentTypes} onChange={(v) => set({ parentTypes: v })} />
              </SettingRow>
              <SettingRow label="Tipo de task" description="Onde as horas são apontadas (Completed e Remaining).">
                <Picker ariaLabel="Tipo de task" options={types} value={s.taskType} onChange={(v) => set({ taskType: v })} />
              </SettingRow>
            </SettingsCard>
            <SettingsCard title="Apontamento">
              <SettingRow first label="Bloquear edição após" description="Dias depois da data do apontamento em que o autor ainda pode editar ou excluir.">
                <SpinButton aria-label="Dias para bloquear edição" min={0} max={90} value={s.lockDays} onChange={(_, d) => set({ lockDays: Math.max(0, d.value ?? (Number(d.displayValue) || 0)) })} style={{ width: 90 }} />
                <Text className={st.muted}>dias</Text>
              </SettingRow>
              <SettingRow label="Prefixar título da task" description='Tasks criadas pelo TicTask ficam como "Revisão: Revisão de PR".'>
                <Switch checked={s.titleWithActivityPrefix} onChange={(_, d) => set({ titleWithActivityPrefix: d.checked })} />
              </SettingRow>
              <SettingRow label="Registrar na discussão" description="Cada apontamento também vira uma linha na discussão da task.">
                <Switch checked={s.postComment} onChange={(_, d) => set({ postComment: d.checked })} />
              </SettingRow>
            </SettingsCard>
            <SettingsCard title="Visão do time">
              <SettingRow first label="Time agora" description="Gestores veem quem está com timer rodando ou pausado e em qual task. Desligado, o status de ninguém é compartilhado.">
                <Switch checked={s.teamPresence} onChange={(_, d) => set({ teamPresence: d.checked })} />
              </SettingRow>
            </SettingsCard>
          </>
        )}

        {section === "atividades" && (
          <SettingsCard
            title="Atividades"
            description={`"Padrão" = criada pelo botão "Criar tasks padrão". "Activity no ADO" preenche o campo Activity das tasks criadas (valores do processo para ${s.taskType}).`}
            action={
              <Button size="small" icon={<AddRegular />} onClick={() => set({ activities: [...s.activities, { name: "", defaultTitle: "", standard: false, defaultEstimate: 1, color: "#69797e" }] })}>
                Adicionar
              </Button>
            }
          >
            <Table size="small" aria-label="Atividades">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell style={{ width: 48 }}>Cor</TableHeaderCell>
                  <TableHeaderCell>Nome</TableHeaderCell>
                  <TableHeaderCell>Título sugerido da task</TableHeaderCell>
                  <TableHeaderCell style={{ width: 170 }}>Activity no ADO</TableHeaderCell>
                  <TableHeaderCell style={{ width: 96 }}>Estimativa</TableHeaderCell>
                  <TableHeaderCell style={{ width: 64 }}>Padrão</TableHeaderCell>
                  <TableHeaderCell style={{ width: 44 }} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.activities.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <input aria-label="Cor" type="color" className={st.colorInput} value={a.color} onChange={(e) => setActivity(i, { color: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input size="small" aria-label="Nome" value={a.name} onChange={(_, d) => setActivity(i, { name: d.value })} style={{ width: "100%" }} />
                    </TableCell>
                    <TableCell>
                      <Input size="small" aria-label="Título sugerido" value={a.defaultTitle} onChange={(_, d) => setActivity(i, { defaultTitle: d.value })} style={{ width: "100%" }} />
                    </TableCell>
                    <TableCell>
                      <Picker size="small" ariaLabel="Activity no ADO" options={witActivities} value={a.witActivity ?? ""} allowEmpty emptyText="(não preencher)" onChange={(v) => setActivity(i, { witActivity: v || undefined })} />
                    </TableCell>
                    <TableCell>
                      <SpinButton size="small" aria-label="Estimativa em horas" min={0} max={40} step={0.5} value={a.defaultEstimate} displayValue={`${a.defaultEstimate}h`} onChange={(_, d) => setActivity(i, { defaultEstimate: Math.max(0, d.value ?? (parseFloat(String(d.displayValue).replace(",", ".")) || 0)) })} style={{ width: 84 }} />
                    </TableCell>
                    <TableCell>
                      <Checkbox aria-label="Padrão" checked={a.standard} onChange={(_, d) => setActivity(i, { standard: !!d.checked })} />
                    </TableCell>
                    <TableCell>
                      <Tooltip content="Remover" relationship="label">
                        <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => set({ activities: s.activities.filter((_, j) => j !== i) })} />
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SettingsCard>
        )}

        {section === "estados" && (
          <>
            <SettingsCard title={`Task (${s.taskType})`} description="Ajuste conforme o processo (no Tiino: New, Active, Stopped e Closed). Na pausa, só são oferecidos os estados que o tipo de task tem.">
              <SettingRow first label="Ao iniciar trabalho" description="Estado para onde a task vai ao iniciar o timer ou apontar.">
                <Picker ariaLabel="Estado ao iniciar trabalho" options={taskStates} value={s.states.active} onChange={(v) => setStates({ active: v })} />
              </SettingRow>
              <SettingRow label="Ativar automaticamente quando estiver em" description="Nesses estados a task é ativada sem perguntar.">
                <MultiPicker ariaLabel="Ativar automaticamente quando estiver em" options={taskStates} values={s.states.autoActivateFrom} onChange={(v) => setStates({ autoActivateFrom: v })} />
              </SettingRow>
              <SettingRow label="Ao pausar, oferecer" description="Estados sugeridos no diálogo de pausa (opcional para quem pausa).">
                <MultiPicker ariaLabel="Estados oferecidos ao pausar" options={taskStates} values={s.states.pauseStates} onChange={(v) => setStates({ pauseStates: v })} />
              </SettingRow>
              <SettingRow label="Ao concluir" description='Estado aplicado quando "Concluir task" é marcado no apontamento.'>
                <Picker ariaLabel="Estado ao concluir" options={taskStates} value={s.states.closed} onChange={(v) => setStates({ closed: v })} />
              </SettingRow>
              <SettingRow label="Estados fechados" description="Apontar numa task nesses estados segue a regra abaixo.">
                <MultiPicker ariaLabel="Estados fechados" options={taskStates} values={s.states.closedStates} onChange={(v) => setStates({ closedStates: v })} />
              </SettingRow>
              <SettingRow label="Apontar em task fechada">
                <RadioGroup value={s.states.closedPolicy} onChange={(_, d) => setStates({ closedPolicy: d.value as StateSettings["closedPolicy"] })}>
                  <Radio value="confirm" label="Pedir confirmação e reabrir" />
                  <Radio value="block" label="Bloquear" />
                </RadioGroup>
              </SettingRow>
            </SettingsCard>
            <SettingsCard title="Item pai (US/Bug)" description="Estados dos tipos pai selecionados em Geral.">
              <SettingRow first label="Ativar quando estiver em" description="Ao começar o trabalho numa task filha, o item pai nesses estados é ativado.">
                <MultiPicker ariaLabel="Item pai: ativar quando estiver em" options={parentStates} values={s.states.parentAutoActivateFrom} onChange={(v) => setStates({ parentAutoActivateFrom: v })} />
              </SettingRow>
              <SettingRow label="Estado ativo" description="Estado aplicado ao item pai nesse caso.">
                <Picker ariaLabel="Item pai: estado ativo" options={parentStates} value={s.states.parentActive} onChange={(v) => setStates({ parentActive: v })} />
              </SettingRow>
            </SettingsCard>
          </>
        )}

        {section === "chat" && <ChatSettingsSection ctx={ctx} value={s.chat} onChange={(chat) => set({ chat })} />}

        {section === "dados" && (
          <MigrationSection
            ctx={ctx}
            onSettingsImported={(imported) => {
              setS(structuredClone(imported));
              setOriginal(structuredClone(imported));
              onSaved(imported);
            }}
          />
        )}

        <ErrorBar error={error} />
        {section !== "dados" && (
          <div className={st.footer}>
            <span className={st.status}>
              {dirty ? (
                <Caption1>Alterações não salvas</Caption1>
              ) : justSaved ? (
                <>
                  <CheckmarkCircleRegular className={st.ok} />
                  <Caption1>Configurações salvas</Caption1>
                </>
              ) : (
                <Caption1 className={st.muted}>Sem alterações</Caption1>
              )}
            </span>
            <Tooltip content="Volta tudo para os valores de fábrica (só grava ao salvar)" relationship="description">
              <Button appearance="subtle" icon={<ArrowResetRegular />} onClick={() => set(structuredClone(DEFAULT_SETTINGS))}>
                Restaurar padrão
              </Button>
            </Tooltip>
            <Button icon={<DismissRegular />} disabled={!dirty || busy} onClick={() => setS(structuredClone(original))}>
              Descartar
            </Button>
            <Button appearance="primary" icon={<SaveRegular />} disabled={!dirty || busy} onClick={save}>
              Salvar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
