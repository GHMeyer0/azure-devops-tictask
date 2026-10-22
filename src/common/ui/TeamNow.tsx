import { Avatar, Badge, Caption1, Spinner, Text, makeStyles, tokens } from "@fluentui/react-components";
import { useCallback, useEffect, useState } from "react";
import type { Ctx } from "../actions";
import { listPresence } from "../data/presenceRepo";
import { formatClock, segmentsMs, toLocalTime } from "../domain/time";
import type { Presence } from "../domain/types";
import { subscribe } from "../events";
import { WorkItemLink } from "./components";

/** A running timer older than this is probably forgotten. */
const STALE_MS = 10 * 3600_000;

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column" },
  row: { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "10px", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  info: { display: "flex", flexDirection: "column", minWidth: 0 },
  clock: { fontFamily: tokens.fontFamilyMonospace, fontWeight: tokens.fontWeightSemibold, textAlign: "right" },
  muted: { color: tokens.colorNeutralForeground3 },
  stale: { color: tokens.colorPaletteRedForeground1 },
  summary: { display: "flex", gap: "6px", marginBottom: "4px", flexWrap: "wrap" },
});

/** Project-wide timer status of every user, refreshed by a poll (other users) and local events. */
export function usePresence(ctx: Ctx | null, pollMs = 30_000): { list: Presence[] | null; nowMs: number; reload: () => void } {
  const [list, setList] = useState<Presence[] | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const reload = useCallback(() => {
    if (ctx) listPresence(ctx.projectId).then(setList).catch(() => setList([]));
  }, [ctx]);
  useEffect(() => {
    reload();
    const off = subscribe((e) => e.type === "timer" && reload());
    const poll = setInterval(reload, pollMs);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    window.addEventListener("focus", reload);
    return () => {
      off();
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("focus", reload);
    };
  }, [reload, pollMs]);
  return { list, nowMs, reload };
}

/** "Time agora": who has a timer running or paused, on what, for how long. */
export function TeamNow({ ctx, compact }: { ctx: Ctx; compact?: boolean }) {
  const st = useStyles();
  const { list, nowMs } = usePresence(ctx);

  if (!ctx.settings.teamPresence) return <Caption1 className={st.muted}>A visão do time está desativada nas Configurações do TicTask.</Caption1>;
  if (!list) return <Spinner size="tiny" />;

  const sorted = [...list].sort((a, b) => (a.status === b.status ? a.userName.localeCompare(b.userName, "pt-BR") : a.status === "running" ? -1 : 1));
  const running = list.filter((p) => p.status === "running").length;

  return (
    <div>
      <div className={st.summary}>
        <Badge appearance="filled" color="brand">
          {running} rodando
        </Badge>
        <Badge appearance="tint" color="warning">
          {list.length - running} pausado{list.length - running === 1 ? "" : "s"}
        </Badge>
      </div>
      {sorted.length === 0 && <Caption1 className={st.muted}>Ninguém com timer agora.</Caption1>}
      <div className={st.list}>
        {sorted.map((p) => {
          const ms = segmentsMs(p.segments, new Date(nowMs));
          const openSince = p.segments.at(-1)?.start;
          const stale = p.status === "running" && openSince && nowMs - Date.parse(openSince) > STALE_MS;
          return (
            <div key={p.id} className={st.row}>
              <Avatar name={p.userName} size={compact ? 24 : 32} badge={{ status: p.status === "running" ? "available" : "away" }} />
              <div className={st.info}>
                <Text size={compact ? 200 : 300} weight="semibold" truncate wrap={false}>
                  {p.userName}
                </Text>
                <Text size={200} truncate wrap={false}>
                  <WorkItemLink id={p.workItem.id} title={p.workItem.title} />
                </Text>
                <Caption1 className={stale ? st.stale : st.muted}>
                  {p.status === "running" ? `${p.activity} · desde ${toLocalTime(openSince ?? p.updatedAt)}` : `Pausado${p.pausedState ? ` (${p.pausedState})` : ""}${p.pausedReason ? `: ${p.pausedReason}` : ""}`}
                  {stale ? " · timer aberto há mais de 10h" : ""}
                </Caption1>
              </div>
              <Text className={st.clock} size={compact ? 200 : 300}>
                {formatClock(ms)}
              </Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}
