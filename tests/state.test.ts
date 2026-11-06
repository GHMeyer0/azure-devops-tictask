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
