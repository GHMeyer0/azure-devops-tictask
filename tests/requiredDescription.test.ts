import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldChanges } from "../src/common/wit/witService";
import type { TaskInfo } from "../src/common/domain/types";

// A process with Description required on the Task (seen in another organization on 06/11/2026:
// "TF401320: Rule Error for field Description. Error code: Required, InvalidEmpty." when the TicTask
// created a task under a User Story, and on any save of an old task without description).

const REQUIRED_DESCRIPTION = "TF401320: Rule Error for field Description. Error code: Required, InvalidEmpty.";
const toasts: string[] = [];
const createdOps: { path: string; value: unknown }[][] = [];

vi.mock("azure-devops-extension-sdk", () => ({}));
vi.mock("azure-devops-extension-api", () => ({ getClient: () => ({}) }));
vi.mock("azure-devops-extension-api/WorkItemTracking", () => ({ WorkItemTrackingServiceIds: { WorkItemFormService: "form" }, WorkItemExpand: {}, WorkItemTypeFieldsExpandLevel: {} }));
vi.mock("../src/common/sdk", () => ({
  SDK: {},
  toast: async (m: string) => void toasts.push(m),
  witClient: () => ({
    getWorkItem: async (id: number) => ({ id, url: `https://x/_apis/wit/workItems/${id}`, fields: {} }),
    createWorkItem: async (ops: { path: string; value: unknown }[]) => {
      createdOps.push(ops);
      return { id: 901, fields: { "System.Title": "Nova", "System.WorkItemType": "Task", "System.State": "Aberto" } };
    },
  }),
}));

const { isDescriptionRequired, requiredEmptyField } = await import("../src/common/errors");
const { withRequiredDescription } = await import("../src/common/wit/writer");
const { createTask } = await import("../src/common/wit/witService");

beforeEach(() => {
  toasts.length = 0;
  createdOps.length = 0;
});

describe("recognizing the rule", () => {
  it("reads the required field from the error", () => {
    expect(requiredEmptyField(new Error(REQUIRED_DESCRIPTION))).toBe("Description");
    expect(isDescriptionRequired(new Error(REQUIRED_DESCRIPTION))).toBe(true);
    expect(isDescriptionRequired({ serverError: { message: REQUIRED_DESCRIPTION.replace("Description", "Descrição") } })).toBe(true);
    expect(requiredEmptyField(new Error("TF401320: Rule Error for field Original Estimate. Error code: ReadOnly, InvalidNotOldValue."))).toBeNull();
    expect(isDescriptionRequired(new Error("TF401320: Rule Error for field Cliente. Error code: Required, InvalidEmpty."))).toBe(false);
  });
});

describe("saving an item without description", () => {
  const task: TaskInfo = { id: 12594, title: "Desenvolvimento <API>", type: "Task", state: "Em Desenvolvimento", original: 1, remaining: 1, completed: 0 };

  it("saves again with the title as description and tells the user", async () => {
    const sent: FieldChanges[] = [];
    const apply = withRequiredDescription(async (_id, compute) => {
      const changes = compute(task)!;
      sent.push(changes);
      if (!changes.description) throw new Error(REQUIRED_DESCRIPTION);
      return { before: task, after: task };
    });
    await apply(task.id, () => ({ completed: 0.5, remaining: 0.5 }));
    expect(sent).toEqual([
      { completed: 0.5, remaining: 0.5 },
      { completed: 0.5, remaining: 0.5, description: "Desenvolvimento &lt;API&gt;" },
    ]);
    expect(toasts).toEqual(["A #12594 exigia descrição: preenchida com o título."]);
  });

  it("does not touch the description for other refusals", async () => {
    const apply = withRequiredDescription(async () => {
      throw new Error("TF401320: Rule Error for field Cliente. Error code: Required, InvalidEmpty.");
    });
    await expect(apply(task.id, () => ({ completed: 1 }))).rejects.toThrow(/Cliente/);
    expect(toasts).toEqual([]);
  });
});

describe("creating a task", () => {
  it("always sends the description", async () => {
    const parent: TaskInfo = { id: 12593, title: "7044 - São Paulo", type: "User Story", state: "Ativo", original: null, remaining: null, completed: null };
    await createTask("nffinder", { parent, title: "Desenvolvimento", description: "Desenvolvimento<br>Criada pelo TicTask a partir de #12593.", assignedToEmail: "g@x.com", taskType: "Task", estimate: 1 });
    expect(createdOps[0]).toContainEqual({ op: "add", path: "/fields/System.Description", value: "Desenvolvimento<br>Criada pelo TicTask a partir de #12593." });
  });
});
