import { getDataManager } from "../sdk";
import { mergeSettings } from "../domain/settings";
import type { Settings } from "../domain/types";

const key = (projectId: string) => `settings-${projectId}`;
const cache = new Map<string, Promise<Settings>>();
/** Settings already read, for synchronous checks (e.g. the edit limit of another project's entry). */
const loaded = new Map<string, Settings>();

export function getSettings(projectId: string): Promise<Settings> {
  let p = cache.get(projectId);
  if (!p) {
    p = getDataManager()
      .then((dm) => dm.getValue<Partial<Settings>>(key(projectId), { defaultValue: null }))
      .then(mergeSettings)
      .catch(() => mergeSettings(null))
      .then((s) => (loaded.set(projectId, s), s));
    cache.set(projectId, p);
  }
  return p;
}

/** The settings of a project when getSettings already read them. */
export function peekSettings(projectId: string): Settings | undefined {
  return loaded.get(projectId);
}

export async function saveSettings(projectId: string, settings: Settings): Promise<void> {
  const dm = await getDataManager();
  await dm.setValue(key(projectId), settings);
  cache.set(projectId, Promise.resolve(settings));
  loaded.set(projectId, settings);
}
