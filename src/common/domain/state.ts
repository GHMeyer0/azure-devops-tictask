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

export function isClosedState(state: string, s: StateSettings): boolean {
  return s.closedStates.includes(state);
}

/** Parent (US/Bug) state to apply when work starts on one of its tasks, if any. */
export function decideParentStart(parentState: string | undefined, s: StateSettings): string | null {
  if (!parentState) return null;
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
