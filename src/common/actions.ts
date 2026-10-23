import { emit } from "./events";
import { getSettings } from "./data/settingsRepo";
import { listByRange, listByWorkItem, newEntryId, saveEntry } from "./data/entriesRepo";
import { listPresence } from "./data/presenceRepo";
import { clearTimer, getTimer, saveTimer } from "./data/timerRepo";
import { openDialog, type LogDraft, type LogResult, type NewTaskInput } from "./dialogs";
import { lastPause, pauseToLog, type Pause } from "./domain/pause";
import { applyCreate, applyDelete, applyEdit } from "./domain/remaining";
import { buildTaskTitle, findActivity, guessActivity } from "./domain/settings";
import { decideParentStart, decideStart, isClosedState } from "./domain/state";
import { addMinutesToTime, combineLocal, daysBetween, formatMinutes, minutesBetweenTimes, minutesToHours, segmentsMinutes, toLocalDate, toLocalTime } from "./domain/time";
import type { ActiveTimer, Settings, TaskInfo, TimeEntry, UserInfo, WorkItemSnapshot } from "./domain/types";
import { confirmDialog, getProject, getUser, messageDialog } from "./sdk";
import { createTask, getChildren, getWorkItem, titlesOf, workItemTypeStates, type FieldChanges } from "./wit/witService";
import { restWriter, type WorkItemWriter } from "./wit/writer";

/** Everything a view needs to act on behalf of the current user. */
export interface Ctx {
  projectId: string;
  projectName: string;
  user: UserInfo;
  settings: Settings;
  writer: WorkItemWriter;
}

export async function loadCtx(writer: WorkItemWriter = restWriter): Promise<Ctx> {
  const project = await getProject();
  return { projectId: project.id, projectName: project.name, user: getUser(), settings: await getSettings(project.id), writer };
}

const snapshot = (t: TaskInfo): WorkItemSnapshot => ({ original: t.original, remaining: t.remaining, completed: t.completed, state: t.state });
const now = () => new Date().toISOString();

export function isTask(ctx: Ctx, t: { type: string }): boolean {
  return t.type === ctx.settings.taskType;
}

export function defaultActivityFor(ctx: Ctx, task: TaskInfo): string {
  return guessActivity(ctx.settings, task.title, task.activity) ?? ctx.settings.activities[0]?.name ?? "";
}

/**
 * Asks what to do with the task state before work starts (closed task → reopen?).
 * Returns false when the user cancels or policy blocks it.
 */
async function confirmStart(ctx: Ctx, task: TaskInfo): Promise<boolean> {
  const decision = decideStart(task.state, ctx.settings.states);
  if (decision.kind === "blocked") {
    await messageDialog(`A task #${task.id} está ${task.state}. A configuração não permite apontar em tasks fechadas.`, "Task fechada");
    return false;
  }
  if (decision.kind === "reopen") {
    return confirmDialog(`A task #${task.id} está ${task.state}. Apontar horas vai reabri-la para ${decision.to}. Continuar?`, "Reabrir task", "Reabrir e continuar");
  }
  return true;
}

/** State change for the task when work starts on it (already confirmed). */
function startStateChange(ctx: Ctx, current: TaskInfo): string | undefined {
  const d = decideStart(current.state, ctx.settings.states);
  return d.kind === "activate" || d.kind === "reopen" ? d.to : undefined;
}

/** Moves the parent US/Bug to Active when it is still in a "proposed" state. */
async function activateParent(ctx: Ctx, parentId: number | undefined): Promise<string | undefined> {
  if (!parentId) return undefined;
  let stateAtStart: string | undefined;
  await ctx.writer.apply(parentId, (p) => {
    stateAtStart = p.state;
    const to = decideParentStart(p.state, ctx.settings.states);
    return to ? { state: to } : null;
  });
  return stateAtStart;
}

async function withParentTitle(task: TaskInfo): Promise<{ parentId?: number; parentTitle?: string }> {
  if (!task.parentId) return {};
  const titles = await titlesOf([task.parentId]);
  return { parentId: task.parentId, parentTitle: titles.get(task.parentId) };
}

// ---------------------------------------------------------------- timer

