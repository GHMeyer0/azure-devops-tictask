import { describe, expect, it, vi } from "vitest";

const writes: { collection: string; doc: Record<string, unknown> }[] = [];
vi.mock("../src/common/sdk", () => ({
  getDataManager: async () => ({
    setDocument: async (collection: string, doc: Record<string, unknown>) => (writes.push({ collection, doc }), doc),
    deleteDocument: async () => undefined,
    // A read right after a write: the store still returns the collection without it.
    getDocuments: async () => [],
  }),
}));

const { listByWorkItem, removeEntry, saveEntry } = await import("../src/common/data/entriesRepo");

describe("saveEntry", () => {
  it("overwrites both copies without a version check, whatever version the entry was read with", async () => {
    const entry = { id: "e1", projectId: "p", workItemId: 7, date: "2026-10-23", __etag: 3 } as never;
    await saveEntry({ ...(entry as object), deleted: true } as never, entry);
    expect(writes.map((w) => w.collection)).toEqual(["te-p-202610", "tw-p-7"]);
    expect(writes.every((w) => w.doc.__etag === -1 && w.doc.deleted === true)).toBe(true);
  });
});

describe("reads right after a write", () => {
  it("include what this page just saved, and leave out what it took back", async () => {
    const entry = { id: "e2", projectId: "p", workItemId: 8, date: "2026-10-30", start: "2026-10-30T11:00:00.000Z", minutes: 30 } as never;
    await saveEntry(entry);
    expect((await listByWorkItem("p", 8)).map((e) => e.id)).toEqual(["e2"]);
    expect(await listByWorkItem("p", 9)).toEqual([]);
    await removeEntry(entry);
    expect(await listByWorkItem("p", 8)).toEqual([]);
  });
});

describe("timer reads", () => {
  it("treat a document saved before the one on screen as a stale read", async () => {
    const { isOlder } = await import("../src/common/data/timerRepo");
    expect(isOlder({ savedAt: "2026-10-23T17:00:00.000Z" }, "2026-10-23T17:00:05.000Z")).toBe(true);
    expect(isOlder(null, "2026-10-23T17:00:05.000Z")).toBe(true); // nothing there yet
    expect(isOlder({}, "2026-10-23T17:00:05.000Z")).toBe(true); // saved by an older version
    expect(isOlder({ savedAt: "2026-10-23T17:00:09.000Z" }, "2026-10-23T17:00:05.000Z")).toBe(false); // changed elsewhere
    expect(isOlder({ savedAt: "2026-10-23T17:00:00.000Z" }, undefined)).toBe(false); // nothing to compare with
  });
});
