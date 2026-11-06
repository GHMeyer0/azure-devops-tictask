import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/common/domain/settings";

// What the screens show for items of another project (0.11.2): the "Concluir a task (…)" label of
// the log dialog and the project name on the calendar blocks.

const STATES: Record<string, Record<string, string[]>> = {
  Tiino: { Task: ["New", "Active", "Stopped", "Closed"] },
  Infraestrutura: { Task: ["To Do", "Doing", "Done"] },
};
vi.mock("../src/common/wit/witService", () => ({
  workItemTypeStates: async (project: string, type: string) => {
    if (project === "Fora do ar") throw new Error("503");
    return STATES[project]?.[type] ?? [];
  },
}));

const { statesFor } = await import("../src/common/wit/typeStates");
const { projectLabel } = await import("../src/common/domain/projectLabel");

describe("closed state shown in the log dialog", () => {
  const s = DEFAULT_SETTINGS.states;

  it("is Done for a task of a Basic project (seen as 'Closed' in 0.11.1)", async () => {
    expect((await statesFor("Infraestrutura", "Task", s)).closed).toBe("Done");
  });

  it("is the configured one in the page's project", async () => {
    expect((await statesFor("Tiino", "Task", s)).closed).toBe("Closed");
  });

  it("falls back to the configuration when the states cannot be read", async () => {
    expect(await statesFor("Fora do ar", "Task", s)).toEqual(s);
  });
});

describe("project on the calendar blocks", () => {
  const names = new Map([
    ["tiino", "Tiino"],
    ["infra", "Infraestrutura"],
  ]);

  it("always names a block of another project (seen without a name in 0.11.1)", () => {
    expect(projectLabel("infra", "tiino", false, names)).toBe("Infraestrutura");
  });

  it("names nothing when the week only has the page's project", () => {
    expect(projectLabel("tiino", "tiino", false, names)).toBe("");
  });

  it("names every block when the week mixes projects", () => {
    expect(projectLabel("tiino", "tiino", true, names)).toBe("Tiino");
  });
});