/**
 * Checked before any timer starts (and before the "O que você vai fazer?" dialog, so nothing is
 * created for nothing): the user's own timer elsewhere must be stopped first, and the user is told
 * when a teammate already has a timer on the same task. Returns false when the user gives up.
 */
export async function ensureCanStart(ctx: Ctx, targetId?: number): Promise<boolean> {
  const existing = await getTimer();
  if (existing && existing.workItem.id !== targetId) {
    const elapsed = formatMinutes(segmentsMinutes(existing.segments));
    const state = existing.status === "running" ? "rodando" : "pausado";
    const ok = await confirmDialog(
      `Você já tem um timer ${state} em #${existing.workItem.id} ${existing.workItem.title} (${elapsed}, ${existing.activity}). ` +
        "Só pode haver um timer por vez: para iniciar outro, o atual é encerrado e você aponta esse tempo antes " +
        '(no apontamento, escolha "Parada" para retomar a task depois pela lista Paradas).',
      "Já existe um timer",
      "Encerrar e apontar o atual",
      "Manter o atual",
    );
    if (!ok) return false;
    if (!(await stopTimer(ctx, existing))) return false;
  }
  if (targetId && ctx.settings.teamPresence) {
    const others = (await listPresence(ctx.projectId).catch(() => [])).filter((p) => p.id !== ctx.user.id && p.workItem.id === targetId && p.status === "running");
    if (others.length) {
      const names = others.map((p) => `${p.userName} (desde ${toLocalTime(p.segments.at(-1)?.start ?? p.updatedAt)})`).join(", ");
      return confirmDialog(`${names} já está com timer rodando em #${targetId}. Iniciar o seu também?`, "Timer de outra pessoa", "Iniciar mesmo assim");
    }
  }
  return true;
}

/** Starts the timer on a task (after ensureCanStart). Returns the new timer, or null when cancelled. */
export async function startTimer(ctx: Ctx, task: TaskInfo, activity?: string): Promise<ActiveTimer | null> {
  const existing = await getTimer();
  if (existing && existing.workItem.id === task.id) {
    return existing.status === "paused" ? resumeTimer(ctx, existing) : existing;
  }
  if (!(await ensureCanStart(ctx, task.id))) return null;
  if (!(await confirmStart(ctx, task))) return null;

  let stateAtStart = task.state;
  await ctx.writer.apply(task.id, (current) => {
    stateAtStart = current.state;
    const to = startStateChange(ctx, current);
    return to ? { state: to } : null;
  });
  const parentStateAtStart = await activateParent(ctx, task.parentId);
  const parent = await withParentTitle(task);

  const timer = await saveTimer({
    id: "active",
    projectId: ctx.projectId,
    workItem: { id: task.id, title: task.title, type: task.type, ...parent },
    activity: activity ?? defaultActivityFor(ctx, task),
    comment: "",
    status: "running",
    segments: [{ start: now() }],
    stateAtStart,
    parentStateAtStart,
    pauses: [],
  });
  emit({ type: "workitems", workItemIds: [task.id, ...(task.parentId ? [task.parentId] : [])] });
  return timer;
}

/**
 * The timer as stored now, when it is still the one this screen shows. The timer is saved without
 * a version check, so a screen left open (another tab, another computer) must not overwrite a
 * timer that was paused, resumed or stopped elsewhere: it refreshes and tells the user instead.
 */
async function currentTimer(timer: ActiveTimer): Promise<ActiveTimer | null> {
  const current = await getTimer();
  const same =
    !!current &&
    current.workItem.id === timer.workItem.id &&
    current.status === timer.status &&
    current.segments.length === timer.segments.length &&
    current.segments[0]?.start === timer.segments[0]?.start;
  if (same) return current;
  emit({ type: "timer", timer: current });
  await messageDialog("O timer foi alterado em outra tela (pausado, retomado ou parado). Esta tela foi atualizada: confira e tente de novo.", "Timer atualizado");
  return null;
}

