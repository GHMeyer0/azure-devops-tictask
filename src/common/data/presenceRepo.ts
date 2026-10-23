import { getDataManager, getUser } from "../sdk";
import type { ActiveTimer, Presence } from "../domain/types";
import { getSettings } from "./settingsRepo";

// The timer itself is private (user scope). When the project allows it, a copy of its status is
// kept in a project-wide collection, one document per user, so the team can see who is working
// on what ("Time agora").
const collection = (projectId: string) => `presence-${projectId}`;

export async function publishPresence(timer: ActiveTimer): Promise<void> {
  const settings = await getSettings(timer.projectId);
  if (!settings.teamPresence) return removePresence(timer.projectId);
  const user = getUser();
  const last = timer.pauses?.at(-1);
  const doc: Presence = {
    id: user.id,
    projectId: timer.projectId,
    userName: user.displayName,
    userEmail: user.email,
    status: timer.status,
    workItem: timer.workItem,
    activity: timer.activity,
    segments: timer.segments,
    pausedState: timer.status === "paused" ? last?.state : undefined,
    pausedReason: timer.status === "paused" ? last?.reason : undefined,
    updatedAt: new Date().toISOString(),
  };
  const dm = await getDataManager();
  // One document per user, written only by that user: overwrite without a version check.
  await dm.setDocument(collection(timer.projectId), { ...doc, __etag: -1 });
}

/**
 * After a pause the timer is gone; the team still sees which task the user left and why, until
 * the next timer starts.
 */
export async function publishPaused(projectId: string, paused: Pick<Presence, "workItem" | "activity" | "pausedState" | "pausedReason">): Promise<void> {
  const settings = await getSettings(projectId);
  if (!settings.teamPresence) return;
  const user = getUser();
  const doc: Presence = {
    id: user.id,
    projectId,
    userName: user.displayName,
    userEmail: user.email,
    status: "paused",
    segments: [],
    ...paused,
    updatedAt: new Date().toISOString(),
  };
  const dm = await getDataManager();
  await dm.setDocument(collection(projectId), { ...doc, __etag: -1 });
}

export async function removePresence(projectId: string): Promise<void> {
  const dm = await getDataManager();
  await dm.deleteDocument(collection(projectId), getUser().id).catch(() => undefined);
}

export async function listPresence(projectId: string): Promise<Presence[]> {
  const dm = await getDataManager();
  try {
    return ((await dm.getDocuments(collection(projectId))) as Presence[]).sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
  } catch {
    return []; // collection does not exist until the first timer is shared
  }
}
