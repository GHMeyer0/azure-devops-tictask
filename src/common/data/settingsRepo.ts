import { getDataManager } from "../sdk";
import { mergeSettings } from "../domain/settings";
import type { Settings } from "../domain/types";

const key = (projectId: string) => `settings-${projectId}`;
const cache = new Map<string, Promise<Settings>>();

export function getSettings(projectId: string): Promise<Settings> {
  let p = cache.get(projectId);
  if (!p) {
    p = getDataManager()
      .then((dm) => dm.getValue<Partial<Settings>>(key(projectId), { defaultValue: null }))
      .then(mergeSettings)
      .catch(() => mergeSettings(null));
    cache.set(projectId, p);
  }
  return p;
}

export async function saveSettings(projectId: string, settings: Settings): Promise<void> {
  const dm = await getDataManager();
  await dm.setValue(key(projectId), settings);
  cache.set(projectId, Promise.resolve(settings));
}
