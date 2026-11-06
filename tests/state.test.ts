import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";
import { adaptStates, decideParentStart, decideStart } from "../src/common/domain/state";

const s = DEFAULT_SETTINGS.states;
const AGILE_TASK = ["New", "Active", "Stopped", "Closed", "Removed"];
const SCRUM_TASK = ["To Do", "In Progress", "Done", "Removed"];
const SCRUM_PBI = ["New", "Approved", "Committed", "Done", "Removed"];
const BASIC_TASK = ["To Do", "Doing", "Done"];

describe("adaptStates", () => {
  it("keeps the configuration when the type has its states", () => {
    expect(adaptStates(s, AGILE_TASK)).toMatchObject({ active: "Active", closed: "Closed", pauseStates: ["Stopped"] });
  });

  it("uses the Scrum equivalents (In Progress, Done) and drops a missing pause state", () => {
    const a = adaptStates(s, SCRUM_TASK);
    expect(a).toMatchObject({ active: "In Progress", closed: "Done", pauseStates: [] });
    expect(decideStart("To Do", a)).toEqual({ kind: "activate", to: "In Progress" });
    expect(decideStart("Done", a)).toEqual({ kind: "reopen", to: "In Progress" });
  });

  it("uses Doing on the Basic process", () => {
    expect(adaptStates(s, BASIC_TASK)).toMatchObject({ active: "Doing", closed: "Done" });
  });

  it("moves a Scrum PBI to Committed, and not again when it is already there", () => {
    const a = adaptStates(s, SCRUM_PBI);
    expect(decideParentStart("Approved", a)).toBe("Committed");
    expect(decideParentStart("Committed", a)).toBeNull();
  });

  it("keeps the configuration when the states are unknown or have no equivalent", () => {
    expect(adaptStates(s, [])).toBe(s);
    expect(adaptStates(s, ["Open", "Fixed"])).toMatchObject({ active: "Active", closed: "Closed" });
  });
});

describe("adaptStates by state category", () => {
  const OWN = [
    { name: "Novo", category: "Proposed" },
    { name: "Parado", category: "InProgress" },
    { name: "Em andamento", category: "InProgress" },
    { name: "Concluído", category: "Completed" },
    { name: "Removido", category: "Removed" },
  ];

  it("finds Active/Closed in a process with states of its own", () => {
    const a = adaptStates({ ...s, pauseStates: ["Stopped", "Parado"] }, OWN);
    // "Parado" is a pause state, so it is never the working state even being In Progress.
    expect(a).toMatchObject({ active: "Em andamento", closed: "Concluído", pauseStates: ["Parado"] });
    expect(decideStart("Novo", a)).toEqual({ kind: "activate", to: "Em andamento" });
    expect(decideStart("Concluído", a)).toEqual({ kind: "reopen", to: "Em andamento" });
    expect(decideStart("Removido", a)).toEqual({ kind: "reopen", to: "Em andamento" });
  });

  it("prefers the usual names over the category order", () => {
    const a = adaptStates(s, [{ name: "New", category: "Proposed" }, { name: "Stopped", category: "InProgress" }, { name: "Active", category: "InProgress" }, { name: "Closed", category: "Completed" }]);
    expect(a).toMatchObject({ active: "Active", closed: "Closed", pauseStates: ["Stopped"] });
  });
});
