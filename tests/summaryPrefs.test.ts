import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, presetRange, scopeOf } from "../src/hub/summaryPrefs";

describe("Resumo preferences", () => {
  it("starts with Pessoa, Projeto, WI pai and Atividade, this month and every project", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ dims: ["user", "project", "parent", "activity"], period: "month", allProjects: true, scope: "me" });
  });

  it("adds Projeto after Pessoa to rows saved before 0.11, once", () => {
    const old = parsePrefs(JSON.stringify({ bucket: "week", dims: ["user", "parent", "activity"], hideEmpty: false, detailed: true }));
    expect(old).toMatchObject({ v: 2, bucket: "week", dims: ["user", "project", "parent", "activity"], hideEmpty: false, detailed: true });
    // Taken out by the user afterwards: stays out.
    expect(parsePrefs(JSON.stringify({ ...old, dims: ["user", "parent"] })).dims).toEqual(["user", "parent"]);
  });

  it("keeps Quem, Pessoa, the period and the projects choice", () => {
    const p = parsePrefs(JSON.stringify({ ...DEFAULT_PREFS, scope: "team:t1", person: "u2", period: "lastWeek", allProjects: false }));
    expect(p).toMatchObject({ scope: "team:t1", person: "u2", period: "lastWeek", allProjects: false });
    expect(scopeOf(p.scope)).toEqual({ kind: "team", teamId: "t1" });
    expect(presetRange(p.period, "2026-11-05")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("ignores broken or unknown values", () => {
    expect(parsePrefs("{oops")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ v: 2, dims: ["nope"], period: "decade" }))).toMatchObject({ dims: DEFAULT_PREFS.dims, period: "month" });
  });
});