/** Configured pause states that the task type really has (a process may not have "Waiting"). */
async function pauseStatesFor(ctx: Ctx, type: string): Promise<string[]> {
  const existing = await workItemTypeStates(ctx.projectName, type).catch((): string[] => []);
  return existing.length ? ctx.settings.states.pauseStates.filter((s) => existing.includes(s)) : ctx.settings.states.pauseStates;
}

/** Pauses with one click: the task state does not change (that is decided when the timer is ended). */
export async function pauseTimer(_ctx: Ctx, shown: ActiveTimer): Promise<ActiveTimer | null> {
  const timer = await currentTimer(shown);
  if (!timer) return null;
  const at = now();
  const segments = timer.segments.map((s) => (s.end ? s : { ...s, end: at }));
  return saveTimer({ ...timer, status: "paused", segments, pauses: [...(timer.pauses ?? []), { at }] });
}

export async function resumeTimer(ctx: Ctx, shown: ActiveTimer): Promise<ActiveTimer | null> {
  const timer = await currentTimer(shown);
  if (!timer) return null;
  const pause = await pendingPause(ctx, timer);
  const paused = timer.pauses?.at(-1)?.state;
  if (paused) {
    await ctx.writer.apply(timer.workItem.id, (current) => (current.state === paused ? { state: ctx.settings.states.active } : null));
    emit({ type: "workitems", workItemIds: [timer.workItem.id] });
  }
  const resumed = await saveTimer({ ...timer, status: "running", segments: [...timer.segments, { start: now() }] });
  if (pause) {
    const log = await confirmDialog(
      `Você ficou ${formatMinutes(pause.minutes)} pausado (${toLocalTime(pause.start)}–${toLocalTime(pause.end)}). Quer apontar esse tempo em outra task, como uma ajuda a um colega ou uma reunião? ` +
        'Para criar uma task na US de outra pessoa, use "Apontar" na US: o horário da pausa já vem preenchido.',
      "Apontar a pausa?",
      "Escolher a task",
      "Agora não",
    );
    if (log) await logTime(ctx, null, pauseDraft(pause), "manual", pauseNote(pause));
  }
  return resumed;
}

/** The timer's last pause, when it is worth logging on another item (see domain/pause). */
async function pendingPause(ctx: Ctx, timer: ActiveTimer | null): Promise<Pause | null> {
  const pause = lastPause(timer, now());
  if (!pause) return null;
  const date = toLocalDate(pause.start);
  const entries = await listByRange(ctx.projectId, date, date, ctx.user.id).catch(() => []);
  return pauseToLog(pause, entries, { start: ctx.settings.chat.lunchStart, end: ctx.settings.chat.lunchEnd });
}

const pauseDraft = (p: Pause): Partial<LogDraft> => ({ date: toLocalDate(p.start), startTime: toLocalTime(p.start), endTime: toLocalTime(p.end), minutes: p.minutes });
const pauseNote = (p: Pause) => `Horário preenchido com a pausa do seu timer (${toLocalTime(p.start)}–${toLocalTime(p.end)}).`;

/**
 * "Encerrar": closes the timer and opens the log dialog pre-filled with its segments, which also
 * asks how the task is left (in progress, paused/Stopped or done). Returns the entry or null.
 */
export async function stopTimer(ctx: Ctx, shown: ActiveTimer): Promise<TimeEntry | null> {
  const timer = await currentTimer(shown);
  if (!timer) return null;
  const at = now();
  const segments = timer.segments.map((s) => ({ start: s.start, end: s.end ?? at }));
  const minutes = Math.max(1, Math.round(segments.reduce((sum, s) => sum + (Date.parse(s.end) - Date.parse(s.start)), 0) / 60_000));
  const task = await getWorkItem(timer.workItem.id);
  const draft: LogDraft = {
    date: toLocalDate(segments[0].start),
    startTime: toLocalTime(segments[0].start),
    endTime: toLocalTime(segments.at(-1)!.end),
    minutes,
    segments,
    activity: timer.activity,
    comment: timer.comment,
  };
  const pauseState = (await pauseStatesFor(ctx, task.type))[0];
  const result = await openDialog(`Encerrar e apontar #${task.id}`, { kind: "log", mode: "create", task, draft, settings: ctx.settings, projectName: ctx.projectName, fromTimer: true, pauseState });
  if (!result) {
    const discard = await confirmDialog(`Descartar o tempo do timer (${formatMinutes(minutes)})? Ele não será apontado.`, "Descartar timer", "Descartar", "Manter timer");
    if (discard) await clearTimer(timer.projectId);
    return null;
  }
  const entry = await createEntry(ctx, result, "timer", { stateAtStart: timer.stateAtStart, parentStateAtStart: timer.parentStateAtStart });
  await clearTimer(timer.projectId);
  return entry;
}

