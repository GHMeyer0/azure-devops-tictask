export type EntrySource = "timer" | "manual" | "calendar";

export interface TimeSegment {
  start: string; // ISO
  end: string; // ISO
}

/** Hours fields + state of a work item at a point in time. */
export interface WorkItemSnapshot {
  original: number | null;
  remaining: number | null;
  completed: number | null;
  state: string;
}

export interface EntryChange {
  at: string;
  by: string;
  action: "create" | "update" | "delete" | "import";
  detail: string;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  workItemId: number;
  workItemTitle: string;
  workItemType: string;
  parentId?: number;
  parentTitle?: string;
  userId: string;
  userName: string;
  userEmail: string;
  /** Local day (yyyy-MM-dd) the work was done. */
  date: string;
  start: string;
  end: string;
  minutes: number;
  /** Worked intervals; more than one means the timer was paused. */
  segments: TimeSegment[];
  activity: string;
  comment: string;
  source: EntrySource;
  before?: WorkItemSnapshot;
  after?: WorkItemSnapshot;
  parentStateAtStart?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  history: EntryChange[];
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  /** Why the task was paused or what comes after it was concluded (see Settings.states.reasons). */
  reason?: string;
  reasonDetail?: string;
  __etag?: number;
}

export interface TimerSegment {
  start: string;
  end?: string;
}

export interface WorkItemRef {
  id: number;
  title: string;
  type: string;
  parentId?: number;
  parentTitle?: string;
}

/**
 * The user's running timer. Since 0.7.0 pausing logs the time and clears the timer, so a timer has
 * one open segment. Timers saved by older versions may still be "paused" or have several segments:
 * pausing or concluding them logs all their segments.
 */
export interface ActiveTimer {
  id: "active";
  projectId: string;
  workItem: WorkItemRef;
  activity: string;
  comment: string;
  status: "running" | "paused";
  segments: TimerSegment[];
  stateAtStart?: string;
  parentStateAtStart?: string;
  /** Older versions only. */
  pauses?: { at: string; state?: string; reason?: string }[];
  /** When this version was saved (see data/timerRepo). */
  savedAt?: string;
  __etag?: number;
}

/** Reason offered when pausing ("Aguardando revisão") or as the next step when concluding ("Enviado para revisão"). */
export interface ReasonDef {
  name: string;
  kind: "pause" | "conclude";
  /** Also comments on the parent US/Bug, not only on the task. */
  commentOnParent: boolean;
}

export interface ActivityDef {
  name: string;
  /** Value written to Microsoft.VSTS.Common.Activity on created tasks (if allowed by the process). */
  witActivity?: string;
  /** Suggested task title when creating a task for this activity. */
  defaultTitle: string;
  /** Part of the "standard tasks" set created under a US/Bug. */
  standard: boolean;
  defaultEstimate: number;
  color: string;
}

export interface StateSettings {
  /** State the task moves to when work starts. */
  active: string;
  /** Completed state used by "Concluir". */
  closed: string;
  /** Task states that move to `active` automatically when work starts. */
  autoActivateFrom: string[];
  /** Task states considered closed (logging requires confirmation/reopen). */
  closedStates: string[];
  /** State the task goes to when paused: the first one its type has (e.g. Stopped). */
  pauseStates: string[];
  reasons: ReasonDef[];
  /** A running timer past this many hours (or started on a previous day) is flagged as forgotten. */
  runningAlertHours: number;
  /** Paused tasks are highlighted after this many business days. */
  pausedAlertDays: number;
  closedPolicy: "confirm" | "block";
  /** Parent (US/Bug) states that move to `parentActive` when work starts on a child. */
  parentAutoActivateFrom: string[];
  parentActive: string;
}

export interface ChatSettings {
  /** Hourly "sem apontamento na última hora" reminder by DM. */
  remindersEnabled: boolean;
  /** E-mails that receive the reminder (they also need a DM with the Chat app). */
  recipients: string[];
  workStart: string; // "HH:mm"
  workEnd: string;
  lunchStart: string;
  lunchEnd: string;
  /** Gap reminders per person per day (the end-of-day total is sent regardless). */
  maxRemindersPerDay: number;
  /** Adds "O que fiz ontem" to the morning summary. */
  yesterdayInDaily: boolean;
}

export interface Settings {
  activities: ActivityDef[];
  parentTypes: string[];
  taskType: string;
  /** Prefix task titles with the activity name ("Revisão: Revisão de PR"). */
  titleWithActivityPrefix: boolean;
  /** Days after which an entry can no longer be edited/deleted. */
  lockDays: number;
  /** Also writes a line in the work item discussion for each entry. */
  postComment: boolean;
  /** Shares each user's timer status (running/paused, which task) with managers ("Time agora"). */
  teamPresence: boolean;
  /** Extra managers (e-mails) besides team administrators: see the team views and edit settings. */
  managers: string[];
  /** Read by the n8n workflows that talk to Google Chat (reminders and the daily summary). */
  chat: ChatSettings;
  states: StateSettings;
}

/**
 * Public copy of a user's timer, readable by the whole project (team view). "paused" is the task
 * the user paused last (the timer itself is gone), kept until the next timer starts.
 */
export interface Presence {
  id: string; // user id
  projectId: string;
  userName: string;
  userEmail: string;
  status: "running" | "paused";
  workItem: WorkItemRef;
  activity: string;
  segments: TimerSegment[];
  pausedState?: string;
  pausedReason?: string;
  updatedAt: string;
}

export interface UserInfo {
  id: string;
  displayName: string;
  email: string;
}

/** Fields of a task as read from the work item. */
export interface TaskInfo extends WorkItemSnapshot {
  id: number;
  title: string;
  type: string;
  assignedTo?: { displayName: string; email: string; id?: string };
  activity?: string;
  parentId?: number;
  areaPath?: string;
  iterationPath?: string;
  rev?: number;
  /** Microsoft.VSTS.Common.StateChangeDate (ISO), when read. */
  stateChangedAt?: string;
}
