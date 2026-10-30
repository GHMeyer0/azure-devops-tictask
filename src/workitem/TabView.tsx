import {
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { AddRegular, ArrowClockwiseRegular, PlayRegular, TaskListAddRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { canEdit, createStandardTasks, deleteEntry, editEntry, entriesFor, isTask, logTime, startOnParent, startTimer, syncCompleted, type Ctx } from "../common/actions";
import { breakdown, lastEntryByWorkItem, sum } from "../common/domain/aggregate";
import { findActivity, guessActivity } from "../common/domain/settings";
import { findInconsistencies } from "../common/domain/state";
import { formatDateBr, formatHours, formatMinutes, toLocalDate } from "../common/domain/time";
import type { ActiveTimer, TaskInfo, TimeEntry } from "../common/domain/types";
import { BreakdownBars, CompletedMismatchBar, EntriesTable, ErrorBar, HoursSummary, Section, Stat, StateBadge, TimerControls, WorkItemLink } from "../common/ui/components";
import { useCtx, useRunner, useTimer, useTrackerEvents } from "../common/ui/hooks";
import { getChildren } from "../common/wit/witService";
import { sumHours } from "./GroupView";
import { useTimerHandlers, useWorkItemForm } from "./useWorkItemForm";

const useStyles = makeStyles({
  root: { padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: "4px" },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  cols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: "24px" },
  muted: { color: tokens.colorNeutralForeground3 },
  timerBox: { padding: "8px 12px", borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
});

/** "Apontamentos" tab: TaskView on tasks, ParentView on US/Bug. */
export function TabView() {
  const st = useStyles();
  const { info, isNew, writer } = useWorkItemForm();
  const { ctx, error } = useCtx(writer);
  if (error) return <ErrorBar error={error} />;
  if (isNew) return <Caption1 className={st.muted}>Salve o work item para apontar horas.</Caption1>;
  if (!info || !ctx) return <Spinner label="Carregando…" />;
  return <div className={st.root}>{isTask(ctx, info) ? <TaskView ctx={ctx} info={info} /> : <ParentView ctx={ctx} info={info} />}</div>;
}

function useEntries(ctx: Ctx, item: TaskInfo, children?: TaskInfo[] | null) {
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const load = useCallback(() => {
    if (children === null) return;
    entriesFor(ctx, item, children ?? undefined).then(setEntries).catch(() => setEntries([]));
  }, [ctx, item.id, children]);
  useEffect(load, [load]);
  useTrackerEvents([item.id, ...(children ?? []).map((c) => c.id)], load);
  return { entries, reload: load };
}

/** "Ajustar": Completed of each task back to the sum of its entries. */
function adjust(ctx: Ctx, run: (fn: () => Promise<unknown>) => Promise<void>) {
  return (ids: number[]) =>
    run(async () => {
      for (const id of ids) await syncCompleted(ctx, id);
    });
}

function TimerArea({ ctx, timer, elapsedMs, busy, run, here, onStart, onLog }: {
  ctx: Ctx;
  timer: ActiveTimer | null;
  elapsedMs: number;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  here: boolean;
  onStart: () => void;
  onLog: () => void;
}) {
  const st = useStyles();
  const handlers = useTimerHandlers(ctx, timer, run);
  return (
    <div className={st.row}>
      {timer && here ? (
        <div className={st.timerBox}>
          <TimerControls timer={timer} elapsedMs={elapsedMs} busy={busy} {...handlers} showTarget />
        </div>
      ) : (
        <Button appearance="primary" icon={<PlayRegular />} disabled={busy} onClick={onStart}>
          Iniciar
        </Button>
      )}
      <Button icon={<AddRegular />} disabled={busy} onClick={onLog}>
        Apontar
      </Button>
      {timer && !here && (
        <div className={st.timerBox}>
          <TimerControls timer={timer} elapsedMs={elapsedMs} busy={busy} {...handlers} showTarget />
        </div>
      )}
      {busy && <Spinner size="tiny" />}
    </div>
  );
}

function TaskView({ ctx, info }: { ctx: Ctx; info: TaskInfo }) {
  const st = useStyles();
  const { timer, elapsedMs } = useTimer();
  const { busy, error, run } = useRunner();
  const { entries } = useEntries(ctx, info);
  const colorOf = (label: string) => findActivity(ctx.settings, label)?.color;

  return (
    <>
      <div className={st.row}>
        <StateBadge state={info.state} settings={ctx.settings} />
        {info.activity && <Caption1 className={st.muted}>Activity: {info.activity}</Caption1>}
      </div>
      <HoursSummary fields={info} />
      {entries && <CompletedMismatchBar tasks={[info]} entries={entries} busy={busy} onAdjust={adjust(ctx, run)} />}
      <div style={{ marginTop: 12 }}>
        <TimerArea ctx={ctx} timer={timer} elapsedMs={elapsedMs} busy={busy} run={run} here={timer?.workItem.id === info.id} onStart={() => run(() => startTimer(ctx, info))} onLog={() => run(() => logTime(ctx, info))} />
      </div>
      <ErrorBar error={error} />

      <Section title={`Apontamentos${entries ? ` · ${formatMinutes(sum(entries.map((e) => e.minutes)))}` : ""}`}>
        {entries === null ? (
          <Spinner size="tiny" />
        ) : (
          <EntriesTable entries={entries} canEdit={(e) => canEdit(ctx, e)} onEdit={(e) => run(() => editEntry(ctx, e))} onDelete={(e) => run(() => deleteEntry(ctx, e))} />
        )}
      </Section>

      {entries && entries.length > 0 && (
        <div className={st.cols}>
          <Section title="Por pessoa">
            <BreakdownBars items={breakdown(entries, (e) => e.userName)} />
          </Section>
          <Section title="Por atividade">
            <BreakdownBars items={breakdown(entries, (e) => e.activity)} colorOf={colorOf} />
          </Section>
        </div>
      )}
    </>
  );
}

function ParentView({ ctx, info }: { ctx: Ctx; info: TaskInfo }) {
  const st = useStyles();
  const { timer, elapsedMs } = useTimer();
  const { busy, error, run } = useRunner();
  const [children, setChildren] = useState<TaskInfo[] | null>(null);
  const loadChildren = useCallback(() => {
    getChildren(info.id)
      .then((c) => setChildren(c.filter((t) => isTask(ctx, t))))
      .catch(() => setChildren([]));
  }, [ctx, info.id]);
  useEffect(loadChildren, [loadChildren]);
  useTrackerEvents([info.id, ...(children ?? []).map((c) => c.id)], loadChildren);
  const { entries } = useEntries(ctx, info, children);

  if (!children) return <Spinner label="Carregando tasks…" />;
  const totals = sumHours(children);
  const last = lastEntryByWorkItem(entries ?? []);
  const issues = findInconsistencies(children, last, ctx.settings.states, toLocalDate(new Date()));
  const myMinutes = sum((entries ?? []).filter((e) => e.userId === ctx.user.id).map((e) => e.minutes));
  const colorOf = (label: string) => findActivity(ctx.settings, label)?.color;
  const here = !!timer && (timer.workItem.id === info.id || timer.workItem.parentId === info.id);

  return (
    <>
      <HoursSummary fields={totals} extra={<><Stat label="Tasks" value={children.length} /><Stat label="Minhas horas" value={formatMinutes(myMinutes)} /></>} />
      <div style={{ marginTop: 12 }} className={st.row}>
        <TimerArea ctx={ctx} timer={timer} elapsedMs={elapsedMs} busy={busy} run={run} here={here} onStart={() => run(() => startOnParent(ctx, info, "timer"))} onLog={() => run(() => startOnParent(ctx, info, "log"))} />
        <Button appearance="subtle" icon={<TaskListAddRegular />} disabled={busy} onClick={() => run(() => createStandardTasks(ctx, info))}>
          Criar tasks padrão
        </Button>
        <Tooltip content="Atualizar" relationship="label">
          <Button appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={loadChildren} />
        </Tooltip>
      </div>
      <ErrorBar error={error} />
      {entries && <CompletedMismatchBar tasks={children} entries={entries} busy={busy} onAdjust={adjust(ctx, run)} />}
      {issues.length > 0 && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            {issues.map((i) => (
              <div key={i.message}>{i.message}</div>
            ))}
          </MessageBarBody>
        </MessageBar>
      )}

      <Section title="Tasks">
        {children.length === 0 ? (
          <Caption1 className={st.muted}>Nenhuma task ainda. Use "Iniciar" para criar uma a partir da descrição, ou "Criar tasks padrão".</Caption1>
        ) : (
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Task</TableHeaderCell>
                <TableHeaderCell style={{ width: 150 }}>Atividade</TableHeaderCell>
                <TableHeaderCell style={{ width: 150 }}>Responsável</TableHeaderCell>
                <TableHeaderCell style={{ width: 90 }}>Estado</TableHeaderCell>
                <TableHeaderCell style={{ width: 60 }}>Est.</TableHeaderCell>
                <TableHeaderCell style={{ width: 60 }}>Compl.</TableHeaderCell>
                <TableHeaderCell style={{ width: 60 }}>Rest.</TableHeaderCell>
                <TableHeaderCell style={{ width: 90 }}>Último</TableHeaderCell>
                <TableHeaderCell style={{ width: 72 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <WorkItemLink id={t.id} title={t.title} />
                  </TableCell>
                  <TableCell>{guessActivity(ctx.settings, t.title, t.activity) ?? "—"}</TableCell>
                  <TableCell>{t.assignedTo?.displayName ?? "—"}</TableCell>
                  <TableCell>
                    <StateBadge state={t.state} settings={ctx.settings} />
                  </TableCell>
                  <TableCell>{formatHours(t.original)}</TableCell>
                  <TableCell>{formatHours(t.completed ?? 0)}</TableCell>
                  <TableCell>{formatHours(t.remaining)}</TableCell>
                  <TableCell>{last.get(t.id) ? formatDateBr(last.get(t.id)!) : "—"}</TableCell>
                  <TableCell>
                    <Tooltip content="Iniciar timer nesta task" relationship="label">
                      <Button size="small" appearance="subtle" icon={<PlayRegular />} disabled={busy} onClick={() => run(() => startTimer(ctx, t))} />
                    </Tooltip>
                    <Tooltip content="Apontar nesta task" relationship="label">
                      <Button size="small" appearance="subtle" icon={<AddRegular />} disabled={busy} onClick={() => run(() => logTime(ctx, t))} />
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {entries && entries.length > 0 && (
        <div className={st.cols}>
          <Section title="Por atividade">
            <BreakdownBars items={breakdown(entries, (e) => e.activity)} colorOf={colorOf} />
          </Section>
          <Section title="Por pessoa">
            <BreakdownBars items={breakdown(entries, (e) => e.userName)} />
          </Section>
        </div>
      )}

      <Section title="Linha do tempo">
        {entries === null ? (
          <Spinner size="tiny" />
        ) : (
          <EntriesTable entries={entries} showTask canEdit={(e) => canEdit(ctx, e)} onEdit={(e) => run(() => editEntry(ctx, e))} onDelete={(e) => run(() => deleteEntry(ctx, e))} />
        )}
      </Section>
    </>
  );
}
