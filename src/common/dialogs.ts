import { contributionId, hostLayout } from "./sdk";
import type { Settings, TaskInfo, TimeSegment, UserInfo } from "./domain/types";

// Dialogs open in the host frame (a form group iframe is too small to show them). The caller
// passes plain data, the dialog page (src/pages/dialog.tsx) returns the user's choices and the
// caller does the writes, so the work item open in the form is always saved through the form.

export interface LogDraft {
  date: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  minutes: number;
  segments: TimeSegment[];
  activity: string;
  comment: string;
}

export interface LogRequest {
  kind: "log";
  mode: "create" | "edit";
  /** null → the dialog shows a task picker (calendar). */
  task: TaskInfo | null;
  draft: LogDraft;
  /** Minutes of the entry being edited (to compute the Remaining delta). */
  previousMinutes?: number;
  settings: Settings;
  projectName: string;
  /** Duration comes from the timer (segments) and is not editable as a duration. */
  fromTimer?: boolean;
  /** Shown above the times (e.g. "filled with your timer's pause"). */
  note?: string;
  /** Pause state the task type has (e.g. Stopped), offered as "Parada" after logging. */
  pauseState?: string;
}

export type TaskAfter = "active" | "paused" | "closed";

export interface LogResult {
  task: TaskInfo;
  draft: LogDraft;
  /** Remaining typed by the user; undefined → computed from the current values when saving. */
  remaining?: number;
  estimate?: number;
  /** State of the task after logging: active, paused (pauseState) or closed. */
  after: TaskAfter;
  /** The pause state applied when `after` is "paused" (the request's pauseState). */
  pauseState?: string;
  /** Why the task was left paused (goes to the work item discussion). */
  reason?: string;
}

export interface NewTaskInput {
  activity: string;
  description: string;
  estimate?: number;
}

export interface StartRequest {
  kind: "start";
  purpose: "timer" | "log";
  parent: TaskInfo;
  children: TaskInfo[];
  me: UserInfo;
  settings: Settings;
}

export type StartResult =
  | { kind: "existing"; taskId: number; activity: string }
  | { kind: "new"; task: NewTaskInput; standard: NewTaskInput[] };

export interface StandardRequest {
  kind: "standard";
  parent: TaskInfo;
  children: TaskInfo[];
  settings: Settings;
}

export interface StandardResult {
  items: NewTaskInput[];
}

export type DialogRequest = LogRequest | StartRequest | StandardRequest;

type ResultOf<R extends DialogRequest> = R extends LogRequest ? LogResult : R extends StartRequest ? StartResult : R extends StandardRequest ? StandardResult : never;

export async function openDialog<R extends DialogRequest>(title: string, request: R): Promise<ResultOf<R> | undefined> {
  const layout = await hostLayout();
  return new Promise((resolve) => {
    layout.openCustomDialog<ResultOf<R>>(contributionId("time-dialog"), {
      title,
      configuration: { request },
      lightDismiss: false,
      onClose: (result) => resolve(result),
    });
  });
}
