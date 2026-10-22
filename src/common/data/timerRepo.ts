import { emit } from "../events";
import { getDataManager } from "../sdk";
import type { ActiveTimer } from "../domain/types";

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
  const { __etag: _ignored, ...doc } = timer;
  const saved = (await dm.setDocument(COLLECTION, doc, USER_SCOPE)) as ActiveTimer;
  emit({ type: "timer" });
  return saved;
}

export async function clearTimer(): Promise<void> {
  const dm = await getDataManager();
  await dm.deleteDocument(COLLECTION, "active", USER_SCOPE).catch(() => undefined);
  emit({ type: "timer" });
}
