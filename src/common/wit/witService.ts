import { WorkItemExpand, WorkItemTypeFieldsExpandLevel, type WorkItem } from "azure-devops-extension-api/WorkItemTracking";
import type { JsonPatchOperation } from "azure-devops-extension-api/WebApi";
import { demoActive, demoScan } from "../demo";
import { withRetry } from "../retry";
import { witClient } from "../sdk";
import type { TaskInfo } from "../domain/types";

export const F = {
  id: "System.Id",
  title: "System.Title",
  type: "System.WorkItemType",
  state: "System.State",
  assignedTo: "System.AssignedTo",
  parent: "System.Parent",
  area: "System.AreaPath",
  iteration: "System.IterationPath",
  rev: "System.Rev",
  history: "System.History",
  original: "Microsoft.VSTS.Scheduling.OriginalEstimate",
  remaining: "Microsoft.VSTS.Scheduling.RemainingWork",
  completed: "Microsoft.VSTS.Scheduling.CompletedWork",
  activity: "Microsoft.VSTS.Common.Activity",
  stateChangeDate: "Microsoft.VSTS.Common.StateChangeDate",
} as const;

export const INFO_FIELDS = [F.id, F.title, F.type, F.state, F.assignedTo, F.parent, F.area, F.iteration, F.rev, F.original, F.remaining, F.completed, F.activity, F.stateChangeDate];

