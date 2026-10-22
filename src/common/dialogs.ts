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
}

export interface LogResult {
  task: TaskInfo;
  draft: LogDraft;
  /** Remaining typed by the user; undefined → computed from the current values when saving. */
  remaining?: number;
  estimate?: number;
  closeTask: boolean;
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

export interface PauseRequest {
  kind: "pause";
  task: { id: number; title: string; state: string };
  settings: Settings;
}

export interface PauseResult {
  state?: string;
  reason?: string;
}

export type DialogRequest = LogRequest | StartRequest | StandardRequest | PauseRequest;

type ResultOf<R extends DialogRequest> = R extends LogRequest ? LogResult : R extends StartRequest ? StartResult : R extends StandardRequest ? StandardResult : PauseResult;

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
