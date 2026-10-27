import { coreClient } from "../sdk";

export interface Person {
  /** Lowercase e-mail (identity uniqueName). */
  email: string;
  name: string;
  /** Identity id (the user id entries carry). */
  id: string;
}

const cache = new Map<string, Promise<Person[]>>();

async function load(projectId: string): Promise<Person[]> {
  const teams = await coreClient().getTeams(projectId);
  const lists = await Promise.all(teams.map((t) => coreClient().getTeamMembersWithExtendedProperties(projectId, t.id).catch(() => [])));
  const map = new Map<string, Person>();
  for (const m of lists.flat()) {
    const email = (m.identity.uniqueName ?? "").toLowerCase();
    if (email.includes("@") && !m.identity.isContainer) map.set(email, { email, name: m.identity.displayName, id: m.identity.id });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Everyone in the project's teams, one per e-mail, sorted by name. */
export function loadPeople(projectId: string): Promise<Person[]> {
  let p = cache.get(projectId);
  if (!p) {
    p = load(projectId).catch((e) => {
      cache.delete(projectId);
      throw e;
    });
    cache.set(projectId, p);
  }
  return p;
}
