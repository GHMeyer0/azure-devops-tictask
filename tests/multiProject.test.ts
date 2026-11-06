import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "../src/common/actions";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";
import type { ActiveTimer, TaskInfo, TimeEntry } from "../src/common/domain/types";
import type { FieldChanges } from "../src/common/wit/witService";

// One organization with two projects, as the hub sees it since 0.11:
//   Tiino (Agile: New / Active / Stopped / Closed), the page's project, where the user is a manager;
//   Infraestrutura (Scrum: To Do / In Progress / Done), no TicTask settings, user is not a manager.
// Entries, timer and work items live in memory; every action is called with the Tiino page context.

const TIINO = { id: "tiino", name: "Tiino" };
const INFRA = { id: "infra", name: "Infraestrutura" };
const STATES: Record<string, Record<string, string[]>> = {
  Tiino: { Task: ["New", "Active", "Stopped", "Closed", "Removed"], "User Story": ["New", "Active", "Resolved", "Closed"] },
  Infraestrutura: { Task: ["To Do", "In Progress", "Done", "Removed"], "Product Backlog Item": ["New", "Approved", "Committed", "Done"] },
};

const store = new Map<string, Map<string, TimeEntry>>();
const items = new Map<number, TaskInfo>();
const writes: { id: number; changes: FieldChanges }[] = [];
const cleared: string[] = [];
const pausedIn: string[] = [];
let timerDoc: ActiveTimer | null = null;

vi.mock("../src/common/sdk", () => ({
  getDataManager: async () => ({
    getDocuments: async (c: string) => {
      const docs = store.get(c);
      if (!docs) throw Object.assign(new Error("DocumentCollectionDoesNotExistException"), { status: 404 });
      return [...docs.values()];
    },
    setDocument: async (c: string, doc: TimeEntry) => {
      if (!store.has(c)) store.set(c, new Map());
      store.get(c)!.set(doc.id, doc);
      return doc;
    },
    deleteDocument: async (c: string, id: string) => void store.get(c)?.delete(id),
    // Only Tiino has TicTask settings (a 3-day edit limit); Infraestrutura uses the defaults.
    getValue: async (key: string) => (key === "settings-tiino" ? { lockDays: 3 } : null),
  }),
  messageDialog: async () => undefined,
  confirmDialog: async () => true,
  toast: async () => undefined,
}));
vi.mock("azure-devops-extension-sdk", () => ({}));
vi.mock("azure-devops-extension-api", () => ({ getClient: () => ({}) }));
vi.mock("azure-devops-extension-api/WorkItemTracking", () => ({ WorkItemTrackingServiceIds: { WorkItemFormService: "form" } }));
vi.mock("../src/common/data/projects", () => ({
  listProjects: async () => [TIINO, INFRA],
  findProject: async (ref: { id?: string; name?: string }) => [TIINO, INFRA].find((p) => (ref.id ? p.id === ref.id : p.name === ref.name)),
}));
vi.mock("../src/common/data/roles", () => ({ isManager: async (ctx: Ctx) => ctx.projectId === TIINO.id }));
vi.mock("../src/common/wit/witService", () => ({
  applyWithRetry: async () => undefined,
  getWorkItem: async (id: number) => structuredClone(items.get(id)!),
  titlesOf: async (ids: number[]) => new Map(ids.map((id) => [id, items.get(id)?.title ?? ""])),
  workItemTypeStates: async (project: string, type: string) => STATES[project]?.[type] ?? [],
  workItemTypeStateInfo: async (project: string, type: string) => STATES[project]?.[type] ?? [],
}));
vi.mock("../src/common/data/timerRepo", () => ({
  readTimerDoc: async () => timerDoc,
  timerOf: (doc: ActiveTimer | null) => doc,
  isOlder: () => false,
  getTimer: async () => timerDoc,
  saveTimer: async (t: ActiveTimer) => (timerDoc = t),
  clearTimer: async (projectId: string) => void (cleared.push(projectId), (timerDoc = null)),
}));
vi.mock("../src/common/data/presenceRepo", () => ({
  listPresence: async () => [],
  publishPaused: async (projectId: string) => void pausedIn.push(projectId),
}));
vi.mock("../src/common/dialogs", () => ({ openDialog: async () => undefined }));

const { canEdit, createEntry, deleteEntry, pauseTimer, updateEntry } = await import("../src/common/actions");
const { loadEntries } = await import("../src/common/data/crossProject");
const { forgetRecentWrites } = await import("../src/common/data/entriesRepo");

const user = { id: "u1", displayName: "Gabriel", email: "g@x.com" };

