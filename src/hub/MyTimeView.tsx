import { Button, Caption1, ProgressBar, Spinner, Text, Title3, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, PlayRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { canEdit, deleteEntry, editEntry, logTime, pauseTimer, resumeTimer, startTimer, stopTimer, type Ctx } from "../common/actions";
import { listByRange } from "../common/data/entriesRepo";
import { lastEntryByWorkItem, sum } from "../common/domain/aggregate";
import { addDays, daysBetween, formatDateBr, formatMinutes, toLocalDate, weekStart } from "../common/domain/time";
import type { TaskInfo, TimeEntry } from "../common/domain/types";
import { EntriesTable, ErrorBar, Section, StateBadge, TimerControls, WorkItemLink } from "../common/ui/components";
import { useCtx, useRunner, useTimer, useTrackerEvents } from "../common/ui/hooks";
import { myTasksInStates } from "../common/wit/witService";

/** Active tasks without an entry for this many days are listed as "sem apontamento recente". */
const FORGOTTEN_DAYS = 3;

const useStyles = makeStyles({
  root: { padding: "16px 24px 32px", display: "flex", flexDirection: "column", gap: "8px", color: tokens.colorNeutralForeground1, maxWidth: "1100px" },
  top: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" },
  card: { padding: "12px 16px", borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, display: "flex", flexDirection: "column", gap: "8px" },
  totals: { display: "flex", gap: "24px", alignItems: "baseline", flexWrap: "wrap" },
  big: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightHero700 },
  cols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" },
  item: { display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  itemText: { display: "flex", flexDirection: "column", minWidth: 0, gap: "2px" },
  muted: { color: tokens.colorNeutralForeground3 },
});

interface Data {
  entries: TimeEntry[];
  paused: TaskInfo[];
  forgotten: { task: TaskInfo; last?: string }[];
}

async function loadData(ctx: Ctx): Promise<Data> {
  const today = toLocalDate(new Date());
  const [entries, paused, active] = await Promise.all([
    listByRange(ctx.projectId, addDays(today, -30), today, ctx.user.id),
    myTasksInStates(ctx.projectName, ctx.settings.taskType, ctx.settings.states.pauseStates),
    myTasksInStates(ctx.projectName, ctx.settings.taskType, [ctx.settings.states.active]),
  ]);
  const last = lastEntryByWorkItem(entries);
  const forgotten = active.map((task) => ({ task, last: last.get(task.id) })).filter((f) => !f.last || daysBetween(f.last, today) >= FORGOTTEN_DAYS);
  return { entries, paused, forgotten };
}

/** Boards › "Meu tempo": the user's timer, today/week totals, paused and forgotten tasks, today's entries. */
export function MyTimeView() {
  const st = useStyles();
  const { ctx, error } = useCtx();
  const { timer, elapsedMs } = useTimer();
  const { busy, error: runError, run } = useRunner();
  const [data, setData] = useState<Data | null>(null);

  const reload = useCallback(() => {
    if (ctx) loadData(ctx).then(setData).catch(() => setData({ entries: [], paused: [], forgotten: [] }));
  }, [ctx]);
  useEffect(reload, [reload]);
  useTrackerEvents(null, reload);

  if (error) return <ErrorBar error={error} />;
  if (!ctx || !data) return <Spinner label="Carregando…" style={{ marginTop: 48 }} />;

  const today = toLocalDate(new Date());
  const monday = weekStart(today);
  const todayEntries = data.entries.filter((e) => e.date === today);
  const todayMin = sum(todayEntries.map((e) => e.minutes));
  const weekMin = sum(data.entries.filter((e) => e.date >= monday).map((e) => e.minutes));
  const target = ctx.settings.dailyTargetHours * 60;
  const start = (t: TaskInfo) => run(() => startTimer(ctx, t));

  return (
    <div className={st.root}>
      <Title3>Meu tempo</Title3>
      <ErrorBar error={runError} />

      <div className={st.top}>
        <div className={st.card}>
          <Caption1 className={st.muted}>Timer</Caption1>
          {timer ? (
            <>
              <TimerControls
                timer={timer}
                elapsedMs={elapsedMs}
                busy={busy}
                onPause={() => run(() => pauseTimer(ctx, timer))}
                onResume={() => run(() => resumeTimer(ctx, timer))}
                onStop={() => run(() => stopTimer(ctx, timer))}
              />
              <Text>
                <WorkItemLink id={timer.workItem.id} title={timer.workItem.title} /> · {timer.activity}
                {timer.workItem.parentId ? <Caption1 className={st.muted}> · em #{timer.workItem.parentId} {timer.workItem.parentTitle}</Caption1> : null}
              </Text>
            </>
          ) : (
            <Caption1 className={st.muted}>Nenhum timer rodando. Inicie por uma task abaixo, pela tela do work item ou pelo painel do backlog.</Caption1>
          )}
        </div>

        <div className={st.card}>
          <Caption1 className={st.muted}>Horas</Caption1>
          <div className={st.totals}>
            <span>
              <span className={st.big}>{formatMinutes(todayMin)}</span>
              <Caption1 className={st.muted}> hoje / meta {formatMinutes(target)}</Caption1>
            </span>
            <span>
              <Text size={500} weight="semibold">
                {formatMinutes(weekMin)}
              </Text>
              <Caption1 className={st.muted}> na semana</Caption1>
            </span>
          </div>
          {target > 0 && <ProgressBar value={Math.min(1, todayMin / target)} color={todayMin >= target ? "success" : "brand"} thickness="large" />}
          <div>
            <Button size="small" icon={<AddRegular />} disabled={busy} onClick={() => run(() => logTime(ctx, null))}>
              Apontar horas
            </Button>
          </div>
        </div>
      </div>

      <div className={st.cols}>
        <Section title={`Paradas (${data.paused.length})`}>
          <TaskList
            empty={`Nenhuma task sua em ${ctx.settings.states.pauseStates.join("/")}.`}
            items={data.paused.map((t) => ({ task: t, note: <StateBadge state={t.state} settings={ctx.settings} /> }))}
            busy={busy}
            runningId={timer?.workItem.id}
            onStart={start}
          />
        </Section>
        <Section title={`Sem apontamento recente (${data.forgotten.length})`}>
          <TaskList
            empty={`Todas as suas tasks ${ctx.settings.states.active} tiveram apontamento nos últimos ${FORGOTTEN_DAYS} dias.`}
            items={data.forgotten.map((f) => ({ task: f.task, note: <Caption1 className={st.muted}>{f.last ? `último apontamento ${formatDateBr(f.last)}` : "nunca apontada"}</Caption1> }))}
            busy={busy}
            runningId={timer?.workItem.id}
            onStart={start}
          />
        </Section>
      </div>

      <Section title={`Hoje · ${formatMinutes(todayMin)}`}>
        <EntriesTable entries={todayEntries} showTask canEdit={(e) => canEdit(ctx, e)} onEdit={(e) => run(() => editEntry(ctx, e))} onDelete={(e) => run(() => deleteEntry(ctx, e))} />
      </Section>
    </div>
  );
}

function TaskList({ empty, items, busy, runningId, onStart }: {
  empty: string;
  items: { task: TaskInfo; note: React.ReactNode }[];
  busy: boolean;
  runningId?: number;
  onStart: (t: TaskInfo) => void;
}) {
  const st = useStyles();
  if (!items.length) return <Caption1 className={st.muted}>{empty}</Caption1>;
  return (
    <div>
      {items.map(({ task, note }) => (
        <div key={task.id} className={st.item}>
          <div className={st.itemText}>
            <Text size={300} truncate wrap={false}>
              <WorkItemLink id={task.id} title={task.title} />
            </Text>
            <span>{note}</span>
          </div>
          <Tooltip content={runningId === task.id ? "Em andamento" : "Iniciar timer"} relationship="label">
            <Button size="small" appearance="subtle" icon={<PlayRegular />} disabled={busy || runningId === task.id} onClick={() => onStart(task)} />
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
