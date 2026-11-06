import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "../src/common/actions";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";
import type { ActiveTimer, TaskInfo, TimeEntry } from "../src/common/domain/types";
import type { FieldChanges, NewTask } from "../src/common/wit/witService";

// A process that keeps Original Estimate read-only (seen in another organization on 05/11/2026):
// pausing a forgotten timer on a task without estimate was refused, the entry undone and the timer
// could not be stopped. Every path that writes the estimate must work without the field.

const LOCKED = "TF401320: Rule Error for field Original Estimate. Error code: ReadOnly, InvalidNotOldValue.";
const REQUIRED = "TF401320: Rule Error for field Original Estimate. Error code: Required, InvalidEmpty.";

const store = new Map<string, Map<string, TimeEntry>>();
const items = new Map<number, TaskInfo>();
const attempts: FieldChanges[] = [];
const toasts: string[] = [];
const created: NewTask[] = [];
let refuse: string | null = LOCKED;
/** States the process accepts on the task (null: any); others are refused like ADO does. */
let accepted: string[] | null = null;
/** States of the type as the API reports them (empty: could not be read). */
let stateInfo: { name: string; category: string }[] = [];
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
    getValue: async () => null,
  }),
  messageDialog: async () => undefined,
  confirmDialog: async () => true,
  toast: async (m: string) => void toasts.push(m),
}));
vi.mock("azure-devops-extension-sdk", () => ({}));
vi.mock("azure-devops-extension-api", () => ({ getClient: () => ({}) }));
vi.mock("azure-devops-extension-api/WorkItemTracking", () => ({ WorkItemTrackingServiceIds: { WorkItemFormService: "form" } }));
vi.mock("../src/common/data/projects", () => ({ findProject: async () => ({ id: "p", name: "Proj" }), listProjects: async () => [{ id: "p", name: "Proj" }] }));
vi.mock("../src/common/wit/witService", () => ({
  applyWithRetry: async () => undefined,
  getWorkItem: async (id: number) => structuredClone(items.get(id)!),
  titlesOf: async (ids: number[]) => new Map(ids.map((id) => [id, items.get(id)?.title ?? ""])),
  workItemTypeStates: async () => ["New", "Active", "Stopped", "Closed"],
  workItemTypeStateInfo: async () => stateInfo,
  getChildren: async () => [],
  // A process with the rule refuses a new task that sets Original Estimate too.
  createTask: async (_project: string, t: NewTask) => {
    created.push(t);
    if (refuse && t.writeOriginal !== false && t.estimate) throw new Error(refuse);
    return { id: 900, title: t.title, type: "Task", state: "New", original: t.writeOriginal === false ? null : (t.estimate ?? null), remaining: t.estimate ?? null, completed: null, parentId: t.parent.id };
  },
}));
vi.mock("../src/common/data/timerRepo", () => ({
  readTimerDoc: async () => timerDoc,
  timerOf: (doc: ActiveTimer | null) => doc,
  isOlder: () => false,
  getTimer: async () => timerDoc,
  saveTimer: async (t: ActiveTimer) => (timerDoc = t),
  clearTimer: async () => void (timerDoc = null),
}));
vi.mock("../src/common/data/presenceRepo", () => ({ listPresence: async () => [], publishPaused: async () => undefined }));
// Dialogs answer as the user would: an estimate of 2h where one is asked, the draft as proposed.
vi.mock("../src/common/dialogs", () => ({
  openDialog: async (_title: string, request: { kind: string; draft?: unknown }) =>
    request.kind === "estimate" ? { estimate: 2 } : request.kind === "pause" ? { draft: request.draft, estimate: 2 } : undefined,
}));

const { createChildTask, createEntry, pauseTimer, startTimer } = await import("../src/common/actions");
const { forgetRecentWrites } = await import("../src/common/data/entriesRepo");
const { isOriginalEstimateLocked } = await import("../src/common/errors");