/** The Tiino hub page: its settings, and a writer that applies the changes to the items in memory. */
function tiinoCtx(): Ctx {
  return {
    projectId: TIINO.id,
    projectName: TIINO.name,
    user,
    settings: { ...structuredClone(DEFAULT_SETTINGS), lockDays: 3 },
    writer: {
      apply: async (id, compute) => {
        const before = structuredClone(items.get(id)!);
        const changes = compute(before);
        if (!changes) return { before, after: before };
        writes.push({ id, changes });
        const { history: _h, ...fields } = changes;
        const after = { ...before, ...fields } as TaskInfo;
        items.set(id, after);
        return { before, after };
      },
    },
  };
}

const live = (c: string) => [...(store.get(c)?.values() ?? [])].filter((e) => !e.deleted);
const draft = (minutes: number) => ({ date: "2026-11-05", startTime: "20:25", endTime: "20:55", minutes, segments: [], activity: "Investigação", comment: "teste" });

function entry(p: Partial<TimeEntry>): TimeEntry {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: TIINO.id,
    workItemId: 1,
    workItemTitle: "T",
    workItemType: "Task",
    userId: user.id,
    userName: user.displayName,
    userEmail: user.email,
    date: "2026-11-05",
    start: "2026-11-05T12:00:00.000Z",
    end: "2026-11-05T12:30:00.000Z",
    minutes: 30,
    segments: [],
    activity: "Testes",
    comment: "",
    source: "manual",
    createdAt: "2026-11-05T12:30:00.000Z",
    createdBy: user.id,
    history: [],
    ...p,
  };
}

function put(e: TimeEntry): TimeEntry {
  for (const c of [`te-${e.projectId}-${e.date.slice(0, 7).replace("-", "")}`, `tw-${e.projectId}-${e.workItemId}`]) {
    if (!store.has(c)) store.set(c, new Map());
    store.get(c)!.set(e.id, e);
  }
  return e;
}

beforeEach(() => {
  forgetRecentWrites();
  store.clear();
  items.clear();
  writes.length = 0;
  cleared.length = 0;
  pausedIn.length = 0;
  timerDoc = null;
  // Infraestrutura (Scrum): task "To Do" under a PBI "Approved"; Tiino (Agile): task "New" under a User Story "New".
  items.set(3410, { id: 3410, title: "Novo cluster", type: "Product Backlog Item", state: "Approved", original: null, remaining: null, completed: null, project: INFRA.name });
  items.set(3418, { id: 3418, title: "Remover cluster antigo", type: "Task", state: "To Do", parentId: 3410, original: null, remaining: 1.5, completed: null, project: INFRA.name });
  items.set(100, { id: 100, title: "História", type: "User Story", state: "New", original: null, remaining: null, completed: null, project: TIINO.name });
  items.set(11, { id: 11, title: "Desenvolvimento", type: "Task", state: "New", parentId: 100, original: 4, remaining: 4, completed: null, project: TIINO.name });
});

describe("logging on a task of another project, from the Tiino page", () => {
  it("stores the entry in Infraestrutura and uses the Scrum states (In Progress, Committed)", async () => {
    // An entry of the same task left by mistake in the page's project must not enter the sum.
    put(entry({ projectId: TIINO.id, workItemId: 3418, minutes: 600 }));
    const saved = await createEntry(tiinoCtx(), { task: items.get(3418)!, draft: draft(30), close: false }, "manual");

    expect(saved.projectId).toBe(INFRA.id);
    expect(live("te-infra-202611").map((e) => e.id)).toEqual([saved.id]);
    expect(live("tw-infra-3418").map((e) => e.id)).toEqual([saved.id]);
    expect(live("tw-tiino-3418")).toHaveLength(1); // untouched
    // Not "Active" (refused by the Scrum process: seen in ADO on 05/11/2026).
    expect(items.get(3418)).toMatchObject({ state: "In Progress", completed: 0.5, remaining: 1 });
    expect(items.get(3410)!.state).toBe("Committed");
    expect(writes.every((w) => w.changes.state !== "Active")).toBe(true);
  });

  it("concludes with the Scrum closed state (Done)", async () => {
    await createEntry(tiinoCtx(), { task: items.get(3418)!, draft: draft(30), close: true }, "manual");
    expect(items.get(3418)!.state).toBe("Done");
  });

  it("keeps the Agile states for the page's own project", async () => {
    await createEntry(tiinoCtx(), { task: items.get(11)!, draft: draft(60), close: false }, "manual", { pauseState: "Stopped" });
    expect(items.get(11)).toMatchObject({ state: "Stopped", completed: 1, remaining: 3 });
    expect(items.get(100)!.state).toBe("Active");
  });
});

