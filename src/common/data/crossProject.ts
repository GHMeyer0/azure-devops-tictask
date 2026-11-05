import { ctxFor, type Ctx } from "../actions";
import type { TimeEntry } from "../domain/types";
import { listByRange } from "./entriesRepo";
import { listProjects, type ProjectRef } from "./projects";
import { isManager } from "./roles";
import { getSettings } from "./settingsRepo";

// Entries of a period across the projects the user can open (Resumo, Calendário, Meu tempo).
// Everyone sees their own hours in every project; other people's hours only in the projects where
// the user is a manager (being a manager of one client's project does not open the others).

export interface CrossEntries {
  entries: TimeEntry[];
  /** Names of the projects read, by id (current project first). */
  projects: Map<string, string>;
}

export async function loadEntries(
  ctx: Ctx,
  from: string,
  to: string,
  opts: {
    /** Every project the user can open, or only the page's project. */
    allProjects: boolean;
    /** Other people's entries too (where the user is a manager); otherwise only the user's own. */
    others: boolean;
    /** The user is a manager of the page's project (already known by the page). */
    manager: boolean;
  },
): Promise<CrossEntries> {
  const list: ProjectRef[] = opts.allProjects ? await listProjects() : [{ id: ctx.projectId, name: ctx.projectName }];
  const userId = opts.others ? undefined : ctx.user.id;
  const lists = await Promise.all(list.map((p) => listByRange(p.id, from, to, userId)));
  let entries = lists.flat();

  if (opts.others) {
    const otherProjects = [...new Set(entries.filter((e) => e.userId !== ctx.user.id && e.projectId !== ctx.projectId).map((e) => e.projectId))];
    const managed = new Set(opts.manager ? [ctx.projectId] : []);
    await Promise.all(
      otherProjects.map(async (id) => {
        const other = await ctxFor(ctx, { id }).catch(() => null);
        if (other && (await isManager(other))) managed.add(id);
      }),
    );
    entries = entries.filter((e) => e.userId === ctx.user.id || managed.has(e.projectId));
  }

  // The edit limit and the activity colors of each entry come from its project's settings.
  await Promise.all([...new Set(entries.map((e) => e.projectId))].map((id) => getSettings(id)));
  entries.sort((a, b) => b.start.localeCompare(a.start));
  return { entries, projects: new Map(list.map((p) => [p.id, p.name])) };
}