// ---------------------------------------------------------------- entries

/**
 * Opens the log dialog for a task (manual entry). Without preset times, a pause of the user's
 * timer that was not logged yet fills them: logging help given to a teammate during the pause.
 */
export async function logTime(ctx: Ctx, task: TaskInfo | null, preset?: Partial<LogDraft>, source: TimeEntry["source"] = "manual", note?: string): Promise<TimeEntry | null> {
  if (task && !(await confirmStart(ctx, task))) return null;
  if (!preset?.startTime) {
    const timer = await getTimer().catch(() => null);
    // On the timer's own task the pause is not work to log there.
    const pause = task && task.id === timer?.workItem.id ? null : await pendingPause(ctx, timer);
    if (pause) {
      preset = { ...preset, ...pauseDraft(pause) };
      note = pauseNote(pause);
    }
  }
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60_000);
  const draft: LogDraft = {
    date: toLocalDate(end),
    startTime: toLocalTime(start.toISOString()),
    endTime: toLocalTime(end.toISOString()),
    minutes: 60,
    segments: [],
    activity: task ? defaultActivityFor(ctx, task) : (ctx.settings.activities[0]?.name ?? ""),
    comment: "",
    ...preset,
  };
  const pauseState = (await pauseStatesFor(ctx, task?.type ?? ctx.settings.taskType))[0];
  const result = await openDialog(task ? `Apontar #${task.id}` : "Apontar horas", { kind: "log", mode: "create", task, draft, settings: ctx.settings, projectName: ctx.projectName, note, pauseState });
  if (!result) return null;
  if (!task && !(await confirmStart(ctx, result.task))) return null;
  return createEntry(ctx, result, source);
}

/** Writes Completed/Remaining/State on the task and stores the entry. */
export async function createEntry(ctx: Ctx, r: LogResult, source: TimeEntry["source"], timerInfo?: { stateAtStart?: string; parentStateAtStart?: string }): Promise<TimeEntry> {
  const hours = minutesToHours(r.draft.minutes);
  const { before, after } = await ctx.writer.apply(r.task.id, (current) => {
    const upd = applyCreate(current, hours, r.estimate);
    const changes: FieldChanges = { completed: upd.completed, remaining: r.remaining ?? upd.remaining };
    if (upd.original !== undefined) changes.original = upd.original;
    const to = r.after === "closed" ? ctx.settings.states.closed : r.after === "paused" && r.pauseState ? r.pauseState : startStateChange(ctx, current);
    if (to && to !== current.state) changes.state = to;
    const lines = [
      ctx.settings.postComment && `⏱ ${formatMinutes(r.draft.minutes)} · ${r.draft.activity} · ${r.draft.date} ${r.draft.startTime}–${r.draft.endTime}${r.draft.comment ? ` · ${r.draft.comment}` : ""}`,
      r.after === "paused" && r.reason && `⏸ ${to}: ${r.reason}`,
    ].filter(Boolean);
    if (lines.length) changes.history = lines.join("<br>");
    return changes;
  });
  const parentStateAtStart = timerInfo?.parentStateAtStart ?? (await activateParent(ctx, before.parentId));
  const parent = await withParentTitle(before);
  const entry: TimeEntry = {
    id: newEntryId(),
    projectId: ctx.projectId,
    workItemId: before.id,
    workItemTitle: before.title,
    workItemType: before.type,
    ...parent,
    userId: ctx.user.id,
    userName: ctx.user.displayName,
    userEmail: ctx.user.email,
    ...draftTimes(r.draft),
    activity: r.draft.activity,
    comment: r.draft.comment,
    source,
    before: { ...snapshot(before), state: timerInfo?.stateAtStart ?? before.state },
    after: snapshot(after),
    parentStateAtStart,
    createdAt: now(),
    createdBy: ctx.user.id,
    history: [{ at: now(), by: ctx.user.displayName, action: "create", detail: formatMinutes(r.draft.minutes) }],
  };
  const saved = await saveEntry(entry);
  emit({ type: "entries", workItemIds: [entry.workItemId, ...(entry.parentId ? [entry.parentId] : [])] });
  emit({ type: "workitems", workItemIds: [entry.workItemId] });
  return saved;
}