describe("editing and deleting an entry of another project, from the Tiino page", () => {
  it("updates the copies in Infraestrutura and sums only its entries", async () => {
    const e = put(entry({ projectId: INFRA.id, workItemId: 3418, minutes: 30 }));
    items.set(3418, { ...items.get(3418)!, completed: 0.5, remaining: 1 });
    await updateEntry(tiinoCtx(), e, { ...draft(45) });
    expect(live("te-infra-202611")[0].minutes).toBe(45);
    expect(items.get(3418)).toMatchObject({ completed: 0.75, remaining: 0.75 });

    const updated = live("tw-infra-3418")[0];
    await deleteEntry(tiinoCtx(), updated);
    expect(live("tw-infra-3418")).toEqual([]);
    expect(store.get("tw-infra-3418")!.get(e.id)!.deleted).toBe(true);
    expect(items.get(3418)).toMatchObject({ completed: 0, remaining: 1.5 });
  });
});

describe("pausing a timer of another project, from the Tiino page", () => {
  it("logs in the timer's project and clears its presence there", async () => {
    items.set(3418, { ...items.get(3418)!, state: "In Progress" });
    const start = new Date(Date.now() - 20 * 60_000).toISOString();
    timerDoc = {
      id: "active",
      projectId: INFRA.id,
      workItem: { id: 3418, title: "Remover cluster antigo", type: "Task", parentId: 3410 },
      activity: "Investigação",
      comment: "",
      status: "running",
      segments: [{ start }],
      stateAtStart: "To Do",
    };
    const result = await pauseTimer(tiinoCtx(), timerDoc);
    expect(result).not.toBe(true);
    expect((result as TimeEntry).projectId).toBe(INFRA.id);
    expect(live("tw-infra-3418")).toHaveLength(1);
    expect(store.has("tw-tiino-3418")).toBe(false);
    expect(cleared).toEqual([INFRA.id]);
    expect(pausedIn).toEqual([INFRA.id]);
    // Scrum has no Stopped: the task keeps its state instead of a refused "Stopped".
    expect(items.get(3418)!.state).toBe("In Progress");
  });
});

describe("hub reading every project", () => {
  beforeEach(() => {
    put(entry({ projectId: TIINO.id, workItemId: 11, minutes: 60 }));
    put(entry({ projectId: TIINO.id, workItemId: 11, minutes: 15, userId: "u2", userName: "Ana" }));
    put(entry({ projectId: INFRA.id, workItemId: 3418, minutes: 30, date: "2026-11-01" }));
    put(entry({ projectId: INFRA.id, workItemId: 3418, minutes: 45, userId: "u2", userName: "Ana" }));
  });

  it("shows my hours of every project", async () => {
    const r = await loadEntries(tiinoCtx(), "2026-11-01", "2026-11-30", { allProjects: true, others: false, manager: true });
    expect(r.entries.map((e) => [e.projectId, e.minutes]).sort()).toEqual([
      [INFRA.id, 30],
      [TIINO.id, 60],
    ]);
    expect(r.projects).toEqual(new Map([[TIINO.id, "Tiino"], [INFRA.id, "Infraestrutura"]]));
  });

  it("shows other people's hours only where I am a manager", async () => {
    const r = await loadEntries(tiinoCtx(), "2026-11-01", "2026-11-30", { allProjects: true, others: true, manager: true });
    expect(r.entries.map((e) => `${e.projectId}:${e.userId}`).sort()).toEqual(["infra:u1", "tiino:u1", "tiino:u2"]);
  });

  it("reads only the page's project with Este projeto", async () => {
    const r = await loadEntries(tiinoCtx(), "2026-11-01", "2026-11-30", { allProjects: false, others: true, manager: true });
    expect(new Set(r.entries.map((e) => e.projectId))).toEqual(new Set([TIINO.id]));
  });

  it("applies each project's edit limit once its settings are read", async () => {
    const r = await loadEntries(tiinoCtx(), "2026-11-01", "2026-11-30", { allProjects: true, others: false, manager: false });
    const infra = r.entries.find((e) => e.projectId === INFRA.id)!;
    const tiino = r.entries.find((e) => e.projectId === TIINO.id)!;
    // 01/11 → 08/11: 7 days, inside Infraestrutura's default (7) and outside Tiino's 3 days.
    expect(canEdit(tiinoCtx(), infra, "2026-11-08")).toBe(true);
    expect(canEdit(tiinoCtx(), { ...tiino, date: "2026-11-01" }, "2026-11-08")).toBe(false);
  });
});
