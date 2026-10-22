import { emit } from "../events";
import { extensionFullId } from "../sdk";
import { buildExport, prepareForImport, type ExportFile } from "../domain/exportFile";
import { mergeSettings } from "../domain/settings";
import { addDays, monthKeys, toLocalDate } from "../domain/time";
import type { Ctx } from "../actions";
import type { Settings, TimeEntry } from "../domain/types";
import { listMonth, saveEntry } from "./entriesRepo";
import { saveSettings } from "./settingsRepo";

/**
 * Months are stored as separate collections and there is no list of them, so the export scans
 * every month from this one until a year ahead (entries can be dated in the future).
 */
export const EXPORT_FIRST_MONTH = "2024-01-01";

export type Progress = (done: number, total: number) => void;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>, progress?: Progress): Promise<void> {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
      progress?.(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

export async function exportProject(ctx: Ctx, progress?: Progress): Promise<ExportFile> {
  const months = monthKeys(EXPORT_FIRST_MONTH, addDays(toLocalDate(new Date()), 366));
  const entries: TimeEntry[] = [];
  await pool(months, 6, async (key) => void entries.push(...(await listMonth(ctx.projectId, key))), progress);
  return buildExport(entries, ctx.settings, { by: ctx.user, extension: extensionFullId(), projectId: ctx.projectId, projectName: ctx.projectName, at: new Date().toISOString() });
}

/**
 * Writes the exported entries into this extension's storage (same ids → re-running is safe).
 * Work item fields are not touched: Completed/Remaining were already applied when the hours
 * were logged in the source extension.
 */
export async function importProject(ctx: Ctx, file: ExportFile, options: { settings: boolean }, progress?: Progress): Promise<{ entries: number; settings?: Settings }> {
  const entries = prepareForImport(file.entries, { projectId: ctx.projectId, by: ctx.user.displayName, at: new Date().toISOString(), sourceExtension: file.source.extension });
  await pool(entries, 5, async (e) => void (await saveEntry(e)), progress);
  let settings: Settings | undefined;
  if (options.settings && file.settings) {
    settings = mergeSettings(file.settings);
    await saveSettings(ctx.projectId, settings);
  }
  emit({ type: "entries", workItemIds: [...new Set(entries.map((e) => e.workItemId))] });
  return { entries: entries.length, settings };
}
