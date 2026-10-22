import { Badge, Button, Caption1, Spinner, Text, Title3, Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular, PlayRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { canEdit, deleteEntry, editEntry, logTime, pauseTimer, resumeTimer, startTimer, stopTimer, type Ctx } from "../common/actions";
import { listByRange } from "../common/data/entriesRepo";
import { lastEntryByWorkItem, sum } from "../common/domain/aggregate";
import { addDays, daysBetween, formatDateBr, formatMinutes, toLocalDate, toLocalTime, weekStart } from "../common/domain/time";
import { buildTodayTree, groupByParent, idleTasks, type ParentRef, type TodayGroup } from "../common/domain/tree";
import type { Settings, TaskInfo, TimeEntry } from "../common/domain/types";
import { ErrorBar, Section, StateBadge, TimerControls, WorkItemLink } from "../common/ui/components";
import { useCtx, useRunner, useTimer, useTrackerEvents } from "../common/ui/hooks";
import { getChildren, getWorkItems, myTasksInStates } from "../common/wit/witService";

/** Active tasks without an entry for this many days are listed as "sem apontamento recente". */
const FORGOTTEN_DAYS = 3;

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } as const;

const useStyles = makeStyles({
  root: { padding: "16px 24px 32px", display: "flex", flexDirection: "column", gap: "8px", color: tokens.colorNeutralForeground1, maxWidth: "1100px" },
  top: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" },
  card: { padding: "12px 16px", borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, display: "flex", flexDirection: "column", gap: "8px" },
  totals: { display: "flex", gap: "24px", alignItems: "baseline", flexWrap: "wrap" },
  big: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightHero700 },
  cols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" },
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
});

interface Data {
  entries: TimeEntry[];
  paused: TaskInfo[];
  forgotten: { task: TaskInfo; last?: string }[];
  parents: Map<number, ParentRef>;
  /** Current parent of each task logged today (read from the work item). */
  taskParent: Map<number, number | undefined>;
  /** My open tasks not logged today, per parent that has entries today. */
  idle: Map<number, TaskInfo[]>;
}

const EMPTY: Data = { entries: [], paused: [], forgotten: [], parents: new Map(), taskParent: new Map(), idle: new Map() };
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
  return { entries, paused, forgotten, parents, taskParent, idle };
}

/** Boards › "Meu tempo": the user's timer, today/week totals, paused and forgotten tasks, today's entries. */
export function MyTimeView() {
  const st = useStyles();
  const { ctx, error } = useCtx();
  const { timer, elapsedMs } = useTimer();
  const { busy, error: runError, run } = useRunner();
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
      <Title3>Meu tempo</Title3>
      <Caption1 className={st.muted}>
        {ctx.settings.chat.remindersEnabled && ctx.settings.chat.recipients.some((e) => e.toLowerCase() === ctx.user.email.toLowerCase())
          ? `Você recebe lembretes no Google Chat quando fica 1h sem apontamento (${ctx.settings.chat.workStart}–${ctx.settings.chat.workEnd}, almoço ${ctx.settings.chat.lunchStart}–${ctx.settings.chat.lunchEnd}).`
          : "Lembretes do Google Chat desativados para você."}
      </Caption1>
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
              <Caption1 className={st.muted}> hoje</Caption1>
            </span>
            <span>
              <Text size={500} weight="semibold">
                {formatMinutes(weekMin)}
              </Text>
              <Caption1 className={st.muted}> na semana</Caption1>
            </span>
          </div>
          <div>
            <Button size="small" icon={<AddRegular />} disabled={busy} onClick={() => run(() => logTime(ctx, null))}>
              Apontar horas
            </Button>
          </div>
        </div>
      </div>

      <div className={st.cols}>
        <Section title={`Paradas (${data.paused.length})`}>
          <TaskTree
            empty={`Nenhuma task sua em ${ctx.settings.states.pauseStates.join("/")}.`}
            items={data.paused.map((t) => ({ task: t, note: <StateBadge state={t.state} settings={ctx.settings} /> }))}
            parents={data.parents}
            busy={busy}
            runningId={timer?.workItem.id}
            onStart={start}
          />
        </Section>
        <Section title={`Sem apontamento recente (${data.forgotten.length})`}>
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
        </Section>
      </div>

      <Section title={`Hoje · ${formatMinutes(todayMin)}`}>
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
      </Section>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  if (!type) return null;
  const t = type.toLowerCase();
  const color = t.includes("bug") ? "danger" : t.includes("technical") ? "informative" : t.includes("story") || t.includes("backlog") ? "brand" : "subtle";
  return (
    <Badge appearance="tint" color={color} size="small" style={{ flexShrink: 0 }}>
      {type}
    </Badge>
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
        <Text className={st.muted}>(sem item pai)</Text>
      )}
      {right}
    </div>
  );
}

function StartButton({ task, busy, runningId, onStart }: { task: TaskInfo; busy: boolean; runningId?: number; onStart: (t: TaskInfo) => void }) {
  return (
    <Tooltip content={runningId === task.id ? "Em andamento" : "Iniciar timer"} relationship="label">
      <Button size="small" appearance="subtle" icon={<PlayRegular />} disabled={busy || runningId === task.id} onClick={() => onStart(task)} />
    </Tooltip>
  );
}

/** Paradas / Sem apontamento recente: tasks under their parent. */
function TaskTree({ empty, items, parents, busy, runningId, onStart }: {
  empty: string;
  items: { task: TaskInfo; note: React.ReactNode }[];
  parents: Map<number, ParentRef>;
  busy: boolean;
  runningId?: number;
  onStart: (t: TaskInfo) => void;
}) {
  const st = useStyles();
  if (!items.length) return <Caption1 className={st.muted}>{empty}</Caption1>;
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
                <StartButton task={task} busy={busy} runningId={runningId} onStart={onStart} />
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
  if (!groups.length) return <Caption1 className={st.muted}>Nenhum apontamento hoje.</Caption1>;
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
      <span className={st.comment} title={e.comment}>
        {e.comment}
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
