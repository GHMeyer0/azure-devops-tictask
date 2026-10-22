import { useEffect, useState } from "react";
import type { Ctx } from "../actions";
import { coreClient } from "../sdk";

// "Gestor" = administrator of any team of the project (TeamMember.isTeamAdmin, readable with the
// vso.project scope the extension already has) or listed in Settings › Gestores. Checking the
// Project Administrators group would need vso.security_manage, too broad for this extension.
//
// This only controls what the UI shows: the data lives in Extension Data, which any project
// member can technically read through the REST API.

const cache = new Map<string, Promise<boolean>>();

async function check(ctx: Ctx): Promise<boolean> {
  const me = ctx.user.email.toLowerCase();
  if (ctx.settings.managers.some((m) => m.trim().toLowerCase() === me)) return true;
  const teams = await coreClient().getTeams(ctx.projectId, true);
  for (const team of teams) {
    const members = await coreClient().getTeamMembersWithExtendedProperties(ctx.projectId, team.id);
    if (members.some((m) => m.isTeamAdmin && (m.identity.id === ctx.user.id || m.identity.uniqueName?.toLowerCase() === me))) return true;
  }
  return false;
}

export function isManager(ctx: Ctx): Promise<boolean> {
  const key = `${ctx.projectId}/${ctx.user.id}/${ctx.settings.managers.join(",")}`;
  let p = cache.get(key);
  if (!p) {
    p = check(ctx).catch(() => false);
    cache.set(key, p);
  }
  return p;
}

/** null while checking. */
export function useIsManager(ctx: Ctx | null): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    if (ctx) isManager(ctx).then(setValue);
  }, [ctx]);
  return value;
}
