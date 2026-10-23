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
  /** Shown above the times. */
  note?: string;
  /** "Concluir" from the timer: the task is closed, Remaining is suggested as 0. */
  conclude?: boolean;
}

export interface LogResult {
  task: TaskInfo;
  draft: LogDraft;
  /** Remaining typed by the user; undefined → computed from the current values when saving. */
  remaining?: number;
  estimate?: number;
  /** Close the task (Concluir). */
  close: boolean;
  /** Next step given when concluding (a "conclude" reason, or free text) and its detail. */
  reason?: string;
  reasonDetail?: string;
}

/** Pausing when something must be confirmed: a reason, the end of a forgotten timer, or the Remaining. */
export interface PauseRequest {
  kind: "pause";
  task: TaskInfo;
  draft: LogDraft;
  settings: Settings;
  /** Opened from "Pausar com motivo…". */
  withReason: boolean;
  /** The timer looks forgotten: ask until when the user really worked. */
  askEnd: boolean;
}

/** Starting work on a task with no estimate (the process may require one to leave New). */
export interface EstimateRequest {
  kind: "estimate";
  task: TaskInfo;
  settings: Settings;
  /** Activity of the timer, for the suggested estimate. */
  activity: string;
}

export interface EstimateResult {
  /** Hours. */
  estimate: number;
}

export type PauseResult =
  | { conclude: true }
  | { conclude?: false; draft: LogDraft; remaining?: number; estimate?: number; reason?: string; reasonDetail?: string };

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

export type DialogRequest = LogRequest | PauseRequest | EstimateRequest | StartRequest | StandardRequest;

type ResultOf<R extends DialogRequest> = R extends LogRequest
  ? LogResult
  : R extends PauseRequest
    ? PauseResult
    : R extends EstimateRequest
    ? EstimateResult
    : R extends StartRequest
      ? StartResult
      : R extends StandardRequest
        ? StandardResult
        : never;

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
