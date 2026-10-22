import {
  Badge,
  Button,
  Caption1,
  Link,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { DeleteRegular, EditRegular, PauseRegular, PlayRegular, RecordStopRegular } from "@fluentui/react-icons";
import { WorkItemTrackingServiceIds, type IWorkItemFormNavigationService } from "azure-devops-extension-api/WorkItemTracking";
import { Fragment, useState } from "react";
import type { Breakdown } from "../domain/aggregate";
import { consumption } from "../domain/remaining";
import { formatClock, formatDateBr, formatHours, formatMinutes, toLocalTime } from "../domain/time";
import type { ActiveTimer, Settings, TimeEntry, WorkItemSnapshot } from "../domain/types";
import { SDK } from "../sdk";
import { PageCard } from "./page";

const useStyles = makeStyles({
  stats: { display: "flex", gap: "8px", flexWrap: "wrap" },
  stat: {
    minWidth: "92px",
    padding: "8px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    flexDirection: "column",
  },
  statValue: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, lineHeight: tokens.lineHeightBase500 },
  timer: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  clock: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  clockPaused: { color: tokens.colorNeutralForeground3 },
  bars: { display: "flex", flexDirection: "column", gap: "6px" },
  barRow: { display: "grid", gridTemplateColumns: "minmax(110px, 180px) 1fr 56px", alignItems: "center", gap: "8px" },
  bar: { height: "10px", borderRadius: "3px", backgroundColor: tokens.colorBrandBackground },
  right: { textAlign: "right" },
  muted: { color: tokens.colorNeutralForeground3 },
  segments: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  deleted: { textDecorationLine: "line-through", color: tokens.colorNeutralForeground4 },
  // Link without href renders a <button>: truncate it here, an ellipsis on the parent can't reach it.
  link: { display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "inherit", verticalAlign: "bottom" },
});

export async function openWorkItem(id: number): Promise<void> {
  const nav = await SDK.getService<IWorkItemFormNavigationService>(WorkItemTrackingServiceIds.WorkItemFormNavigationService);
  await nav.openWorkItem(id);
}

export function WorkItemLink({ id, title }: { id: number; title?: string }) {
  const st = useStyles();
  return (
    <Link className={st.link} onClick={() => openWorkItem(id)} title={title}>
      #{id}
      {title ? ` ${title}` : ""}
    </Link>
  );
}

export function ErrorBar({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <MessageBar intent="error">
      <MessageBarBody>{error}</MessageBarBody>
    </MessageBar>
  );
}

export function StateBadge({ state, settings }: { state: string; settings: Settings }) {
  const s = settings.states;
  const color = s.closedStates.includes(state) ? "success" : state === s.active ? "brand" : s.pauseStates.includes(state) ? "warning" : "informative";
  return (
    <Badge appearance="tint" color={color} size="small">
      {state}
    </Badge>
  );
}

/** Estimado / Completo / Restante cards with the consumption bar. */
export function HoursSummary({ fields, extra }: { fields: Pick<WorkItemSnapshot, "original" | "remaining" | "completed">; extra?: React.ReactNode }) {
  const st = useStyles();
  const pct = consumption(fields);
  const over = pct !== null && pct > 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className={st.stats}>
        <Stat label="Estimado" value={formatHours(fields.original)} />
        <Stat label="Completo" value={formatHours(fields.completed ?? 0)} />
        <Stat label="Restante" value={formatHours(fields.remaining)} />
        {pct !== null && <Stat label="Consumido" value={`${pct}%`} />}
        {extra}
      </div>
      {pct !== null && <ProgressBar value={Math.min(1, pct / 100)} color={over ? "error" : pct >= 90 ? "warning" : "brand"} thickness="large" />}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  const st = useStyles();
  return (
    <div className={st.stat}>
      <Caption1>{label}</Caption1>
      <span className={st.statValue}>{value}</span>
    </div>
  );
}

/** Clock + pause/resume/stop for the user's timer. */
export function TimerControls({ timer, elapsedMs, busy, onPause, onResume, onStop, showTarget }: {
  timer: ActiveTimer;
  elapsedMs: number;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  showTarget?: boolean;
}) {
  const st = useStyles();
  const running = timer.status === "running";
  return (
    <div className={st.timer}>
      <span className={`${st.clock} ${running ? "" : st.clockPaused}`}>{formatClock(elapsedMs)}</span>
      {running ? (
        <Button size="small" icon={<PauseRegular />} onClick={onPause} disabled={busy}>
          Pausar
        </Button>
      ) : (
        <Button size="small" icon={<PlayRegular />} onClick={onResume} disabled={busy}>
          Retomar
        </Button>
      )}
      <Button size="small" icon={<RecordStopRegular />} onClick={onStop} disabled={busy}>
        Parar
      </Button>
      {showTarget && (
        <Text size={200}>
          {running ? "Em andamento" : "Pausado"}: <WorkItemLink id={timer.workItem.id} title={timer.workItem.title} /> · {timer.activity}
        </Text>
      )}
    </div>
  );
}

