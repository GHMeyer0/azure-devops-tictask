import { describe, expect, it } from "vitest";
import { plainOptions, withSavedOptions } from "../src/common/domain/options";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";
import { buildTodayTree, groupByParent, idleTasks, isAssignedTo, type ParentRef } from "../src/common/domain/tree";
import type { TaskInfo, TimeEntry } from "../src/common/domain/types";

const me = { id: "u1", displayName: "Ana", email: "Ana@x.com" };

function task(p: Partial<TaskInfo>): TaskInfo {
  return { id: 1, title: "T", type: "Task", state: "Active", original: 1, remaining: 1, completed: 0, assignedTo: { displayName: "Ana", email: "ana@x.com", id: "u1" }, ...p };
}

function entry(p: Partial<TimeEntry>): TimeEntry {
  return {
    id: Math.random().toString(36),
    projectId: "p",
    workItemId: 1,
    workItemTitle: "Task",
    workItemType: "Task",
    userId: "u1",
    userName: "Ana",
    userEmail: "ana@x.com",
    date: "2026-10-22",
    start: "2026-10-22T12:00:00.000Z",
    end: "2026-10-22T13:00:00.000Z",
    minutes: 60,
    segments: [],
    activity: "Testes",
    comment: "",
    source: "manual",
    createdAt: "2026-10-22T13:00:00.000Z",
    createdBy: "u1",
    history: [],
    ...p,
  };
}

const parents = new Map<number, ParentRef>([
  [100, { id: 100, type: "Bug", title: "Erro no login" }],
  [200, { id: 200, type: "User Story", title: "Nova tela" }],
]);

describe("groupByParent", () => {
  it("groups by parent in first-seen order, orphans last", () => {
    const tasks = [task({ id: 1, parentId: 200 }), task({ id: 2 }), task({ id: 3, parentId: 100 }), task({ id: 4, parentId: 200 })];
    const groups = groupByParent(tasks, (t) => t.parentId, parents);
    expect(groups.map((g) => g.parent?.id ?? null)).toEqual([200, 100, null]);
    expect(groups[0].items.map((t) => t.id)).toEqual([1, 4]);
    expect(groups[0].parent).toEqual({ id: 200, type: "User Story", title: "Nova tela" });
    expect(groups[2].items.map((t) => t.id)).toEqual([2]);
  });

  it("keeps parents that could not be read, by id", () => {
    const groups = groupByParent([task({ parentId: 999 })], (t) => t.parentId, parents);
    expect(groups[0].parent).toEqual({ id: 999, type: "", title: "" });
  });
});

describe("buildTodayTree", () => {
  const entries = [
    entry({ workItemId: 11, workItemTitle: "Correção", parentId: 100, start: "2026-10-22T14:00:00.000Z", minutes: 30 }),
    entry({ workItemId: 12, workItemTitle: "Tela", parentId: 200, start: "2026-10-22T11:00:00.000Z", minutes: 90 }),
    entry({ workItemId: 11, workItemTitle: "Correção", parentId: 100, start: "2026-10-22T12:00:00.000Z", minutes: 45 }),
    entry({ workItemId: 13, workItemTitle: "Avulsa", start: "2026-10-22T16:00:00.000Z", minutes: 15 }),
    entry({ workItemId: 14, workItemTitle: "Excluída", parentId: 100, minutes: 999, deleted: true }),
  ];

  it("nests parent → task → entries with subtotals", () => {
    const tree = buildTodayTree(entries, parents);
    expect(tree.map((g) => g.parent?.id ?? null)).toEqual([200, 100, null]);
    expect(tree.map((g) => g.minutes)).toEqual([90, 75, 15]);
    const bug = tree[1];
    expect(bug.tasks).toHaveLength(1);
    expect(bug.tasks[0].minutes).toBe(75);
    expect(bug.tasks[0].entries.map((e) => e.minutes)).toEqual([45, 30]); // by start time
    expect(tree[2].parent).toBeNull();
  });

  it("uses the task's current parent over the one stored in the entry", () => {
    const tree = buildTodayTree(entries, parents, new Map([[13, 200]]));
    expect(tree.find((g) => g.parent?.id === 200)!.tasks.map((t) => t.taskId)).toEqual([12, 13]);
    expect(tree.some((g) => g.parent === null)).toBe(false);
  });

  it("falls back to the parent title stored in the entry", () => {
    const tree = buildTodayTree([entry({ parentId: 300, parentTitle: "Story antiga" })], parents);
    expect(tree[0].parent).toEqual({ id: 300, type: "", title: "Story antiga" });
  });

  it("attaches idle tasks to their parent group", () => {
    const idle = new Map([[100, [task({ id: 15, parentId: 100 })]]]);
    const tree = buildTodayTree(entries, parents, new Map(), idle);
    expect(tree.find((g) => g.parent?.id === 100)!.idle.map((t) => t.id)).toEqual([15]);
    expect(tree.find((g) => g.parent?.id === 200)!.idle).toEqual([]);
  });
});

describe("idleTasks", () => {
  it("keeps my open tasks not logged today", () => {
    const children = [
      task({ id: 1 }), // logged today
      task({ id: 2 }),
      task({ id: 3, state: "Closed" }),
      task({ id: 4, assignedTo: { displayName: "Bruno", email: "bruno@x.com", id: "u2" } }),
      task({ id: 5, type: "Bug" }),
      task({ id: 6, assignedTo: undefined }),
      task({ id: 7, state: "Stopped", assignedTo: { displayName: "Ana", email: "ANA@X.COM" } }),
    ];
    expect(idleTasks(children, me, "Task", DEFAULT_SETTINGS.states, new Set([1])).map((t) => t.id)).toEqual([2, 7]);
  });

  it("matches the assignee by id or e-mail", () => {
    expect(isAssignedTo(task({ assignedTo: { displayName: "A", email: "other", id: "u1" } }), me)).toBe(true);
    expect(isAssignedTo(task({ assignedTo: { displayName: "A", email: "ana@x.com" } }), me)).toBe(true);
    expect(isAssignedTo(task({ assignedTo: undefined }), me)).toBe(false);
  });
});

describe("withSavedOptions", () => {
  it("keeps saved values that ADO did not return, marked as missing", () => {
    const out = withSavedOptions(plainOptions(["Active", "Closed"]), ["Closed", "Waiting", ""]);
    expect(out.map((o) => o.value)).toEqual(["Active", "Closed", "Waiting"]);
    expect(out[2].missing).toBe(true);
    expect(out[0].missing).toBeUndefined();
  });

  it("compares with the given key (e-mails)", () => {
    const people = [{ value: "ana@x.com", label: "Ana (ana@x.com)", short: "Ana" }];
    const out = withSavedOptions(people, ["ANA@x.com", "ex@y.com"], (v) => v.toLowerCase());
    expect(out.map((o) => o.value)).toEqual(["ana@x.com", "ex@y.com"]);
  });
});
