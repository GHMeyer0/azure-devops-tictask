import { WorkItemTrackingServiceIds, type IWorkItemFormService } from "azure-devops-extension-api/WorkItemTracking";
import { isDescriptionRequired } from "../errors";
import { withRetry } from "../retry";
import { SDK, toast } from "../sdk";
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

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Description written to an item without one when the process requires it: its title. */
export const descriptionFromTitle = (item: Pick<TaskInfo, "title">) => escapeHtml(item.title);

/**
 * A process may require Description ("TF401320: Rule Error for field Description. Error code:
 * Required, InvalidEmpty": seen in another organization on 06/11/2026). Such a rule refuses any save
 * of an item without one, also the hours of an old task: the save is repeated with the title as
 * description, and the user is told.
 */
export function withRequiredDescription(apply: WorkItemWriter["apply"]): WorkItemWriter["apply"] {
  return async (id, compute) => {
    try {
      return await apply(id, compute);
    } catch (e) {
      if (!isDescriptionRequired(e)) throw e;
      const result = await apply(id, (current) => {
        const changes = compute(current);
        return changes ? { ...changes, description: changes.description ?? descriptionFromTitle(current) } : null;
      });
      void toast(`A #${id} exigia descrição: preenchida com o título.`);
      return result;
    }
  };
}

export const restWriter: WorkItemWriter = { apply: withRequiredDescription(applyWithRetry) };

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
      if (id !== formId) return restWriter.apply(id, compute);
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
      if (changes.description) put(F.description, changes.description, "");
      await form.setFieldValues(values);
      try {
        let invalid = (await form.isValid()) ? [] : await form.getInvalidFields();
        // A required Description left empty: filled with the title, as for the items saved through REST.
        if (invalid.some((f) => f.referenceName === F.description) && !values[F.description]) {
          values[F.description] = descriptionFromTitle(before);
          previous[F.description] = "";
          await form.setFieldValue(F.description, values[F.description]);
          invalid = (await form.isValid()) ? [] : await form.getInvalidFields();
          void toast(`A #${id} exigia descrição: preenchida com o título.`);
        }
        if (invalid.length) {
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
