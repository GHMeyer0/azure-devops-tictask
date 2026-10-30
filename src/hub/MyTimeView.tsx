import { Button, Caption1, Spinner, Text, Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { AddRegular, CalendarClockRegular, CheckmarkCircleRegular, DeleteRegular, EditRegular, PlayRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { canEdit, deleteEntry, editEntry, logTime, startTimer, type Ctx } from "../common/actions";
import { listByRange } from "../common/data/entriesRepo";
import { lastEntryByWorkItem, sum } from "../common/domain/aggregate";
import { addDays, businessDaysBetween, daysBetween, formatDateBr, formatMinutes, toLocalDate, toLocalTime, weekStart } from "../common/domain/time";
import { buildTodayTree, groupByParent, idleTasks, type ParentRef, type TodayGroup } from "../common/domain/tree";
import type { Settings, TaskInfo, TimeEntry } from "../common/domain/types";
import { entryNote, ErrorBar, StateBadge, TimerControls, TypeBadge, WorkItemLink } from "../common/ui/components";
import { EmptyState, PageCard } from "../common/ui/page";
import { useCtx, useRunner, useTimer, useTimerHandlers, useTrackerEvents } from "../common/ui/hooks";
import { getChildren, getWorkItems, myTasksInStates } from "../common/wit/witService";

/** Active tasks without an entry for this many days are listed as "sem apontamento recente". */
const FORGOTTEN_DAYS = 3;

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } as const;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "8px", color: tokens.colorNeutralForeground1, maxWidth: "1440px" },
  // min(…, 100%): on phones a single column never wider than the screen.
  top: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: "16px" },
  totals: { display: "flex", gap: "24px", alignItems: "baseline", flexWrap: "wrap" },
  big: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightHero700 },
  // Stacks below ~800px so long task titles are not cut in half on tablets.
  cols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))", gap: "16px" },
  muted: { color: tokens.colorNeutralForeground3 },
  // Tree: parent row, then children indented behind a guide line.
  group: { padding: "4px 0 6px", borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  parent: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0, padding: "2px 0" },
  parentTitle: { ...ellipsis, fontWeight: tokens.fontWeightSemibold },
  children: { marginLeft: "9px", paddingLeft: "12px", borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, display: "flex", flexDirection: "column" },
  task: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "8px", alignItems: "center", padding: "3px 0" },
  taskText: { display: "flex", flexDirection: "column", minWidth: 0, gap: "1px" },
  taskLine: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  ellipsis,
  subtotal: { marginLeft: "auto", paddingLeft: "8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: tokens.fontWeightSemibold },
  entry: {
    display: "grid",
    gridTemplateColumns: "104px 48px minmax(0, 150px) minmax(0, 1fr) 64px",
    gap: "8px",
    alignItems: "center",
    minHeight: "28px",
    fontSize: tokens.fontSizeBase200,
    "@media (max-width: 640px)": { gridTemplateColumns: "96px 44px minmax(0, 1fr) 64px" },
  },
  comment: { ...ellipsis, color: tokens.colorNeutralForeground2, "@media (max-width: 640px)": { display: "none" } },
  num: { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  idle: { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
  stale: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold },
});

interface Data {
  entries: TimeEntry[];
  paused: TaskInfo[];
  /** Reason of the last pause (from my last entry on the task), when given. */
  pauseReason: Map<number, string>;
  forgotten: { task: TaskInfo; last?: string }[];
  parents: Map<number, ParentRef>;
  /** Current parent of each task logged today (read from the work item). */
  taskParent: Map<number, number | undefined>;
  /** My open tasks not logged today, per parent that has entries today. */
  idle: Map<number, TaskInfo[]>;
}

const EMPTY: Data = { entries: [], paused: [], pauseReason: new Map(), forgotten: [], parents: new Map(), taskParent: new Map(), idle: new Map() };
const unique = (ids: (number | undefined)[]) => [...new Set(ids.filter((id): id is number => !!id))];