/** The process: a save setting Original Estimate is refused while `refuse` holds an error. */
function ctx(writeOriginalEstimate = true): Ctx {
  return {
    projectId: "p",
    projectName: "Proj",
    user: { id: "u1", displayName: "Amigo", email: "a@x.com" },
    settings: { ...structuredClone(DEFAULT_SETTINGS), writeOriginalEstimate },
    writer: {
      apply: async (id, compute) => {
        const before = structuredClone(items.get(id)!);
        const changes = compute(before);
        if (!changes) return { before, after: before };
        attempts.push(changes);
        if (refuse && changes.original !== undefined) throw new Error(refuse);
        if (accepted && changes.state && !accepted.includes(changes.state))
          throw new Error(`The field 'State' contains the value '${changes.state}' that is not in the list of supported values`);
        const { history: _h, ...fields } = changes;
        const after = { ...before, ...fields } as TaskInfo;
        items.set(id, after);
        return { before, after };
      },
    },
  };
}

const live = (c: string) => [...(store.get(c)?.values() ?? [])].filter((e) => !e.deleted);

beforeEach(() => {
  forgetRecentWrites();
  store.clear();
  items.clear();
  attempts.length = 0;
  toasts.length = 0;
  created.length = 0;
  refuse = LOCKED;
  accepted = null;
  stateInfo = [];
  timerDoc = null;
  items.set(100, { id: 100, title: "História", type: "User Story", state: "Active", original: null, remaining: null, completed: null });
  // No estimate at all (neither Original Estimate nor Remaining), like the friend's #19100.
  items.set(19100, { id: 19100, title: "Teste", type: "Task", state: "Active", parentId: 100, original: null, remaining: null, completed: null });
  items.set(19101, { id: 19101, title: "Nova", type: "Task", state: "New", parentId: 100, original: null, remaining: null, completed: null });
});

describe("recognizing the refusal", () => {
  it("is the read-only rule, not a required one", () => {
    expect(isOriginalEstimateLocked(new Error(LOCKED))).toBe(true);
    expect(isOriginalEstimateLocked({ serverError: { message: LOCKED } })).toBe(true);
    expect(isOriginalEstimateLocked(new Error(REQUIRED))).toBe(false);
    expect(isOriginalEstimateLocked(new Error("TF401320: Rule Error for field Remaining Work. Error code: ReadOnly"))).toBe(false);
  });
});

describe("Original Estimate read-only in the process", () => {
  it("pauses a timer on a task without estimate: saves without the field and tells the user", async () => {
    timerDoc = {
      id: "active",
      projectId: "p",
      workItem: { id: 19100, title: "Teste", type: "Task", parentId: 100 },
      activity: "Testes",
      comment: "",
      status: "running",
      segments: [{ start: new Date(Date.now() - 30 * 60_000).toISOString() }],
    };
    const entry = (await pauseTimer(ctx(), timerDoc)) as TimeEntry;

    expect(entry.minutes).toBe(30);
    expect(live("tw-p-19100").map((e) => e.id)).toEqual([entry.id]);
    expect(timerDoc).toBeNull(); // the timer stopped
    // First try with the estimate, refused; then without it.
    expect(attempts[0].original).toBe(2);
    expect(attempts[1].original).toBeUndefined();
    expect(items.get(19100)).toMatchObject({ original: null, remaining: 1.5, completed: 0.5, state: "Stopped" });
    expect(toasts).toEqual(["O processo não deixa gravar o Original Estimate da #19100: a estimativa ficou só no Remaining."]);
  });

  it("logs with 'Gravar o Original Estimate' off without ever sending the field", async () => {
    const draft = { date: "2026-11-06", startTime: "09:00", endTime: "10:00", minutes: 60, segments: [], activity: "Testes", comment: "" };
    await createEntry(ctx(false), { task: items.get(19100)!, draft, close: false, estimate: 2 }, "manual");
    expect(attempts.every((a) => a.original === undefined)).toBe(true);
    expect(items.get(19100)).toMatchObject({ original: null, remaining: 1, completed: 1 });
    expect(toasts).toEqual([]);
  });

  it("starts the timer on a task without estimate: the estimate goes to Remaining", async () => {
    const timer = await startTimer(ctx(), items.get(19101)!);
    expect(timer?.workItem.id).toBe(19101);
    expect(items.get(19101)).toMatchObject({ original: null, remaining: 2, state: "Active" });
    expect(toasts).toHaveLength(1);
  });

  it("creates a task with the estimate only in Remaining", async () => {
    const task = await createChildTask(ctx(), items.get(100)!, { activity: "Testes", description: "Testes e ajustes", estimate: 2 });
    expect(created.map((t) => t.writeOriginal)).toEqual([true, false]);
    expect(task).toMatchObject({ original: null, remaining: 2 });
    expect(toasts).toHaveLength(1);
  });

  it("creates the task with a description (processes may require one)", async () => {
    await createChildTask(ctx(false), items.get(100)!, { activity: "Testes", description: "Testes <e> ajustes", estimate: 2 });
    expect(created[0].description).toBe("Testes &lt;e&gt; ajustes<br>Criada pelo TicTask a partir de #100.");
  });

  it("creates a task without trying the field when the setting is off", async () => {
    await createChildTask(ctx(false), items.get(100)!, { activity: "Testes", description: "Testes", estimate: 2 });
    expect(created.map((t) => t.writeOriginal)).toEqual([false]);
  });

  it("keeps refusing (and undoing the entry) for another rule on the field", async () => {
    refuse = REQUIRED;
    const draft = { date: "2026-11-06", startTime: "09:00", endTime: "10:00", minutes: 60, segments: [], activity: "Testes", comment: "" };
    await expect(createEntry(ctx(), { task: items.get(19100)!, draft, close: false, estimate: 2 }, "manual")).rejects.toThrow(/O apontamento foi desfeito/);
    expect(attempts).toHaveLength(1);
    expect(live("tw-p-19100")).toEqual([]);
  });
});

