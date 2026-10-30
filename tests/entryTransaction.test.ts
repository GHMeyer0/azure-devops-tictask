import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "../src/common/actions";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";
import type { TaskInfo, TimeEntry } from "../src/common/domain/types";

// Extension Data in memory: collection -> id -> document.
const store = new Map<string, Map<string, TimeEntry>>();
const dialogs: string[] = [];
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
  }),
  messageDialog: async (message: string) => void dialogs.push(message),
  confirmDialog: async () => true,
  toast: async () => undefined,
}));
vi.mock("azure-devops-extension-sdk", () => ({}));
vi.mock("azure-devops-extension-api", () => ({ getClient: () => ({}) }));
vi.mock("azure-devops-extension-api/WorkItemTracking", () => ({ WorkItemTrackingServiceIds: { WorkItemFormService: "form" } }));
vi.mock("../src/common/wit/witService", () => ({ applyWithRetry: async () => undefined, titlesOf: async () => new Map([[100, "Rotinas – Sprint 62"]]) }));

const { createEntry, deleteEntry } = await import("../src/common/actions");

const task: TaskInfo = { id: 11304, title: "Configurar máquina", type: "Task", state: "Active", parentId: 100, original: 4, remaining: 4, completed: 3 };

function ctxWith(apply: Ctx["writer"]["apply"]): Ctx {
  return { projectId: "p", projectName: "Proj", user: { id: "u1", displayName: "Lucas", email: "l@x.com" }, settings: DEFAULT_SETTINGS, writer: { apply } } as Ctx;
}

const draft = { date: "2026-10-30", startTime: "08:00", endTime: "09:00", minutes: 60, segments: [], activity: "Outros", comment: "" };
const live = (c: string) => [...(store.get(c)?.values() ?? [])].filter((e) => !e.deleted);

beforeEach(() => {
  store.clear();
  dialogs.length = 0;
});

describe("createEntry", () => {
  it("saves the entry and writes Completed as the sum of the task's entries", async () => {
    store.set("tw-p-11304", new Map([["old", { id: "old", projectId: "p", workItemId: 11304, minutes: 5, date: "2026-10-22", start: "x" } as TimeEntry]]));
    const writes: Record<string, unknown>[] = [];
    const ctx = ctxWith(async (id, compute) => {
      const changes = compute({ ...task, id });
      if (changes) writes.push({ id, ...changes });
      return { before: task, after: { ...task, ...changes } as TaskInfo };
    });
    const entry = await createEntry(ctx, { task, draft, close: false }, "timer");
    // 5 min already logged + 60 min now; the 3h typed in the form are replaced.
    expect(writes[0]).toMatchObject({ id: 11304, completed: 1.08, remaining: 3 });
    expect(live("tw-p-11304").map((e) => e.id).sort()).toEqual([entry.id, "old"].sort());
    expect(live("te-p-202610").map((e) => e.id)).toEqual([entry.id]);
    expect(entry).toMatchObject({ parentId: 100, parentTitle: "Rotinas – Sprint 62", after: { completed: 1.08 } });
  });

  it("takes the entry back and warns when the task refuses the save", async () => {
    const ctx = ctxWith(async () => {
      throw new Error("TF401320: Rule Error for field Original Estimate");
    });
    await expect(createEntry(ctx, { task, draft, close: false }, "timer")).rejects.toThrow(/O apontamento foi desfeito/);
    expect(live("tw-p-11304")).toEqual([]);
    expect(live("te-p-202610")).toEqual([]);
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toContain("TF401320");
  });
});

describe("deleteEntry", () => {
  it("puts the entry back when the task refuses the save", async () => {
    const entry = { id: "e1", projectId: "p", workItemId: 11304, minutes: 60, date: "2026-10-30", start: "x", history: [] } as unknown as TimeEntry;
    store.set("tw-p-11304", new Map([["e1", entry]]));
    store.set("te-p-202610", new Map([["e1", entry]]));
    const ctx = ctxWith(async () => {
      throw new Error("TF401320: Rule Error");
    });
    await expect(deleteEntry(ctx, entry)).rejects.toThrow(/A exclusão do apontamento foi desfeito/);
    expect(live("tw-p-11304").map((e) => e.id)).toEqual(["e1"]);
    expect(live("te-p-202610").map((e) => e.id)).toEqual(["e1"]);
  });
});