async function loadData(ctx: Ctx): Promise<Data> {
  const today = toLocalDate(new Date());
  const [entries, paused, active] = await Promise.all([
    listByRange(ctx.projectId, addDays(today, -30), today, ctx.user.id),
    myTasksInStates(ctx.projectName, ctx.settings.taskType, ctx.settings.states.pauseStates),
    myTasksInStates(ctx.projectName, ctx.settings.taskType, [ctx.settings.states.active]),
  ]);
  const last = lastEntryByWorkItem(entries);
  const forgotten = active.map((task) => ({ task, last: last.get(task.id) })).filter((f) => !f.last || daysBetween(f.last, today) >= FORGOTTEN_DAYS);
  const pauseReason = new Map<number, string>();
  for (const e of [...entries].sort((a, b) => b.end.localeCompare(a.end))) {
    if (pauseReason.has(e.workItemId) || e.deleted) continue;
    pauseReason.set(e.workItemId, [e.reason, e.reasonDetail].filter(Boolean).join(". "));
  }

  const todayEntries = entries.filter((e) => e.date === today);
  const loggedIds = unique(todayEntries.map((e) => e.workItemId));
  const loggedTasks = loggedIds.length ? await getWorkItems(loggedIds).catch(() => []) : [];
  const taskParent = new Map(loggedTasks.map((t) => [t.id, t.parentId]));
  const todayParentIds = unique(todayEntries.map((e) => (taskParent.has(e.workItemId) ? taskParent.get(e.workItemId) : e.parentId)));
  const parentIds = unique([...paused, ...forgotten.map((f) => f.task)].map((t) => t.parentId).concat(todayParentIds));

  const logged = new Set(loggedIds);
  const [parentItems, children] = await Promise.all([
    parentIds.length ? getWorkItems(parentIds).catch(() => []) : Promise.resolve([]),
    Promise.all(todayParentIds.map((id) => getChildren(id).then((c) => [id, c] as const, () => [id, [] as TaskInfo[]] as const))),
  ]);
  const parents = new Map(parentItems.map((p) => [p.id, { id: p.id, type: p.type, title: p.title }]));
  const idle = new Map(children.map(([id, c]) => [id, idleTasks(c, ctx.user, ctx.settings.taskType, ctx.settings.states, logged)]));
  return { entries, paused, pauseReason, forgotten, parents, taskParent, idle };
}

