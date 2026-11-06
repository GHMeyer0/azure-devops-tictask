import type { StateSettings, TaskInfo } from "./types";

export type StartDecision =
  | { kind: "none" }
  | { kind: "activate"; to: string }
  | { kind: "reopen"; to: string } // task is closed: needs user confirmation
  | { kind: "blocked" }; // task is closed and policy forbids logging

/** What happens to the task state when work starts (timer or entry) on it. */
export function decideStart(state: string, s: StateSettings): StartDecision {
  if (isClosedState(state, s)) return s.closedPolicy === "block" ? { kind: "blocked" } : { kind: "reopen", to: s.active };
  if (state !== s.active && s.autoActivateFrom.includes(state)) return { kind: "activate", to: s.active };
  return { kind: "none" };
}

/** "Work in progress" states of the usual processes (Agile, Scrum, Basic, CMMI…), in order of preference. */
export const ACTIVE_STATES = ["Active", "In Progress", "Doing", "Committed"];
/** "Finished" states of the usual processes. */
export const CLOSED_STATES = ["Closed", "Done", "Completed", "Resolved"];

/**
 * The configured states as a work item type really has them (`existing`: the type's states). A
 * project with another process (e.g. Scrum: To Do / In Progress / Done, no Active or Stopped) gets
 * the equivalent state instead of a save the process refuses ("The field 'State' contains the value
 * 'Active' that is not in the list of supported values"). Unknown states (`existing` empty) keep
 * the configuration; with no equivalent either, the configured state is kept.
 */
export function adaptStates(s: StateSettings, existing: string[]): StateSettings {
  if (!existing.length) return s;
  const has = (x: string) => existing.includes(x);
  const pick = (configured: string, candidates: string[]) => (has(configured) ? configured : (candidates.find(has) ?? configured));
  return {
    ...s,
    active: pick(s.active, ACTIVE_STATES),
    closed: pick(s.closed, CLOSED_STATES),
    pauseStates: s.pauseStates.filter(has),
    parentActive: pick(s.parentActive, ACTIVE_STATES),
  };
}

export function isClosedState(state: string, s: StateSettings): boolean {
  return s.closedStates.includes(state);
}

/** Parent (US/Bug) state to apply when work starts on one of its tasks, if any. */
export function decideParentStart(parentState: string | undefined, s: StateSettings): string | null {
  if (!parentState || parentState === s.parentActive) return null;
  return s.parentAutoActivateFrom.includes(parentState) ? s.parentActive : null;
}

export interface Inconsistency {
  taskId: number;
  message: string;
}

/** Flags tasks whose state does not match their hours. */
export function findInconsistencies(tasks: TaskInfo[], lastEntryByTask: Map<number, string>, s: StateSettings, today: string, staleDays = 3): Inconsistency[] {
  const out: Inconsistency[] = [];
  for (const t of tasks) {
    if (isClosedState(t.state, s) && (t.remaining ?? 0) > 0) {
      out.push({ taskId: t.id, message: `#${t.id} está ${t.state} com Remaining ${t.remaining}h` });
    }
    if (t.state === s.active) {
      const last = lastEntryByTask.get(t.id);
      if (!last) out.push({ taskId: t.id, message: `#${t.id} está ${t.state} sem nenhum apontamento` });
      else if (dayDiff(last, today) > staleDays) out.push({ taskId: t.id, message: `#${t.id} está ${t.state} sem apontamento há ${dayDiff(last, today)} dias` });
    }
  }
  return out;
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