function draftTimes(d: LogDraft): Pick<TimeEntry, "date" | "start" | "end" | "minutes" | "segments"> {
  const segments = d.segments.length ? d.segments : [{ start: combineLocal(d.date, d.startTime), end: combineLocal(d.date, d.endTime) }];
  return { date: d.date, start: segments[0].start, end: segments.at(-1)!.end, minutes: d.minutes, segments };
}

export function canEdit(ctx: Ctx, entry: TimeEntry, today = toLocalDate(new Date())): boolean {
  return entry.userId === ctx.user.id && !entry.deleted && daysBetween(entry.date, today) <= ctx.settings.lockDays;
}

export function draftOf(entry: TimeEntry): LogDraft {
  const startTime = toLocalTime(entry.start);
  let endTime = toLocalTime(entry.end);
  // A timer stopped within the same minute keeps start and end on the same HH:mm (the duration is
  // rounded up to 1 minute): show the end from the duration, or the dialog reports "fim antes do início".
  if (minutesBetweenTimes(startTime, endTime) <= 0 && entry.minutes > 0) endTime = addMinutesToTime(startTime, entry.minutes);
  return {
    date: entry.date,
    startTime,
    endTime,
    minutes: entry.minutes,
    // A single segment is just start/end; keep segments only when the timer was paused.
    segments: entry.segments.length > 1 ? entry.segments : [],
    activity: entry.activity,
    comment: entry.comment,
  };
}

export async function editEntry(ctx: Ctx, entry: TimeEntry): Promise<TimeEntry | null> {
  const task = await getWorkItem(entry.workItemId);
  const result = await openDialog(`Editar apontamento #${task.id}`, { kind: "log", mode: "edit", task, draft: draftOf(entry), previousMinutes: entry.minutes, settings: ctx.settings, projectName: ctx.projectName });
  if (!result) return null;
  return updateEntry(ctx, entry, result.draft, result.remaining);
}

/** Applies new times/activity/comment to an entry and the hours delta to the task. */
export async function updateEntry(ctx: Ctx, entry: TimeEntry, draft: LogDraft, remaining?: number): Promise<TimeEntry> {
  const { after } = await ctx.writer.apply(entry.workItemId, (current) => {
    if (draft.minutes === entry.minutes && remaining === undefined) return null;
    const upd = applyEdit(current, minutesToHours(entry.minutes), minutesToHours(draft.minutes));
    return { completed: upd.completed, remaining: remaining ?? upd.remaining };
  });
  const changes: string[] = [];
  if (draft.minutes !== entry.minutes) changes.push(`${formatMinutes(entry.minutes)} → ${formatMinutes(draft.minutes)}`);
  if (draft.date !== entry.date) changes.push(`data ${entry.date} → ${draft.date}`);
  if (draft.activity !== entry.activity) changes.push(`atividade ${entry.activity} → ${draft.activity}`);
  if (draft.comment !== entry.comment) changes.push("comentário");
  const updated: TimeEntry = {
    ...entry,
    ...draftTimes(draft),
    activity: draft.activity,
    comment: draft.comment,
    after: snapshot(after),
    updatedAt: now(),
    history: [...entry.history, { at: now(), by: ctx.user.displayName, action: "update", detail: changes.join(", ") || "horário" }],
  };
  const saved = await saveEntry(updated, entry);
  emit({ type: "entries", workItemIds: [entry.workItemId, ...(entry.parentId ? [entry.parentId] : [])] });
  emit({ type: "workitems", workItemIds: [entry.workItemId] });
  return saved;
}