export function BreakdownBars({ items, colorOf }: { items: Breakdown[]; colorOf?: (label: string) => string | undefined }) {
  const st = useStyles();
  const max = Math.max(1, ...items.map((i) => i.minutes));
  if (!items.length) return <Caption1 className={st.muted}>Sem apontamentos.</Caption1>;
  return (
    <div className={st.bars}>
      {items.map((i) => (
        <div key={i.label} className={st.barRow}>
          <Text size={200} truncate wrap={false} title={i.label}>
            {i.label}
          </Text>
          <div className={st.bar} style={{ width: `${(i.minutes / max) * 100}%`, backgroundColor: colorOf?.(i.label) }} />
          <Text size={200} weight="semibold" className={st.right}>
            {formatMinutes(i.minutes)}
          </Text>
        </div>
      ))}
    </div>
  );
}

/** Entries list with start/end, pauses, who and actions (like the TimeLog "Time Log" tab). */
export function EntriesTable({ entries, showTask, canEdit, onEdit, onDelete }: {
  entries: TimeEntry[];
  showTask?: boolean;
  canEdit: (e: TimeEntry) => boolean;
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
}) {
  const st = useStyles();
  const [open, setOpen] = useState<string | null>(null);
  if (!entries.length) return <Caption1 className={st.muted}>Nenhum apontamento ainda.</Caption1>;
  return (
    <Table size="small" aria-label="Apontamentos">
      <TableHeader>
        <TableRow>
          <TableHeaderCell style={{ width: 90 }}>Data</TableHeaderCell>
          <TableHeaderCell style={{ width: 110 }}>Horário</TableHeaderCell>
          <TableHeaderCell style={{ width: 70 }}>Horas</TableHeaderCell>
          <TableHeaderCell>Usuário</TableHeaderCell>
          {showTask && <TableHeaderCell>Task</TableHeaderCell>}
          <TableHeaderCell>Atividade</TableHeaderCell>
          <TableHeaderCell>Comentário</TableHeaderCell>
          <TableHeaderCell style={{ width: 76 }} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => {
          const pauses = e.segments.length - 1;
          const editable = canEdit(e);
          return (
            <Fragment key={e.id}>
              <TableRow>
                <TableCell>{formatDateBr(e.date)}</TableCell>
                <TableCell>
                  {toLocalTime(e.start)}–{toLocalTime(e.end)}
                  {pauses > 0 && (
                    <Link className={st.segments} onClick={() => setOpen(open === e.id ? null : e.id)}>
                      {" "}
                      ({pauses} {pauses === 1 ? "pausa" : "pausas"})
                    </Link>
                  )}
                </TableCell>
                <TableCell>
                  <Text weight="semibold">{formatMinutes(e.minutes)}</Text>
                </TableCell>
                <TableCell>{e.userName}</TableCell>
                {showTask && (
                  <TableCell>
                    <WorkItemLink id={e.workItemId} title={e.workItemTitle} />
                  </TableCell>
                )}
                <TableCell>{e.activity}</TableCell>
                <TableCell>
                  <Text size={200} title={historyText(e)}>
                    {e.comment}
                  </Text>
                </TableCell>
                <TableCell>
                  {editable && (
                    <>
                      <Tooltip content="Editar" relationship="label">
                        <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => onEdit(e)} />
                      </Tooltip>
                      <Tooltip content="Excluir" relationship="label">
                        <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => onDelete(e)} />
                      </Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
              {open === e.id && (
                <TableRow>
                  <TableCell colSpan={showTask ? 8 : 7} className={st.segments}>
                    Trechos trabalhados: {e.segments.map((s) => `${toLocalTime(s.start)}–${toLocalTime(s.end)}`).join(" · ")}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function historyText(e: TimeEntry): string {
  return e.history.map((h) => `${new Date(h.at).toLocaleString("pt-BR")} · ${h.by} · ${h.action} ${h.detail}`).join("\n");
}

/** Work item type of a parent (Bug / User Story / Technical Story…) as a small colored badge. */
export function TypeBadge({ type }: { type: string }) {
  if (!type) return null;
  const t = type.toLowerCase();
  const color = t.includes("bug") ? "danger" : t.includes("technical") ? "informative" : t.includes("story") || t.includes("backlog") ? "brand" : "subtle";
  return (
    <Badge appearance="tint" color={color} size="small" style={{ flexShrink: 0 }}>
      {type}
    </Badge>
  );
}

/** Titled block, rendered as a Fluent card like the rest of the pages (see ui/page.tsx). */
export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <PageCard title={title} description={description} action={actions ? <div style={{ display: "flex", gap: 4 }}>{actions}</div> : undefined}>
        {children}
      </PageCard>
    </div>
  );
}
