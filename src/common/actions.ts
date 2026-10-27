import { emit } from "./events";
import { getSettings } from "./data/settingsRepo";
import { listByWorkItem, newEntryId, saveEntry } from "./data/entriesRepo";
import { listPresence, publishPaused } from "./data/presenceRepo";
import { clearTimer, getTimer, isOlder, readTimerDoc, saveTimer, timerOf } from "./data/timerRepo";
import { openDialog, type LogDraft, type LogResult, type NewTaskInput } from "./dialogs";
import { applyCreate, applyDelete, applyEdit, currentRemaining, needsEstimate } from "./domain/remaining";
import { buildTaskTitle, CORRECTION, findActivity, guessActivity, reasonsOf } from "./domain/settings";
import { decideParentStart, decideStart, isClosedState } from "./domain/state";
import { addMinutesToTime, combineLocal, daysBetween, firstOpenDate, formatDateBr, formatMinutes, minutesBetweenTimes, minutesToHours, segmentsMs, toLocalDate, toLocalTime } from "./domain/time";
import { closedSegments, isForgotten, MIN_LOG_MS } from "./domain/timer";
import { isAssignedTo } from "./domain/tree";
import type { ActiveTimer, Settings, TaskInfo, TimeEntry, TimeSegment, UserInfo, WorkItemSnapshot } from "./domain/types";
import { confirmDialog, getProject, getUser, messageDialog, toast } from "./sdk";
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
    return confirmDialog(`A task #${task.id} está ${task.state}. Apontar horas nela vai reabri-la. Continuar?`, "Reabrir task", "Reabrir e continuar");
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
 * Checked before any timer starts: the user's own timer elsewhere is paused first (its time is
 * logged), and the user is told when a teammate already has a timer on the same task. Returns false
 * when the user gives up.
 */