/** Field changes the extension writes to a work item. */
export interface FieldChanges {
  completed?: number;
  remaining?: number;
  original?: number;
  state?: string;
  /** Line added to the work item discussion. */
  history?: string;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/** AssignedTo comes as an IdentityRef from REST and as "Name <email>" from the form service. */
export function parseIdentity(v: unknown): TaskInfo["assignedTo"] {
  if (!v) return undefined;
  if (typeof v === "string") {
    const m = /^(.*?)\s*<([^>]+)>$/.exec(v);
    return m ? { displayName: m[1], email: m[2] } : { displayName: v, email: v };
  }
  const o = v as { displayName?: string; uniqueName?: string; id?: string };
  return { displayName: o.displayName ?? o.uniqueName ?? "", email: o.uniqueName ?? "", id: o.id };
}

export function toTaskInfo(fields: Record<string, unknown>, id: number): TaskInfo {
  // The form service (open work item) is not a REST client, so the demo mode sees it here.
  if (demoActive()) demoScan(fields);
  return {
    id,
    title: String(fields[F.title] ?? ""),
    type: String(fields[F.type] ?? ""),
    state: String(fields[F.state] ?? ""),
    assignedTo: parseIdentity(fields[F.assignedTo]),
    parentId: num(fields[F.parent]) ?? undefined,
    areaPath: fields[F.area] as string | undefined,
    iterationPath: fields[F.iteration] as string | undefined,
    rev: num(fields[F.rev]) ?? undefined,
    activity: (fields[F.activity] as string | undefined) || undefined,
    original: num(fields[F.original]),
    remaining: num(fields[F.remaining]),
    completed: num(fields[F.completed]),
    // REST returns an ISO string, the form service a Date.
    stateChangedAt: fields[F.stateChangeDate] ? new Date(fields[F.stateChangeDate] as string).toISOString() : undefined,
  };
}

const fromWorkItem = (wi: WorkItem) => toTaskInfo(wi.fields, wi.id);

export async function getWorkItem(id: number): Promise<TaskInfo> {
  return fromWorkItem(await witClient().getWorkItem(id, undefined, INFO_FIELDS));
}

export async function getWorkItems(ids: number[]): Promise<TaskInfo[]> {
  const unique = [...new Set(ids)];
  const out: TaskInfo[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    const batch = await witClient().getWorkItems(unique.slice(i, i + 200), undefined, INFO_FIELDS);
    out.push(...batch.filter(Boolean).map(fromWorkItem));
  }
  return out;
}

/** Like getWorkItems, but ids that no longer exist (or are not visible) are skipped instead of failing. */
export async function getExistingWorkItems(ids: number[]): Promise<TaskInfo[]> {
  const unique = [...new Set(ids)];
  const out: TaskInfo[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    // 2 = WorkItemErrorPolicy.Omit (a const enum, not usable with isolatedModules).
    const batch = await witClient().getWorkItems(unique.slice(i, i + 200), undefined, INFO_FIELDS, undefined, undefined, 2 as never);
    out.push(...batch.filter(Boolean).map(fromWorkItem));
  }
  return out;
}

/** Child work items (hierarchy links) of a parent. */
export async function getChildren(parentId: number): Promise<TaskInfo[]> {
  const parent = await witClient().getWorkItem(parentId, undefined, undefined, undefined, WorkItemExpand.Relations);
  const ids = (parent.relations ?? [])
    .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
    .map((r) => Number(r.url.substring(r.url.lastIndexOf("/") + 1)))
    .filter((n) => Number.isFinite(n));
  if (!ids.length) return [];
  return (await getWorkItems(ids)).sort((a, b) => a.id - b.id);
}

// The API typing of JsonPatchOperation requires `from`, which add/test operations do not use.
type PatchOp = { op: "add" | "test"; path: string; value: unknown };
const asPatch = (ops: PatchOp[]) => ops as unknown as JsonPatchOperation[];

function patchFor(changes: FieldChanges, expectedRev?: number): PatchOp[] {
  const ops: PatchOp[] = [];
  if (expectedRev !== undefined) ops.push({ op: "test", path: "/rev", value: expectedRev });
  const set = (field: string, value: unknown) => ops.push({ op: "add", path: `/fields/${field}`, value });
  if (changes.completed !== undefined) set(F.completed, changes.completed);
  if (changes.remaining !== undefined) set(F.remaining, changes.remaining);
  if (changes.original !== undefined) set(F.original, changes.original);
  if (changes.state !== undefined) set(F.state, changes.state);
  if (changes.history) set(F.history, changes.history);
  return ops;
}

export async function updateWorkItem(id: number, changes: FieldChanges, expectedRev?: number): Promise<TaskInfo> {
  return fromWorkItem(await witClient().updateWorkItem(asPatch(patchFor(changes, expectedRev)), id));
}

/**
 * Reads the item, computes the changes from its current values and writes them guarded by the
 * revision. If someone saved the item in between, it re-reads and recomputes once.
 */
export async function applyWithRetry(id: number, compute: (current: TaskInfo) => FieldChanges | null): Promise<{ before: TaskInfo; after: TaskInfo }> {
  for (let attempt = 0; ; attempt++) {
    const before = await withRetry(() => getWorkItem(id));
    const changes = compute(before);
    if (!changes || !Object.keys(changes).length) return { before, after: before };
    try {
      // A retried save that had gone through fails the revision test and is recomputed below.
      const after = await withRetry(() => updateWorkItem(id, changes, before.rev));
      return { before, after };
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
}

export interface NewTask {
  parent: TaskInfo;
  title: string;
  activityWit?: string;
  estimate?: number;
  assignedToEmail: string;
  taskType: string;
}

export async function createTask(projectName: string, t: NewTask): Promise<TaskInfo> {
  const parentUrl = (await witClient().getWorkItem(t.parent.id, undefined, [F.id])).url;
  const allowed = t.activityWit ? await allowedActivities(projectName, t.taskType) : [];
  const ops: PatchOp[] = [
    { op: "add", path: `/fields/${F.title}`, value: t.title },
    { op: "add", path: `/fields/${F.assignedTo}`, value: t.assignedToEmail },
    { op: "add", path: "/relations/-", value: { rel: "System.LinkTypes.Hierarchy-Reverse", url: parentUrl } },
  ];
  if (t.parent.areaPath) ops.push({ op: "add", path: `/fields/${F.area}`, value: t.parent.areaPath });
  if (t.parent.iterationPath) ops.push({ op: "add", path: `/fields/${F.iteration}`, value: t.parent.iterationPath });
  if (t.estimate) {
    ops.push({ op: "add", path: `/fields/${F.original}`, value: t.estimate });
    ops.push({ op: "add", path: `/fields/${F.remaining}`, value: t.estimate });
  }
  if (t.activityWit && allowed.includes(t.activityWit)) ops.push({ op: "add", path: `/fields/${F.activity}`, value: t.activityWit });
  const wi = await witClient().createWorkItem(asPatch(ops), projectName, t.taskType);
  return fromWorkItem(wi);
}

// Process metadata (types, states, picklists) rarely changes: one request per key per page load.
// Failures resolve to [] and are not cached, so a later call retries.
const metaCache = new Map<string, Promise<string[]>>();

function cachedList(key: string, load: () => Promise<string[]>): Promise<string[]> {
  let p = metaCache.get(key);
  if (!p) {
    p = Promise.resolve()
      .then(load)
      .catch(() => {
        metaCache.delete(key);
        return [];
      });
    metaCache.set(key, p);
  }
  return p;
}

/** Allowed values of Microsoft.VSTS.Common.Activity (empty when the process has no picklist). */
export function allowedActivities(projectName: string, taskType: string): Promise<string[]> {
  return cachedList(`activity/${projectName}/${taskType}`, () =>
    witClient()
      .getWorkItemTypeFieldWithReferences(projectName, taskType, F.activity, WorkItemTypeFieldsExpandLevel.AllowedValues)
      .then((f) => (f.allowedValues ?? []).map(String)),
  );
}

/** Enabled work item types of the project (names, sorted). */
export function workItemTypes(projectName: string): Promise<string[]> {
  return cachedList(`types/${projectName}`, () =>
    witClient()
      .getWorkItemTypes(projectName)
      .then((types) => types.filter((t) => !t.isDisabled).map((t) => t.name).sort((a, b) => a.localeCompare(b, "pt-BR"))),
  );
}

/** States of a work item type, in the process order. */
export function workItemTypeStates(projectName: string, type: string): Promise<string[]> {
  if (!type.trim()) return Promise.resolve([]);
  return cachedList(`states/${projectName}/${type}`, () =>
    witClient()
      .getWorkItemTypeStates(projectName, type)
      .then((states) => states.map((s) => s.name)),
  );
}

/** Union of the states of several types (e.g. the parent types US/Bug/TS), first-seen order. */
export async function statesOfTypes(projectName: string, types: string[]): Promise<string[]> {
  const lists = await Promise.all(types.map((t) => workItemTypeStates(projectName, t)));
  return [...new Set(lists.flat())];
}

/** Tasks for the picker: open tasks assigned to me, or matching an id / title text. */
export async function searchTasks(projectName: string, taskType: string, closedStates: string[], text: string): Promise<TaskInfo[]> {
  const q = text.trim();
  const esc = (s: string) => s.replace(/'/g, "''");
  const notClosed = closedStates.length ? `AND [System.State] NOT IN (${closedStates.map((s) => `'${esc(s)}'`).join(",")})` : "";
  let filter: string;
  if (!q) filter = `AND [System.AssignedTo] = @Me ${notClosed}`;
  else if (/^#?\d+$/.test(q)) filter = `AND [System.Id] = ${q.replace("#", "")}`;
  else filter = `AND [System.Title] CONTAINS '${esc(q)}' ${notClosed}`;
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = '${esc(taskType)}' ${filter} ORDER BY [System.ChangedDate] DESC`;
  const result = await witClient().queryByWiql({ query }, projectName, undefined, false, 50);
  const ids = result.workItems.map((w) => w.id);
  return ids.length ? getWorkItems(ids).then((list) => ids.map((id) => list.find((t) => t.id === id)!).filter(Boolean)) : [];
}

/** My tasks currently in one of `states` (e.g. Stopped/Waiting, or Active). */
export async function myTasksInStates(projectName: string, taskType: string, states: string[]): Promise<TaskInfo[]> {
  if (!states.length) return [];
  const esc = (s: string) => s.replace(/'/g, "''");
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = '${esc(taskType)}' AND [System.AssignedTo] = @Me AND [System.State] IN (${states.map((s) => `'${esc(s)}'`).join(",")}) ORDER BY [System.ChangedDate] DESC`;
  const result = await witClient().queryByWiql({ query }, projectName, undefined, false, 50);
  const ids = result.workItems.map((w) => w.id);
  return ids.length ? getWorkItems(ids) : [];
}

/** Titles of the given ids (used for parent titles). */
export async function titlesOf(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const items = await witClient().getWorkItems([...new Set(ids)], undefined, [F.title]);
  return new Map(items.filter(Boolean).map((w) => [w.id, String(w.fields[F.title])]));
}
