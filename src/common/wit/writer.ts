import { WorkItemTrackingServiceIds, type IWorkItemFormService } from "azure-devops-extension-api/WorkItemTracking";
import { withRetry } from "../retry";
import { SDK } from "../sdk";
import type { TaskInfo } from "../domain/types";
import { applyWithRetry, F, INFO_FIELDS, toTaskInfo, type FieldChanges } from "./witService";

/**
 * Writes hours/state to work items. The item open in the form is changed through the form
 * service (so the open form never goes stale and the user's own edits are kept); any other
 * item goes through REST with a revision check.
 */
export interface WorkItemWriter {
  apply(id: number, compute: (current: TaskInfo) => FieldChanges | null): Promise<{ before: TaskInfo; after: TaskInfo }>;
}

export const restWriter: WorkItemWriter = { apply: applyWithRetry };

export async function getFormService(): Promise<IWorkItemFormService> {
  return SDK.getService<IWorkItemFormService>(WorkItemTrackingServiceIds.WorkItemFormService);
}

export async function readForm(form: IWorkItemFormService): Promise<TaskInfo> {
  const id = await form.getId();
  const values = (await form.getFieldValues(INFO_FIELDS, { returnOriginalValue: false })) as Record<string, unknown>;
  return toTaskInfo(values, id);
}

export function formWriter(form: IWorkItemFormService, formId: number): WorkItemWriter {
  return {
    async apply(id, compute) {
      if (id !== formId) return applyWithRetry(id, compute);
      const before = await readForm(form);
      const changes = compute(before);
      if (!changes) return { before, after: before };
      const values: Record<string, Object> = {};
      const previous: Record<string, Object> = {};
      const put = (field: string, value: Object, old: unknown) => ((values[field] = value), (previous[field] = (old ?? "") as Object));
      if (changes.completed !== undefined) put(F.completed, changes.completed, before.completed);
      if (changes.remaining !== undefined) put(F.remaining, changes.remaining, before.remaining);
      if (changes.original !== undefined) put(F.original, changes.original, before.original);
      if (changes.state !== undefined) put(F.state, changes.state, before.state);
      if (changes.history) put(F.history, changes.history, "");
      await form.setFieldValues(values);
      try {
        if (!(await form.isValid())) {
          const invalid = await form.getInvalidFields();
          throw new Error(`O work item tem campos inválidos (${invalid.map((f) => f.name).join(", ")}). Corrija e tente novamente.`);
        }
        await withRetry(() => form.save());
      } catch (e) {
        // Put back what was there (the user's own unsaved edits included): the hours left in the form
        // must not be saved by hand later without their entry.
        await form.setFieldValues(previous).catch((err) => console.warn("form restore", err));
        throw e;
      }
      return { before, after: await readForm(form) };
    },
  };
}