export async function ensureCanStart(ctx: Ctx, targetId?: number): Promise<boolean> {
  const existing = await getTimer();
  if (existing && existing.workItem.id !== targetId) {
    const entry = await pauseTimer(ctx, existing);
    if (!entry) return false;
    void toast(entry === true ? `#${existing.workItem.id} pausada.` : `#${existing.workItem.id} pausada: ${formatMinutes(entry.minutes)} apontados.`);
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
  const rework = await reworkTask(ctx, task);
  if (rework) return startTimer(ctx, rework, CORRECTION);
  if (!(await ensureCanStart(ctx, task.id))) return null;
  if (!(await confirmStart(ctx, task))) return null;

  // A process may require the estimate to start work (e.g. Original Estimate and Remaining
  // required from New to Active): ask for it first and save it before the state.
  if (startStateChange(ctx, task) && needsEstimate(task)) {
    const answer = await openDialog(`Estimativa #${task.id}`, { kind: "estimate", task, settings: ctx.settings, activity: activity ?? defaultActivityFor(ctx, task) });
    if (!answer) return null;
    await ctx.writer.apply(task.id, (current) => (needsEstimate(current) ? { original: answer.estimate, remaining: answer.estimate } : null));
  }
  let stateAtStart = task.state;
  await ctx.writer.apply(task.id, (current) => {
    stateAtStart = current.state;
    const to = startStateChange(ctx, current);
    if (!to) return null;
    // Remaining is required with the estimate when work starts: fill it from the estimate when empty.
    return current.remaining == null && current.original != null ? { state: to, remaining: currentRemaining(current) } : { state: to };
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
  });
  emit({ type: "workitems", workItemIds: [task.id, ...(task.parentId ? [task.parentId] : [])] });
  return timer;
}

/**
 * Starting on a task that was concluded with a next step (e.g. "Enviado para revisão"): the rework
 * asked in the review goes to the story's correction task, so the development estimate stays clean.
 * Returns that task (found or created), or null to go on with the task itself.
 */
async function reworkTask(ctx: Ctx, task: TaskInfo): Promise<TaskInfo | null> {
  const correction = findActivity(ctx.settings, CORRECTION);
  if (!correction || !task.parentId || !isClosedState(task.state, ctx.settings.states) || defaultActivityFor(ctx, task) === CORRECTION) return null;
  const last = (await listByWorkItem(ctx.projectId, task.id).catch((): TimeEntry[] => [])).filter((e) => !e.deleted).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
  const step = last?.reason && reasonsOf(ctx.settings, "conclude").some((r) => r.name === last.reason) ? last.reason : null;
  if (!step) return null;
  const use = await confirmDialog(
    `A task #${task.id} foi concluída como "${step}". Ajustes pedidos na revisão vão na task de ${CORRECTION} da história, ` +
      "para não misturar o retrabalho com a estimativa desta task.",
    "Task concluída",
    `Usar a task de ${CORRECTION}`,
    "Reabrir esta task",
  );
  if (!use) return null;
  const children = (await getChildren(task.parentId)).filter((c) => isTask(ctx, c));
  const mine = children.find((c) => !isClosedState(c.state, ctx.settings.states) && isAssignedTo(c, ctx.user) && defaultActivityFor(ctx, c) === CORRECTION);
  if (mine) return mine;
  const parent = await getWorkItem(task.parentId);
  const created = await createChildTask(ctx, parent, { activity: CORRECTION, description: "", estimate: correction.defaultEstimate });
  emit({ type: "workitems", workItemIds: [parent.id] });
  return created;
}

/** Timers paused by versions before 0.7.0: resuming adds a segment; pausing or concluding logs them all. */
export async function resumeTimer(ctx: Ctx, shown: ActiveTimer): Promise<ActiveTimer | null> {
  const timer = await currentTimer(shown);
  if (!timer) return null;
  const paused = timer.pauses?.at(-1)?.state;
  if (paused) {
    await ctx.writer.apply(timer.workItem.id, (current) => (current.state === paused ? { state: ctx.settings.states.active } : null));
    emit({ type: "workitems", workItemIds: [timer.workItem.id] });
  }
  return saveTimer({ ...timer, status: "running", segments: [...timer.segments, { start: now() }] });
}

/**
 * The timer as stored now, when it is still the one this screen shows. The timer is saved without
 * a version check, so a screen left open (another tab, another computer) must not overwrite a
 * timer that was paused or concluded elsewhere: it refreshes and tells the user instead.
 */
async function currentTimer(timer: ActiveTimer): Promise<ActiveTimer | null> {
  const doc = await readTimerDoc();
  // Read right after this screen saved it: the store still returns the previous version.
  if (isOlder(doc, timer.savedAt)) return timer;
  const current = timerOf(doc);
  const same =
    !!current &&
    current.workItem.id === timer.workItem.id &&
    current.status === timer.status &&
    current.segments.length === timer.segments.length &&
    current.segments[0]?.start === timer.segments[0]?.start;
  if (same) return current;
  emit({ type: "timer", timer: current });
  await messageDialog("O timer foi alterado em outra tela (pausado, concluído ou iniciado em outra task). Esta tela foi atualizada: confira e tente de novo.", "Timer atualizado");
  return null;
}

/** Configured pause states that the task type really has (a process may not have "Waiting"). */
async function pauseStatesFor(ctx: Ctx, type: string): Promise<string[]> {
  const existing = await workItemTypeStates(ctx.projectName, type).catch((): string[] => []);
  return existing.length ? ctx.settings.states.pauseStates.filter((s) => existing.includes(s)) : ctx.settings.states.pauseStates;
}

function timerDraft(timer: ActiveTimer, segments: TimeSegment[]): LogDraft {
  return {
    date: toLocalDate(segments[0].start),
    startTime: toLocalTime(segments[0].start),
    endTime: toLocalTime(segments.at(-1)!.end),
    minutes: Math.max(1, Math.round(segmentsMs(segments) / 60_000)),
    segments,
    activity: timer.activity,
    comment: timer.comment,
  };
}

/**
 * "Pausar": "I'm leaving this task for now". Logs the time worked, takes it off the Remaining and
 * moves the task to the pause state (Stopped), where it shows in Paradas. One click, unless there is
 * something to confirm: a reason (`withReason`), the end of a forgotten timer, or the Remaining
 * (zeroed, or the task has no estimate). Returns the entry, true when there was nothing to log
 * (started by mistake), or null when the user cancels.
 */
export async function pauseTimer(ctx: Ctx, shown: ActiveTimer, withReason = false): Promise<TimeEntry | true | null> {
  const timer = await currentTimer(shown);
  if (!timer) return null;
  const segments = closedSegments(timer, now());
  const task = await getWorkItem(timer.workItem.id);
  const pauseState = (await pauseStatesFor(ctx, task.type))[0];

  if (segmentsMs(segments) < MIN_LOG_MS && !withReason) {
    // Started by mistake: nothing to log, the task goes back to where it was.
    const back = timer.stateAtStart ?? pauseState;
    await ctx.writer.apply(task.id, (current) => (back && current.state === ctx.settings.states.active ? { state: back } : null));
    await clearTimer(ctx.projectId);
    emit({ type: "workitems", workItemIds: [task.id] });
    return true;
  }

  let draft = timerDraft(timer, segments);
  let extra: { remaining?: number; estimate?: number; reason?: string; reasonDetail?: string } = {};
  const askEnd = isForgotten(timer, ctx.settings);
  const askHours = needsEstimate(task) || applyCreate(task, minutesToHours(draft.minutes)).remaining <= 0;
  if (withReason || askEnd || askHours) {
    const result = await openDialog(`Pausar #${task.id}`, { kind: "pause", task, draft, settings: ctx.settings, withReason, askEnd });
    if (!result) return null;
    if (result.conclude) return concludeTimer(ctx, timer);
    ({ draft, ...extra } = result);
  }
  const entry = await createEntry(ctx, { task, draft, close: false, ...extra }, "timer", {
    stateAtStart: timer.stateAtStart,
    parentStateAtStart: timer.parentStateAtStart,
    pauseState,
    pausing: true,
  });
  await clearTimer(ctx.projectId);
  await publishPaused(ctx.projectId, {
    workItem: timer.workItem,
    activity: timer.activity,
    pausedState: pauseState,
    pausedReason: reasonText(entry.reason, entry.reasonDetail) || undefined,
  }).catch((e) => console.warn("presence", e));
  return entry;
}

/**
 * "Concluir": "I finished this task". Opens the log dialog with the timer's time, Remaining
 * suggested as 0 and an optional next step; the task is closed. Cancelling keeps the timer running.
 */
export async function concludeTimer(ctx: Ctx, shown: ActiveTimer): Promise<TimeEntry | null> {
  const timer = await currentTimer(shown);
  if (!timer) return null;
  const task = await getWorkItem(timer.workItem.id);
  const note = isForgotten(timer, ctx.settings)
    ? `O timer está rodando desde ${formatDateBr(toLocalDate(timer.segments.at(-1)!.start))} ${toLocalTime(timer.segments.at(-1)!.start)}. Confira o horário de fim em "editar horário manualmente".`
    : undefined;
  const draft = timerDraft(timer, closedSegments(timer, now()));
  const result = await openDialog(`Concluir #${task.id}`, { kind: "log", mode: "create", task, draft, settings: ctx.settings, projectName: ctx.projectName, fromTimer: true, conclude: true, note });
  if (!result) return null;
  const entry = await createEntry(ctx, result, "timer", { stateAtStart: timer.stateAtStart, parentStateAtStart: timer.parentStateAtStart });
  await clearTimer(ctx.projectId);
  return entry;
}

// ---------------------------------------------------------------- entries

/** Opens the log dialog for a task (manual entry: work done without the timer). */
export async function logTime(ctx: Ctx, task: TaskInfo | null, preset?: Partial<LogDraft>, source: TimeEntry["source"] = "manual"): Promise<TimeEntry | null> {
  if (task && !(await confirmStart(ctx, task))) return null;
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
  const result = await openDialog(task ? `Apontar #${task.id}` : "Apontar horas", { kind: "log", mode: "create", task, draft, settings: ctx.settings, projectName: ctx.projectName });
  if (!result) return null;
  if (!task && !(await confirmStart(ctx, result.task))) return null;
  // Work logged without the timer: nobody is on the task now, so a task that starts here is left paused.
  const pauseState = (await pauseStatesFor(ctx, result.task.type))[0];
  return createEntry(ctx, result, source, { pauseState });
}

interface EntryOptions {
  stateAtStart?: string;
  parentStateAtStart?: string;
  /** The task's pause state (e.g. Stopped). */
  pauseState?: string;
  /** Logged by Pausar: the task always goes to `pauseState`. Otherwise only a task that starts here does. */
  pausing?: boolean;
}

/** "Aguardando revisão. PR !1234": the reason and its detail as one line. */
function reasonText(reason?: string, detail?: string): string {
  return [reason, detail].filter(Boolean).join(". ");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Writes Completed/Remaining/State on the task and stores the entry. */
export async function createEntry(ctx: Ctx, r: LogResult, source: TimeEntry["source"], opts: EntryOptions = {}): Promise<TimeEntry> {
  if (source !== "timer") assertOpenDate(ctx, r.draft.date);
  const hours = minutesToHours(r.draft.minutes);
  const reasonLine = reasonText(r.reason, r.reasonDetail);
  let laterState: string | undefined;
  const first = await ctx.writer.apply(r.task.id, (current) => {
    laterState = undefined;
    const upd = applyCreate(current, hours, r.estimate);
    const changes: FieldChanges = { completed: upd.completed, remaining: r.remaining ?? upd.remaining };
    if (upd.original !== undefined) changes.original = upd.original;
    const starts = startStateChange(ctx, current);
    const to = r.close ? ctx.settings.states.closed : opts.pausing ? opts.pauseState : starts && (opts.pauseState ?? starts);
    // A process may lock Original Estimate by state (e.g. read-only once Active), also inside the
    // save that sets it: the estimate goes first and the state in a second save.
    if (to && to !== current.state) {
      if (changes.original !== undefined) laterState = to;
      else changes.state = to;
    }
    const lines = [
      ctx.settings.postComment && `⏱ ${formatMinutes(r.draft.minutes)} · ${r.draft.activity} · ${r.draft.date} ${r.draft.startTime}–${r.draft.endTime}${r.draft.comment ? ` · ${escapeHtml(r.draft.comment)}` : ""}`,
      reasonLine && `${r.close ? "✓ Concluída" : "⏸ Pausada"}: ${escapeHtml(reasonLine)}`,
    ].filter(Boolean);
    if (lines.length) changes.history = lines.join("<br>");
    return changes;
  });
  const before = first.before;
  const pending = laterState;
  const after = pending ? (await ctx.writer.apply(r.task.id, (current) => (current.state === pending ? null : { state: pending }))).after : first.after;
  const parentStateAtStart = opts.parentStateAtStart ?? (await activateParent(ctx, before.parentId));
  const parent = await withParentTitle(before);
  const def = ctx.settings.states.reasons.find((d) => d.name === r.reason && d.kind === (r.close ? "conclude" : "pause"));
  if (def?.commentOnParent && before.parentId) {
    const line = `${r.close ? "✓" : "⏸"} #${before.id} ${before.title}${r.close ? " concluída" : ""} (${ctx.user.displayName}): ${reasonLine}`;
    // The task is already saved: a failure here must not lose the entry.
    await ctx.writer.apply(before.parentId, () => ({ history: escapeHtml(line) })).catch((e) => console.warn("parent comment", e));
  }
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
    before: { ...snapshot(before), state: opts.stateAtStart ?? before.state },
    after: snapshot(after),
    parentStateAtStart,
    createdAt: now(),
    createdBy: ctx.user.id,
    history: [{ at: now(), by: ctx.user.displayName, action: "create", detail: formatMinutes(r.draft.minutes) }],
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.reasonDetail ? { reasonDetail: r.reasonDetail } : {}),
  };
  const saved = await saveEntry(entry);
  emit({ type: "entries", workItemIds: [entry.workItemId, ...(entry.parentId ? [entry.parentId] : [])] });
  emit({ type: "workitems", workItemIds: [entry.workItemId, ...(entry.parentId ? [entry.parentId] : [])] });
  return saved;
}

function draftTimes(d: LogDraft): Pick<TimeEntry, "date" | "start" | "end" | "minutes" | "segments"> {
  const segments = d.segments.length ? d.segments : [{ start: combineLocal(d.date, d.startTime), end: combineLocal(d.date, d.endTime) }];
  return { date: d.date, start: segments[0].start, end: segments.at(-1)!.end, minutes: d.minutes, segments };
}

/** Entries older than the edit limit could never be corrected or deleted: refuse them (the dialog already blocks it). */
function assertOpenDate(ctx: Ctx, date: string): void {
  const first = firstOpenDate(ctx.settings.lockDays, toLocalDate(new Date()));
  if (date < first) throw new Error(`Apontamentos antes de ${formatDateBr(first)} não podem ser criados nem alterados (limite de ${ctx.settings.lockDays} dias em Configurações › Geral).`);
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
  if (draft.date !== entry.date) assertOpenDate(ctx, draft.date);
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
  // A timer running elsewhere is paused by startTimer, after the choice: cancelling here keeps it running.
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