/** Soft delete: keeps the document (compliance) and gives the hours back to the task. */
export async function deleteEntry(ctx: Ctx, entry: TimeEntry): Promise<boolean> {
  const ok = await confirmDialog(
    `Excluir o apontamento de ${formatMinutes(entry.minutes)} em #${entry.workItemId}? As horas saem do Completed e voltam para o Remaining. O registro fica no histórico de auditoria.`,
    "Excluir apontamento",
    "Excluir",
  );
  if (!ok) return false;
  await ctx.writer.apply(entry.workItemId, (current) => {
    const upd = applyDelete(current, minutesToHours(entry.minutes), !isClosedState(current.state, ctx.settings.states));
    return { completed: upd.completed, remaining: upd.remaining };
  });
  await saveEntry(
    { ...entry, deleted: true, deletedAt: now(), deletedBy: ctx.user.displayName, history: [...entry.history, { at: now(), by: ctx.user.displayName, action: "delete", detail: formatMinutes(entry.minutes) }] },
    entry,
  );
  emit({ type: "entries", workItemIds: [entry.workItemId, ...(entry.parentId ? [entry.parentId] : [])] });
  emit({ type: "workitems", workItemIds: [entry.workItemId] });
  return true;
}

// ---------------------------------------------------------------- parent (US/Bug)

export async function createChildTask(ctx: Ctx, parent: TaskInfo, input: NewTaskInput): Promise<TaskInfo> {
  const activity = findActivity(ctx.settings, input.activity);
  return createTask(ctx.projectName, {
    parent,
    title: buildTaskTitle(ctx.settings, input.activity, input.description),
    activityWit: activity?.witActivity,
    estimate: input.estimate,
    assignedToEmail: ctx.user.email,
    taskType: ctx.settings.taskType,
  });
}

/**
 * ▶ Iniciar / + Apontar on a US/Bug: asks which task (one of mine, or a new one from a
 * description), creates what is needed and starts the timer or opens the log dialog.
 */
export async function startOnParent(ctx: Ctx, parent: TaskInfo, purpose: "timer" | "log"): Promise<void> {
  if (purpose === "timer" && !(await ensureCanStart(ctx))) return;
  const children = (await getChildren(parent.id)).filter((c) => isTask(ctx, c));
  const choice = await openDialog(purpose === "timer" ? `Iniciar apontamento – #${parent.id}` : `Apontar horas – #${parent.id}`, {
    kind: "start",
    purpose,
    parent,
    children,
    me: ctx.user,
    settings: ctx.settings,
  });
  if (!choice) return;

  let task: TaskInfo;
  let activity: string;
  if (choice.kind === "existing") {
    task = children.find((c) => c.id === choice.taskId) ?? (await getWorkItem(choice.taskId));
    activity = choice.activity;
  } else {
    for (const s of choice.standard) await createChildTask(ctx, parent, s);
    task = await createChildTask(ctx, parent, choice.task);
    activity = choice.task.activity;
    emit({ type: "workitems", workItemIds: [parent.id] });
  }
  if (purpose === "timer") await startTimer(ctx, task, activity);
  else await logTime(ctx, task, { activity });
}

export async function createStandardTasks(ctx: Ctx, parent: TaskInfo): Promise<number> {
  const children = (await getChildren(parent.id)).filter((c) => isTask(ctx, c));
  const result = await openDialog(`Tasks padrão – #${parent.id}`, { kind: "standard", parent, children, settings: ctx.settings });
  if (!result?.items.length) return 0;
  for (const item of result.items) await createChildTask(ctx, parent, item);
  emit({ type: "workitems", workItemIds: [parent.id] });
  return result.items.length;
}

/** Entries of a task, or of all child tasks of a parent. */
export async function entriesFor(ctx: Ctx, item: TaskInfo, children?: TaskInfo[]): Promise<TimeEntry[]> {
  if (isTask(ctx, item) || !children) return listByWorkItem(ctx.projectId, item.id);
  const lists = await Promise.all([item.id, ...children.map((c) => c.id)].map((id) => listByWorkItem(ctx.projectId, id)));
  return lists.flat().sort((a, b) => b.start.localeCompare(a.start));
}
