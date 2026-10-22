import { WorkItemTrackingServiceIds, type IWorkItemFormService } from "azure-devops-extension-api/WorkItemTracking";
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
      if (changes.completed !== undefined) values[F.completed] = changes.completed;
      if (changes.remaining !== undefined) values[F.remaining] = changes.remaining;
      if (changes.original !== undefined) values[F.original] = changes.original;
      if (changes.state !== undefined) values[F.state] = changes.state;
      if (changes.history) values[F.history] = changes.history;
      await form.setFieldValues(values);
      if (!(await form.isValid())) {
        const invalid = await form.getInvalidFields();
        throw new Error(`O work item tem campos inválidos (${invalid.map((f) => f.name).join(", ")}). Corrija e tente novamente.`);
      }
      await form.save();
      return { before, after: await readForm(form) };
    },
  };
}