/** TicTask › "Meu tempo" tab: the user's timer, today/week totals, paused and forgotten tasks, today's entries. */
export function MyTimeView() {
  const st = useStyles();
  const { ctx, error } = useCtx();
  const { timer, elapsedMs } = useTimer();
  const { busy, error: runError, run } = useRunner();
  const handlers = useTimerHandlers(ctx, timer, run);
  const [data, setData] = useState<Data | null>(null);

  const reload = useCallback(() => {
    if (ctx) loadData(ctx).then(setData).catch(() => setData(EMPTY));
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
  const start = (t: TaskInfo) => run(() => startTimer(ctx, t));
  const tree = buildTodayTree(todayEntries, data.parents, data.taskParent, data.idle);

  return (
    <div className={st.root}>
      <Caption1 className={st.muted}>
        {ctx.settings.chat.remindersEnabled && ctx.settings.chat.recipients.some((e) => e.toLowerCase() === ctx.user.email.toLowerCase())
          ? `Você recebe lembretes no Google Chat quando fica 1h sem apontamento (${ctx.settings.chat.workStart}–${ctx.settings.chat.workEnd}, almoço ${ctx.settings.chat.lunchStart}–${ctx.settings.chat.lunchEnd}).`
          : "Lembretes do Google Chat desativados para você."}
      </Caption1>
      <ErrorBar error={runError} />

      <div className={st.top}>
        <PageCard title="Timer" compact>
          {timer ? (
            <>
              <TimerControls
                timer={timer}
                elapsedMs={elapsedMs}
                busy={busy}
                {...handlers}
              />
              <Text>
                <WorkItemLink id={timer.workItem.id} title={timer.workItem.title} /> · {timer.activity}
                {timer.workItem.parentId ? <Caption1 className={st.muted}> · em #{timer.workItem.parentId} {timer.workItem.parentTitle}</Caption1> : null}
              </Text>
            </>
          ) : (
            <Caption1 className={st.muted}>Nenhum timer rodando. Inicie por uma task abaixo, pela tela do work item ou pelo painel do backlog.</Caption1>
          )}
        </PageCard>

        <PageCard
          title="Horas"
          compact
          action={
            <Button size="small" icon={<AddRegular />} disabled={busy} onClick={() => run(() => logTime(ctx, null))}>
              Apontar horas
            </Button>
          }
        >
          <div className={st.totals}>
            <span>
              <span className={st.big}>{formatMinutes(todayMin)}</span>
              <Caption1 className={st.muted}> hoje</Caption1>
            </span>
            <span>
              <Text size={500} weight="semibold">
                {formatMinutes(weekMin)}
              </Text>
              <Caption1 className={st.muted}> na semana</Caption1>
            </span>
          </div>
        </PageCard>
      </div>

      <div className={st.cols}>
        <PageCard
          title={`Paradas (${data.paused.length})`}
          description={`Suas tasks em ${ctx.settings.states.pauseStates.join(" ou ")}: começadas, ninguém trabalhando nelas agora. Em destaque as paradas há ${ctx.settings.states.pausedAlertDays} dias úteis ou mais.`}
        >
          <TaskTree
            empty={`Nenhuma task sua em ${ctx.settings.states.pauseStates.join("/")}.`}
            items={data.paused.map((t) => ({ task: t, note: <PausedNote task={t} reason={data.pauseReason.get(t.id)} settings={ctx.settings} /> }))}
            parents={data.parents}
            busy={busy}
            runningId={timer?.workItem.id}
            onStart={start}
            startLabel="Retomar"
          />
        </PageCard>
        <PageCard title={`Sem apontamento recente (${data.forgotten.length})`} description={`Suas tasks ${ctx.settings.states.active} sem apontamento há ${FORGOTTEN_DAYS} dias ou mais.`}>
          <TaskTree
            empty={`Todas as suas tasks ${ctx.settings.states.active} tiveram apontamento nos últimos ${FORGOTTEN_DAYS} dias.`}
            items={data.forgotten.map((f) => ({
              task: f.task,
              note: (
                <>
                  <StateBadge state={f.task.state} settings={ctx.settings} />
                  <Caption1 className={st.muted}>{f.last ? `último apontamento ${formatDateBr(f.last)}` : "nunca apontada"}</Caption1>
                </>
              ),
            }))}
            parents={data.parents}
            busy={busy}
            runningId={timer?.workItem.id}
            onStart={start}
          />
        </PageCard>
      </div>

      <PageCard title={`Hoje · ${formatMinutes(todayMin)}`} description="Por WI pai → task → apontamentos. Suas outras tasks abertas do mesmo WI pai aparecem como não apontadas.">
        <TodayTree
          groups={tree}
          settings={ctx.settings}
          busy={busy}
          runningId={timer?.workItem.id}
          canEdit={(e) => canEdit(ctx, e)}
          onEdit={(e) => run(() => editEntry(ctx, e))}
          onDelete={(e) => run(() => deleteEntry(ctx, e))}
          onStart={start}
        />
      </PageCard>
    </div>
  );
}

/** Parent line of a tree group: type, #id and title (link), or "(sem item pai)". */
function ParentLine({ parent, right }: { parent: ParentRef | null; right?: React.ReactNode }) {
  const st = useStyles();
  return (
    <div className={st.parent}>
      {parent ? (
        <>
          <TypeBadge type={parent.type} />
          <span className={st.parentTitle}>
            <WorkItemLink id={parent.id} title={parent.title} />
          </span>
        </>
      ) : (
        <Text className={st.muted}>(sem WI pai)</Text>
      )}
      {right}
    </div>
  );
}

/** Paradas: state, reason of the last pause and for how long (highlighted past the configured limit). */
function PausedNote({ task, reason, settings }: { task: TaskInfo; reason?: string; settings: Settings }) {
  const st = useStyles();
  const days = task.stateChangedAt ? businessDaysBetween(toLocalDate(task.stateChangedAt), toLocalDate(new Date())) : null;
  return (
    <>
      <StateBadge state={task.state} settings={settings} />
      {reason && (
        <Caption1 className={st.ellipsis} title={reason}>
          {reason}
        </Caption1>
      )}
      {days !== null && (
        <Caption1 className={days >= settings.states.pausedAlertDays ? st.stale : st.muted} style={{ whiteSpace: "nowrap" }}>
          · {days === 0 ? "hoje" : days === 1 ? "há 1 dia útil" : `há ${days} dias úteis`}
        </Caption1>
      )}
    </>
  );
}

function StartButton({ task, busy, runningId, onStart, label = "Iniciar timer" }: { task: TaskInfo; busy: boolean; runningId?: number; onStart: (t: TaskInfo) => void; label?: string }) {
  return (
    <Tooltip content={runningId === task.id ? "Em andamento" : label} relationship="label">
      <Button size="small" appearance="subtle" icon={<PlayRegular />} disabled={busy || runningId === task.id} onClick={() => onStart(task)} />
    </Tooltip>
  );
}

/** Paradas / Sem apontamento recente: tasks under their parent. */
function TaskTree({ empty, items, parents, busy, runningId, onStart, startLabel }: {
  empty: string;
  items: { task: TaskInfo; note: React.ReactNode }[];
  parents: Map<number, ParentRef>;
  busy: boolean;
  runningId?: number;
  onStart: (t: TaskInfo) => void;
  startLabel?: string;
}) {
  const st = useStyles();
  if (!items.length) return <EmptyState icon={<CheckmarkCircleRegular />} title="Tudo em dia">{empty}</EmptyState>;
  return (
    <div>
      {groupByParent(items, (i) => i.task.parentId, parents).map((g) => (
        <div key={g.parent?.id ?? "none"} className={st.group}>
          <ParentLine parent={g.parent} />
          <div className={st.children}>
            {g.items.map(({ task, note }) => (
              <div key={task.id} className={st.task}>
                <div className={st.taskText}>
                  <span className={st.ellipsis}>
                    <WorkItemLink id={task.id} title={task.title} />
                  </span>
                  <span className={st.taskLine}>{note}</span>
                </div>
                <StartButton task={task} busy={busy} runningId={runningId} onStart={onStart} label={startLabel} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hoje: parent → task → today's entries, plus my other open tasks of the parent not logged today. */
function TodayTree({ groups, settings, busy, runningId, canEdit, onEdit, onDelete, onStart }: {
  groups: TodayGroup[];
  settings: Settings;
  busy: boolean;
  runningId?: number;
  canEdit: (e: TimeEntry) => boolean;
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
  onStart: (t: TaskInfo) => void;
}) {
  const st = useStyles();
  if (!groups.length)
    return (
      <EmptyState icon={<CalendarClockRegular />} title="Nenhum apontamento hoje">
        Inicie o timer numa task ou use "Apontar horas".
      </EmptyState>
    );
  return (
    <div>
      {groups.map((g) => (
        <div key={g.parent?.id ?? "none"} className={st.group}>
          <ParentLine parent={g.parent} right={<span className={st.subtotal}>{formatMinutes(g.minutes)}</span>} />
          <div className={st.children}>
            {g.tasks.map((t) => (
              <div key={t.taskId}>
                <div className={st.taskLine} style={{ padding: "3px 0" }}>
                  <span className={st.ellipsis}>
                    <WorkItemLink id={t.taskId} title={t.title} />
                  </span>
                  <span className={st.subtotal}>{formatMinutes(t.minutes)}</span>
                </div>
                <div className={st.children}>
                  {t.entries.map((e) => (
                    <EntryLine key={e.id} entry={e} editable={canEdit(e)} onEdit={onEdit} onDelete={onDelete} />
                  ))}
                </div>
              </div>
            ))}
            {g.idle.map((task) => (
              <div key={task.id} className={st.task}>
                <span className={st.taskLine}>
                  <span className={st.ellipsis}>
                    <WorkItemLink id={task.id} title={task.title} />
                  </span>
                  <StateBadge state={task.state} settings={settings} />
                  <Caption1 className={mergeClasses(st.idle, st.ellipsis)} style={{ flexShrink: 0 }}>
                    não apontada hoje
                  </Caption1>
                </span>
                <StartButton task={task} busy={busy} runningId={runningId} onStart={onStart} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EntryLine({ entry: e, editable, onEdit, onDelete }: { entry: TimeEntry; editable: boolean; onEdit: (e: TimeEntry) => void; onDelete: (e: TimeEntry) => void }) {
  const st = useStyles();
  const pauses = e.segments.length - 1;
  const segments = e.segments.map((s) => `${toLocalTime(s.start)}–${toLocalTime(s.end)}`).join(" · ");
  return (
    <div className={st.entry}>
      <span className={st.num} title={pauses > 0 ? `Trechos: ${segments}` : undefined}>
        {toLocalTime(e.start)}–{toLocalTime(e.end)}
        {pauses > 0 && <span className={st.muted}> ({pauses}p)</span>}
      </span>
      <Text size={200} weight="semibold" className={st.num}>
        {formatMinutes(e.minutes)}
      </Text>
      <span className={st.ellipsis} title={e.activity}>
        {e.activity}
      </span>
      <span className={st.comment} title={entryNote(e)}>
        {entryNote(e)}
      </span>
      <span>
        {editable && (
          <>
            <Tooltip content="Editar" relationship="label">
              <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => onEdit(e)} />
            </Tooltip>
            <Tooltip content="Excluir" relationship="label">
              <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => onDelete(e)} />
            </Tooltip>
          </>
        )}
      </span>
    </div>
  );
}
