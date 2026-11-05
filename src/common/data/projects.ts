import { demoProject } from "../demo";
import { coreClient, getProject } from "../sdk";

// Projects of the organization the user can open. The entries of every project live in the same
// Extension Data store (collections named after the project id), so the hub can show the user's
// hours across projects; the list keeps it to projects the user has access to.

export interface ProjectRef {
  id: string;
  name: string;
}

let cache: Promise<ProjectRef[]> | undefined;

export function listProjects(): Promise<ProjectRef[]> {
  cache ??= (async () => {
    // The current project first: in demo mode it is the one shown as "Contoso".
    const current = await getProject();
    const out: ProjectRef[] = [];
    for (let skip = 0; ; skip += PAGE) {
      const page = await coreClient().getProjects(undefined, PAGE, skip);
      out.push(...page.map((p) => ({ id: p.id, name: p.name })));
      if (page.length < PAGE) break;
    }
    if (!out.some((p) => p.id === current.id)) out.push(current);
    out.sort((a, b) => (a.id === current.id ? -1 : b.id === current.id ? 1 : a.name.localeCompare(b.name, "pt-BR")));
    out.forEach((p) => demoProject(p.name));
    return out;
  })().catch((e) => {
    cache = undefined;
    throw e;
  });
  return cache;
}

const PAGE = 500;

/** A project by id or name (the work item field System.TeamProject holds the name). */
export async function findProject(ref: { id?: string; name?: string }): Promise<ProjectRef | undefined> {
  const list = await listProjects();
  return list.find((p) => (ref.id ? p.id === ref.id : p.name === ref.name));
}
