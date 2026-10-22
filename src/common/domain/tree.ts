import { sum } from "./aggregate";
import { isClosedState } from "./state";
import type { StateSettings, TaskInfo, TimeEntry, UserInfo } from "./types";

// "Meu tempo" shows tasks as a tree under their parent (Bug / User Story / Technical Story).

export interface ParentRef {
  id: number;
  /** Work item type; empty when the parent could not be read. */
  type: string;
  title: string;
}

export interface ParentGroup<T> {
  /** null = tasks without a parent ("(sem item pai)"), always the last group. */
  parent: ParentRef | null;
  items: T[];
}

const parentRef = (id: number, parents: Map<number, ParentRef>, fallbackTitle = ""): ParentRef => parents.get(id) ?? { id, type: "", title: fallbackTitle };

/** Groups items by parent, keeping the order in which parents first appear. */
export function groupByParent<T>(items: T[], parentIdOf: (item: T) => number | undefined, parents: Map<number, ParentRef>): ParentGroup<T>[] {
  const groups = new Map<number, ParentGroup<T>>();
  const orphans: T[] = [];
  for (const item of items) {
    const pid = parentIdOf(item);
    if (!pid) {
      orphans.push(item);
      continue;
    }
    let g = groups.get(pid);
    if (!g) groups.set(pid, (g = { parent: parentRef(pid, parents), items: [] }));
    g.items.push(item);
  }
  const out = [...groups.values()];
  if (orphans.length) out.push({ parent: null, items: orphans });
  return out;
}

export interface TodayTask {
  taskId: number;
  title: string;
  /** Today's entries of the task, by start time. */
  entries: TimeEntry[];
  minutes: number;
}

export interface TodayGroup {
  parent: ParentRef | null;
  minutes: number;
  tasks: TodayTask[];
  /** My other open tasks of this parent without entries today. */
  idle: TaskInfo[];
}

/**
 * Today's entries as parent → task → entries, with subtotals. The task's current parent
 * (`taskParent`, read from the work item) wins over the one stored in the entry, which is the
 * parent at the time of logging. Groups and tasks are ordered by their first entry of the day.
 */
export function buildTodayTree(
  entries: TimeEntry[],
  parents: Map<number, ParentRef>,
  taskParent: Map<number, number | undefined> = new Map(),
  idle: Map<number, TaskInfo[]> = new Map(),
): TodayGroup[] {
  const live = entries.filter((e) => !e.deleted).sort((a, b) => a.start.localeCompare(b.start));
  const parentIdOf = (e: TimeEntry) => (taskParent.has(e.workItemId) ? taskParent.get(e.workItemId) : e.parentId);
  const titles = new Map(live.filter((e) => e.parentId && e.parentTitle).map((e) => [e.parentId!, e.parentTitle!]));

  return groupByParent(live, parentIdOf, parents).map((g) => {
    const tasks = new Map<number, TodayTask>();
    for (const e of g.items) {
      let t = tasks.get(e.workItemId);
      if (!t) tasks.set(e.workItemId, (t = { taskId: e.workItemId, title: e.workItemTitle, entries: [], minutes: 0 }));
      t.entries.push(e);
      t.minutes += e.minutes;
    }
    const parent = g.parent && !g.parent.title ? { ...g.parent, title: titles.get(g.parent.id) ?? "" } : g.parent;
    const list = [...tasks.values()];
    return { parent, minutes: sum(list.map((t) => t.minutes)), tasks: list, idle: g.parent ? (idle.get(g.parent.id) ?? []) : [] };
  });
}

export function isAssignedTo(t: TaskInfo, me: UserInfo): boolean {
  const a = t.assignedTo;
  return !!a && ((!!a.id && a.id === me.id) || a.email.toLowerCase() === me.email.toLowerCase());
}

/** Children of a parent that are my open tasks and were not logged today. */
export function idleTasks(children: TaskInfo[], me: UserInfo, taskType: string, states: StateSettings, loggedToday: Set<number>): TaskInfo[] {
  return children.filter((c) => c.type === taskType && isAssignedTo(c, me) && !isClosedState(c.state, states) && !loggedToday.has(c.id));
}
