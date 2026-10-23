import { getDataManager } from "../sdk";
import { monthKey, monthKeys } from "../domain/time";
import type { TimeEntry } from "../domain/types";

// Each entry is stored twice with the same id:
//   te-{projectId}-{yyyyMM}   canonical, read by the timesheet/calendar (one collection per month)
//   tw-{projectId}-{wiId}     index read by the work item views
// getDocuments returns a whole collection, so partitioning keeps each read small.

const monthCollection = (projectId: string, date: string) => `te-${projectId}-${monthKey(date)}`;
const workItemCollection = (projectId: string, workItemId: number) => `tw-${projectId}-${workItemId}`;

/**
 * The document as written: __etag -1 overwrites without a version check. An entry read from one
 * collection carries that collection's version, and without a version an update could also fail
 * with "The document version does not match" (seen deleting an entry in ADO on 23/10/2026, after
 * the hours had already gone back to the task). Only the author changes an entry, so there is no
 * concurrent writer to protect against.
 */
function strip(entry: TimeEntry): TimeEntry {
  const { __etag: _ignored, ...rest } = entry;
  return { ...rest, __etag: -1 };
}

async function readCollection(name: string): Promise<TimeEntry[]> {
  const dm = await getDataManager();
  try {
    return (await dm.getDocuments(name)) as TimeEntry[];
  } catch (e) {
    // A collection only exists after its first document is written.
    if (isNotFound(e)) return [];
    throw e;
  }
}

function isNotFound(e: unknown): boolean {
  const err = e as { status?: number; serverError?: { typeKey?: string }; message?: string };
  return err?.status === 404 || /DoesNotExist|NotFound/i.test(err?.serverError?.typeKey ?? err?.message ?? "");
}

export async function saveEntry(entry: TimeEntry, previous?: TimeEntry): Promise<TimeEntry> {
  const dm = await getDataManager();
  const doc = strip(entry);
  if (previous && monthKey(previous.date) !== monthKey(entry.date)) {
    await dm.deleteDocument(monthCollection(previous.projectId, previous.date), previous.id).catch(() => undefined);
  }
  const saved = (await dm.setDocument(monthCollection(entry.projectId, entry.date), doc)) as TimeEntry;
  await dm.setDocument(workItemCollection(entry.projectId, entry.workItemId), doc);
  if (previous && previous.workItemId !== entry.workItemId) {
    await dm.deleteDocument(workItemCollection(previous.projectId, previous.workItemId), previous.id).catch(() => undefined);
  }
  return saved;
}

export async function listByWorkItem(projectId: string, workItemId: number, includeDeleted = false): Promise<TimeEntry[]> {
  const docs = await readCollection(workItemCollection(projectId, workItemId));
  return sortEntries(includeDeleted ? docs : docs.filter((e) => !e.deleted));
}

export async function listByWorkItems(projectId: string, workItemIds: number[], includeDeleted = false): Promise<TimeEntry[]> {
  const lists = await Promise.all(workItemIds.map((id) => listByWorkItem(projectId, id, includeDeleted)));
  return sortEntries(lists.flat());
}

/** Entries whose day is within from..to (inclusive), optionally for one user. */
export async function listByRange(projectId: string, from: string, to: string, userId?: string): Promise<TimeEntry[]> {
  const lists = await Promise.all(monthKeys(from, to).map((k) => readCollection(`te-${projectId}-${k}`)));
  return sortEntries(lists.flat().filter((e) => !e.deleted && e.date >= from && e.date <= to && (!userId || e.userId === userId)));
}

/** All documents of one month ("yyyyMM"), deleted ones included. */
export function listMonth(projectId: string, key: string): Promise<TimeEntry[]> {
  return readCollection(`te-${projectId}-${key}`);
}

export function newEntryId(): string {
  return crypto.randomUUID();
}

function sortEntries(list: TimeEntry[]): TimeEntry[] {
  return list.sort((a, b) => b.start.localeCompare(a.start));
}