// The friend's process: Aberto / Em Desenvolvimento / Fechado / Removido, inherited New/Active/Closed hidden (seen in another organization on 06/11/2026: "The field 'State'
// contains the value 'Closed' that is not in the list of supported values" on Concluir).
const OWN = [
  { name: "Aberto", category: "Proposed" },
  { name: "Em Desenvolvimento", category: "InProgress" },
  { name: "Fechado", category: "Completed" },
  { name: "Removido", category: "Removed" },
];
const draft = { date: "2026-11-06", startTime: "09:00", endTime: "10:00", minutes: 60, segments: [], activity: "Testes", comment: "" };

describe("states the process does not have", () => {
  beforeEach(() => {
    refuse = null;
    accepted = OWN.map((x) => x.name);
    items.set(19100, { ...items.get(19100)!, state: "Em Desenvolvimento", original: 4, remaining: 4 });
  });

  it("concludes with the process's own Completed state (Fechado)", async () => {
    stateInfo = OWN;
    await createEntry(ctx(), { task: items.get(19100)!, draft, close: true }, "timer");
    expect(items.get(19100)).toMatchObject({ state: "Fechado", completed: 1 });
    expect(toasts).toEqual([]);
  });

  it("starts work with its own In Progress state (Em Desenvolvimento)", async () => {
    stateInfo = OWN;
    items.set(19102, { id: 19102, title: "Outra", type: "Task", state: "Aberto", parentId: 100, original: 2, remaining: 2, completed: null });
    await startTimer(ctx(), items.get(19102)!);
    expect(items.get(19102)!.state).toBe("Em Desenvolvimento");
  });

  it("keeps the hours when the state is refused anyway (states could not be read)", async () => {
    stateInfo = [];
    const entry = await createEntry(ctx(), { task: items.get(19100)!, draft, close: true }, "timer");
    expect(live("tw-p-19100").map((e) => e.id)).toEqual([entry.id]);
    expect(items.get(19100)).toMatchObject({ state: "Em Desenvolvimento", completed: 1, remaining: 3 });
    expect(toasts).toEqual(['O estado "Closed" não existe da #19100 neste processo: as horas foram apontadas e o estado ficou como estava. Ajuste o estado na task.']);
  });
});

describe("another required field", () => {
  it("says which field to fill and undoes the entry", async () => {
    refuse = null;
    const draft = { date: "2026-11-06", startTime: "09:00", endTime: "10:00", minutes: 60, segments: [], activity: "Testes", comment: "" };
    const c = ctx();
    c.writer = { apply: async () => Promise.reject(new Error("TF401320: Rule Error for field Cliente. Error code: Required, InvalidEmpty.")) };
    await expect(createEntry(c, { task: { ...items.get(19100)!, original: 2, remaining: 2 }, draft, close: false }, "manual")).rejects.toThrow(
      'A task #19100 não aceitou a gravação: o processo exige o campo "Cliente" preenchido. Preencha na task. O apontamento foi desfeito',
    );
    expect(live("tw-p-19100")).toEqual([]);
  });
});
