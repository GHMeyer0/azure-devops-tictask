import { describe, expect, it, vi } from "vitest";

const writes: { collection: string; doc: Record<string, unknown> }[] = [];
vi.mock("../src/common/sdk", () => ({
  getDataManager: async () => ({
    setDocument: async (collection: string, doc: Record<string, unknown>) => (writes.push({ collection, doc }), doc),
    deleteDocument: async () => undefined,
  }),
}));

const { saveEntry } = await import("../src/common/data/entriesRepo");

describe("saveEntry", () => {
  it("overwrites both copies without a version check, whatever version the entry was read with", async () => {
    const entry = { id: "e1", projectId: "p", workItemId: 7, date: "2026-10-23", __etag: 3 } as never;
    await saveEntry({ ...(entry as object), deleted: true } as never, entry);
    expect(writes.map((w) => w.collection)).toEqual(["te-p-202610", "tw-p-7"]);
    expect(writes.every((w) => w.doc.__etag === -1 && w.doc.deleted === true)).toBe(true);
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
