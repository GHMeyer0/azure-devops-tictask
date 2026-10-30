import { Button, Caption1, Spinner, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, ArrowClockwiseRegular, PlayRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { isTask, logTime, startOnParent, startTimer } from "../common/actions";
import { formatHours } from "../common/domain/time";
import type { TaskInfo } from "../common/domain/types";
import { SDK } from "../common/sdk";
import { ErrorBar, Section, StateBadge, TimerControls, WorkItemLink } from "../common/ui/components";
import { useCtx, useRunner, useTimer, useTimerHandlers, useTrackerEvents } from "../common/ui/hooks";
import { getWorkItems, searchTasks } from "../common/wit/witService";

// The backlog calls workItemSelectionChanged on the object registered under the manifest's
// registeredObjectId. The host may look it up as soon as the handshake starts, so it is registered
// before SDK.init (registerBacklogPanelEarly) and again, after init, under the contribution ids
// as well, since hosts differ on which id they use.
const selectionListeners = new Set<(ids: number[]) => void>();
let lastSelection: number[] = [];

const panelObject = {
  workItemSelectionChanged: (items: unknown[]) => {
    lastSelection = (items ?? [])
      .map((i) => (typeof i === "number" ? i : Number((i as { id?: number; workItemId?: number }).id ?? (i as { workItemId?: number }).workItemId)))
      .filter((n) => Number.isFinite(n));
    selectionListeners.forEach((fn) => fn(lastSelection));
  },
};

export function registerBacklogPanelEarly(): void {
  SDK.register("tictaskBacklogPanel", panelObject);
  SDK.register("time-backlog-panel", panelObject);
}

export function registerBacklogPanel(): void {
  registerBacklogPanelEarly();
  SDK.register(SDK.getContributionId(), panelObject);
}

function useSelection(): number[] {
  const [ids, setIds] = useState(lastSelection);
  useEffect(() => {
    selectionListeners.add(setIds);
    return () => void selectionListeners.delete(setIds);
  }, []);
  return ids;
}

const useStyles = makeStyles({
  root: { padding: "8px 12px 16px", display: "flex", flexDirection: "column", gap: "4px" },
  card: { display: "flex", flexDirection: "column", gap: "6px", padding: "8px 10px", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  row: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" },
  item: { display: "flex", gap: "4px", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** Side panel on the product/sprint backlog: running timer, the selected item and my open tasks. */
export function PanelView() {
  const st = useStyles();
  const { ctx, error } = useCtx();
  const { timer, elapsedMs } = useTimer();
  const { busy, error: runError, run } = useRunner();
  const handlers = useTimerHandlers(ctx, timer, run);
  const selection = useSelection();
  const [selected, setSelected] = useState<TaskInfo[]>([]);
  const [mine, setMine] = useState<TaskInfo[] | null>(null);

  const loadSelected = useCallback(() => {
    if (!selection.length) return setSelected([]);
    getWorkItems(selection.slice(0, 5)).then(setSelected).catch(() => setSelected([]));
  }, [selection]);
  useEffect(loadSelected, [loadSelected]);

  const loadMine = useCallback(() => {
    if (!ctx) return;
    searchTasks(ctx.projectName, ctx.settings.taskType, ctx.settings.states.closedStates, "")
      .then((list) => setMine(list.slice(0, 10)))
      .catch(() => setMine([]));
  }, [ctx]);
  useEffect(loadMine, [loadMine]);
  useTrackerEvents(null, () => {
    loadSelected();
    loadMine();
  });

  if (error) return <ErrorBar error={error} />;
  if (!ctx) return <Spinner size="small" label="Carregando…" />;

  const start = (t: TaskInfo) => run(() => (isTask(ctx, t) ? startTimer(ctx, t) : startOnParent(ctx, t, "timer")));
  const log = (t: TaskInfo) => run(() => (isTask(ctx, t) ? logTime(ctx, t) : startOnParent(ctx, t, "log")));
  const canWork = (t: TaskInfo) => isTask(ctx, t) || ctx.settings.parentTypes.includes(t.type);

  return (
    <div className={st.root}>
      <Section title="Em andamento">
        {timer ? (
          <div className={st.card}>
            <TimerControls
              timer={timer}
              elapsedMs={elapsedMs}
              busy={busy}
              {...handlers}
            />
            <Text size={200}>
              <WorkItemLink id={timer.workItem.id} title={timer.workItem.title} /> · {timer.activity}
            </Text>
          </div>
        ) : (
          <Caption1 className={st.muted}>Nenhum timer rodando.</Caption1>
        )}
      </Section>
      <ErrorBar error={runError} />

      <Section title="Selecionado no backlog">
        {selected.length === 0 && <Caption1 className={st.muted}>Selecione um WI pai (US, Bug…) ou uma Task no backlog.</Caption1>}
        {selected.map((t) => (
          <div key={t.id} className={st.card}>
            <Text weight="semibold">
              <WorkItemLink id={t.id} title={t.title} />
            </Text>
            <div className={st.row}>
              <StateBadge state={t.state} settings={ctx.settings} />
              <Caption1>
                {t.type} · Est {formatHours(t.original)} · Compl {formatHours(t.completed ?? 0)} · Rest {formatHours(t.remaining)}
              </Caption1>
            </div>
            {canWork(t) ? (
              <div className={st.row}>
                <Button size="small" appearance="primary" icon={<PlayRegular />} disabled={busy} onClick={() => start(t)}>
                  Iniciar
                </Button>
                <Button size="small" icon={<AddRegular />} disabled={busy} onClick={() => log(t)}>
                  Apontar
                </Button>
              </div>
            ) : (
              <Caption1 className={st.muted}>Apontamento é feito em Tasks ou nos tipos {ctx.settings.parentTypes.join(", ")}.</Caption1>
            )}
          </div>
        ))}
      </Section>

      <Section
        title="Minhas tasks abertas"
        actions={
          <Tooltip content="Atualizar" relationship="label">
            <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={loadMine} />
          </Tooltip>
        }
      >
        {mine === null ? (
          <Spinner size="tiny" />
        ) : mine.length === 0 ? (
          <Caption1 className={st.muted}>Nenhuma task aberta atribuída a você.</Caption1>
        ) : (
          mine.map((t) => (
            <div key={t.id} className={st.item}>
              <Text size={200} truncate wrap={false} title={t.title} style={{ minWidth: 0, overflow: "hidden" }}>
                <WorkItemLink id={t.id} title={t.title} />
              </Text>
              <Tooltip content={timer?.workItem.id === t.id ? "Em andamento" : "Iniciar timer"} relationship="label">
                <Button size="small" appearance="subtle" icon={<PlayRegular />} disabled={busy || timer?.workItem.id === t.id} onClick={() => start(t)} />
              </Tooltip>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
