import { emit } from "../events";
import { getDataManager } from "../sdk";
import type { ActiveTimer } from "../domain/types";
import { publishPresence, removePresence } from "./presenceRepo";

// One running timer per user, stored in the user's private scope. It only holds timestamps,
// so it keeps counting with the browser closed.
const COLLECTION = "timer";
const USER_SCOPE = { scopeType: "User" };

/**
 * The stored document: the timer, or a "cleared" marker left when it is paused or concluded.
 * A read right after a save can still return the previous version (pausing seconds after starting
 * showed "Timer atualizado" in ADO on 23/10/2026), so every save carries savedAt and the marker
 * keeps the time of the clear: an older document than the one on screen is that stale copy.
 */
export type TimerDoc = (ActiveTimer & { cleared?: false }) | { id: "active"; cleared: true; savedAt: string };

export async function readTimerDoc(): Promise<TimerDoc | null> {
  const dm = await getDataManager();
  try {
    return ((await dm.getDocument(COLLECTION, "active", USER_SCOPE)) as TimerDoc) ?? null;
  } catch {
    return null;
  }
}

export const timerOf = (doc: TimerDoc | null): ActiveTimer | null => (doc && !doc.cleared ? doc : null);

export async function getTimer(): Promise<ActiveTimer | null> {
  return timerOf(await readTimerDoc());
}

/** Whether `doc` was saved before `savedAt` (a stale read). Documents from older versions have no savedAt. */
export function isOlder(doc: { savedAt?: string } | null, savedAt: string | undefined): boolean {
  return !!savedAt && (doc?.savedAt ?? "") < savedAt;
}

export async function saveTimer(timer: ActiveTimer): Promise<ActiveTimer> {
  const dm = await getDataManager();
  // The timer is private and has a single writer (its owner), so it is always overwritten: __etag
  // -1 skips the version check. Without it, resuming a paused timer failed with "The document
  // version does not match" (seen in ADO on 23/10/2026).
  const doc = { ...timer, cleared: false, savedAt: new Date().toISOString(), __etag: -1 };
  const saved = ((await dm.setDocument(COLLECTION, doc, USER_SCOPE)) as ActiveTimer | undefined) ?? doc;
  // The team view is a convenience: failing to publish it must not break the timer.
  await publishPresence(saved).catch((e) => console.warn("presence", e));
  emit({ type: "timer", timer: saved, savedAt: doc.savedAt });
  return saved;
}

export async function clearTimer(projectId: string): Promise<void> {
  const dm = await getDataManager();
  const savedAt = new Date().toISOString();
  await dm.setDocument(COLLECTION, { id: "active", cleared: true, savedAt, __etag: -1 }, USER_SCOPE).catch(() => undefined);
  await removePresence(projectId).catch(() => undefined);
  emit({ type: "timer", timer: null, savedAt });
}
