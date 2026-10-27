import { describe, expect, it } from "vitest";
import { buildExport, parseExport, prepareForImport, summarize } from "../src/common/domain/exportFile";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";
import type { TimeEntry } from "../src/common/domain/types";

function entry(p: Partial<TimeEntry>): TimeEntry {
  return {
    id: "e1",
    projectId: "proj-a",
    workItemId: 10,
    workItemTitle: "Task",
    workItemType: "Task",
    userId: "u1",
    userName: "Ana",
    userEmail: "ana@x.com",
    date: "2026-10-20",
    start: "2026-10-20T12:00:00.000Z",
    end: "2026-10-20T13:00:00.000Z",
    minutes: 60,
    segments: [],
    activity: "Testes",
    comment: "",
    source: "manual",
    createdAt: "2026-10-20T13:00:00.000Z",
    createdBy: "u1",
    history: [{ at: "2026-10-20T13:00:00.000Z", by: "Ana", action: "create", detail: "1h" }],
    ...p,
  };
}

const meta = { by: { id: "u1", displayName: "Ana", email: "ana@x.com" }, extension: "contoso.time-tracker", projectId: "proj-a", projectName: "Contoso", at: "2026-10-22T10:00:00.000Z" };
const entries = [
  entry({ id: "e2", date: "2026-10-21", start: "2026-10-21T12:00:00.000Z", workItemId: 11, userId: "u2", __etag: 3 }),
  entry({ id: "e1" }),
  entry({ id: "e3", date: "2026-09-30", start: "2026-09-30T12:00:00.000Z", deleted: true, minutes: 30 }),
];

describe("export file", () => {
  it("round-trips through JSON, sorted and without etags", () => {
    const file = buildExport(entries, DEFAULT_SETTINGS, meta);
    const parsed = parseExport(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.entries.map((e) => e.id)).toEqual(["e3", "e1", "e2"]);
    expect(parsed.file.entries.some((e) => "__etag" in e)).toBe(false);
    expect(parsed.file.source.extension).toBe("contoso.time-tracker");
  });

  it("summarizes including deleted entries", () => {
    expect(summarize(entries)).toEqual({ entries: 3, deleted: 1, users: 2, workItems: 2, minutes: 120, from: "2026-09-30", to: "2026-10-21" });
  });

  it("rejects files that are not exports", () => {
    expect(parseExport("not json")).toEqual({ ok: false, error: "O arquivo não é um JSON válido." });
    expect(parseExport('{"a":1}').ok).toBe(false);
    const bad = buildExport([entry({ date: "20/10/2026" })], DEFAULT_SETTINGS, meta);
    const r = parseExport(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("data inválida");
  });

  it("rejects newer versions", () => {
    const file = { ...buildExport(entries, DEFAULT_SETTINGS, meta), version: 99 };
    expect(parseExport(JSON.stringify(file)).ok).toBe(false);
  });

  it("prepares entries for the target project with an import audit line, once", () => {
    const target = { projectId: "proj-b", by: "Bruno", at: "2026-10-23T09:00:00.000Z", sourceExtension: "contoso.time-tracker" };
    const once = prepareForImport(entries, target);
    expect(once.every((e) => e.projectId === "proj-b")).toBe(true);
    expect(once[1].history.at(-1)).toEqual({ at: target.at, by: "Bruno", action: "import", detail: "importado de contoso.time-tracker" });
    const twice = prepareForImport(once, target);
    expect(twice[1].history).toHaveLength(2);
  });
});
