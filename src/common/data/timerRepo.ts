import { emit } from "../events";
import { getDataManager } from "../sdk";
import type { ActiveTimer } from "../domain/types";
import { publishPresence, removePresence } from "./presenceRepo";

// One running timer per user, stored in the user's private scope. It only holds timestamps,
// so it keeps counting with the browser closed.
const COLLECTION = "timer";
const USER_SCOPE = { scopeType: "User" };

export async function getTimer(): Promise<ActiveTimer | null> {
  const dm = await getDataManager();
  try {
    return ((await dm.getDocument(COLLECTION, "active", USER_SCOPE)) as ActiveTimer) ?? null;
  } catch {
    return null;
  }
}

export async function saveTimer(timer: ActiveTimer): Promise<ActiveTimer> {
  const dm = await getDataManager();
  // The timer is private and has a single writer (its owner), so it is always overwritten: __etag
  // -1 skips the version check. Without it, resuming a paused timer failed with "The document
  // version does not match" (seen in ADO on 23/10/2026).
  const doc = { ...timer, __etag: -1 };
  const saved = ((await dm.setDocument(COLLECTION, doc, USER_SCOPE)) as ActiveTimer | undefined) ?? doc;
  // The team view is a convenience: failing to publish it must not break the timer.
  await publishPresence(saved).catch((e) => console.warn("presence", e));
  emit({ type: "timer", timer: saved });
  return saved;
}

export async function clearTimer(projectId: string): Promise<void> {
  const dm = await getDataManager();
  await dm.deleteDocument(COLLECTION, "active", USER_SCOPE).catch(() => undefined);
  await removePresence(projectId).catch(() => undefined);
  emit({ type: "timer", timer: null });
}
