import {
  Button,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  ToolbarDivider,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, CalendarClockRegular, ChevronLeftRegular, ChevronRightRegular } from "@fluentui/react-icons";
import type { WebApiTeam } from "azure-devops-extension-api/Core";
import { useEffect, useMemo, useState } from "react";
import { canEdit, deleteEntry, editEntry, type Ctx } from "../common/actions";
import { listByRange } from "../common/data/entriesRepo";
import { buildSheet, type GroupMode } from "../common/domain/aggregate";
import { entriesToCsv, sheetToCsv } from "../common/domain/csv";
import { addDays, dayRange, formatDateBr, formatDayShort, formatMinutes, isWeekend, toLocalDate, weekStart } from "../common/domain/time";
import type { TimeEntry } from "../common/domain/types";
import { EntriesTable, ErrorBar, WorkItemLink } from "../common/ui/components";
import { DateInput } from "../common/ui/dateTime";
import { EmptyState, PageCard, Toolbar } from "../common/ui/page";
import { errorMessage, useRunner, useTrackerEvents } from "../common/ui/hooks";
import { coreClient } from "../common/sdk";
import { downloadText } from "./download";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  date: { width: "150px", minWidth: 0 },
  picker: { minWidth: "160px" },
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  level0: { fontWeight: tokens.fontWeightSemibold, backgroundColor: tokens.colorNeutralBackground2 },
  total: { fontWeight: tokens.fontWeightSemibold, backgroundColor: tokens.colorNeutralBackground3 },
  weekend: { color: tokens.colorNeutralForeground4 },
  scroll: { overflowX: "auto" },
  muted: { color: tokens.colorNeutralForeground3 },
});

const MODES: { value: GroupMode; label: string }[] = [
  { value: "user", label: "Usuário › Task › Atividade" },
  { value: "parent", label: "US/Bug › Task › Usuário" },
  { value: "activity", label: "Atividade › Usuário › Task" },
];

type Scope = { kind: "me" } | { kind: "all" } | { kind: "team"; teamId: string };

/** Non-managers only see their own hours (`manager` gates the "Quem" selector). */
export function TimesheetView({ ctx, manager }: { ctx: Ctx; manager: boolean }) {
  const st = useStyles();
  const today = toLocalDate(new Date());
  const [from, setFrom] = useState(weekStart(today));
  const [to, setTo] = useState(addDays(weekStart(today), 6));
  const [scope, setScope] = useState<Scope>({ kind: "me" });
  const [mode, setMode] = useState<GroupMode>("user");
  const [detailed, setDetailed] = useState(false);
  const [teams, setTeams] = useState<WebApiTeam[]>([]);
  const [members, setMembers] = useState<Set<string> | null>(null);
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const { busy, error, run } = useRunner();

  useEffect(() => {
    if (manager) coreClient().getTeams(ctx.projectId).then(setTeams).catch(() => setTeams([]));
  }, [ctx.projectId, manager]);

  useEffect(() => {
    if (scope.kind !== "team") return setMembers(null);
    coreClient()
      .getTeamMembersWithExtendedProperties(ctx.projectId, scope.teamId)
      .then((m) => setMembers(new Set(m.map((x) => x.identity.id))))
      .catch(() => setMembers(new Set()));
  }, [scope, ctx.projectId]);

  useEffect(() => {
    setEntries(null);
    setLoadError(null);
    listByRange(ctx.projectId, from, to)
      .then(setEntries)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [ctx.projectId, from, to, version]);
  useTrackerEvents(null, () => setVersion((v) => v + 1));

  const visible = useMemo(() => {
    if (!entries) return [];
    if (scope.kind === "me" || !manager) return entries.filter((e) => e.userId === ctx.user.id);
    if (scope.kind === "team") return members ? entries.filter((e) => members.has(e.userId)) : [];
    return entries;
  }, [entries, scope, members, ctx.user.id, manager]);

  const days = useMemo(() => dayRange(from, to), [from, to]);
  const sheet = useMemo(() => buildSheet(visible, days, mode), [visible, days, mode]);

  const shift = (n: number) => {
    setFrom(addDays(from, n));
    setTo(addDays(to, n));
  };
  const singleUser = scope.kind === "me" || !manager;
  const scopeKey = scope.kind === "team" ? `team:${scope.teamId}` : scope.kind;
  const scopeLabel = scope.kind === "me" ? "Eu" : scope.kind === "all" ? "Todos" : (teams.find((t) => t.id === scope.teamId)?.name ?? "Time");

  return (
    <div className={st.root}>
      <Toolbar
        end={
          <>
            <Switch label="Detalhado" checked={detailed} onChange={(_, d) => setDetailed(d.checked)} />
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <MenuButton icon={<ArrowDownloadRegular />}>Exportar</MenuButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={() => run(() => downloadText(`timesheet_${from}_${to}.csv`, sheetToCsv(sheet.days, sheet.rows, sheet.dayTotals, sheet.total)))}>Resumo (CSV)</MenuItem>
                  <MenuItem onClick={() => run(() => downloadText(`apontamentos_${from}_${to}.csv`, entriesToCsv(visible)))}>Apontamentos detalhados (CSV)</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </>
        }
      >
        <Tooltip content="Semana anterior" relationship="label">
          <Button appearance="subtle" icon={<ChevronLeftRegular />} onClick={() => shift(-7)} />
        </Tooltip>
        <Button appearance="subtle" onClick={() => (setFrom(weekStart(today)), setTo(addDays(weekStart(today), 6)))}>
          Esta semana
        </Button>
        <Tooltip content="Próxima semana" relationship="label">
          <Button appearance="subtle" icon={<ChevronRightRegular />} onClick={() => shift(7)} />
        </Tooltip>
        <DateInput className={st.date} ariaLabel="De" value={from} onChange={setFrom} />
        <span className={st.muted}>até</span>
        <DateInput className={st.date} ariaLabel="Até" value={to} minDate={from} onChange={(v) => v >= from && setTo(v)} />
        <ToolbarDivider />
        {manager && (
          <Dropdown
            className={st.picker}
            aria-label="Quem"
            value={`Quem: ${scopeLabel}`}
            selectedOptions={[scopeKey]}
            onOptionSelect={(_, d) => {
              const v = d.optionValue ?? "me";
              setScope(v.startsWith("team:") ? { kind: "team", teamId: v.slice(5) } : { kind: v as "me" | "all" });
            }}
          >
            <Option value="me">Eu</Option>
            <Option value="all">Todos</Option>
            {teams.map((t) => (
              <Option key={t.id} value={`team:${t.id}`}>
                {t.name}
              </Option>
            ))}
          </Dropdown>
        )}
        <Dropdown className={st.picker} aria-label="Agrupar por" value={MODES.find((m) => m.value === mode)!.label} selectedOptions={[mode]} onOptionSelect={(_, d) => setMode(d.optionValue as GroupMode)}>
          {MODES.map((m) => (
            <Option key={m.value} value={m.value}>
              {m.label}
            </Option>
          ))}
        </Dropdown>
      </Toolbar>

      <ErrorBar error={loadError ?? error} />
      {entries === null && !loadError ? (
        <Spinner label="Carregando apontamentos…" />
      ) : (
        <PageCard title={`${formatDateBr(from)} a ${formatDateBr(to)} · ${formatMinutes(sheet.total)}`} description={singleUser ? "Seus apontamentos no período." : `Apontamentos de ${scopeLabel.toLowerCase() === "todos" ? "todo o projeto" : scopeLabel} no período.`}>
        <div className={st.scroll}>
          {/* Fixed minimum width: on narrow screens the grid scrolls instead of squeezing the day columns. */}
          <Table size="small" aria-label="Timesheet" style={{ minWidth: 300 + days.length * 84 + 90 }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ minWidth: 280 }}>{MODES.find((m) => m.value === mode)!.label}</TableHeaderCell>
                {days.map((d) => (
                  <TableHeaderCell key={d} className={mergeClasses(st.num, isWeekend(d) && st.weekend)} style={{ width: 84 }}>
                    {formatDayShort(d)}
                  </TableHeaderCell>
                ))}
                <TableHeaderCell className={st.num} style={{ width: 90 }}>
                  Total
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={days.length + 2}>
                    <EmptyState icon={<CalendarClockRegular />} title="Nenhum apontamento no período" />
                  </TableCell>
                </TableRow>
              )}
              {sheet.rows.map((r) => (
                <TableRow key={r.key} className={r.level === 0 ? st.level0 : undefined}>
                  <TableCell style={{ paddingLeft: 8 + r.level * 20 }}>{r.workItemId ? <WorkItemLink id={r.workItemId} title={r.label.replace(/^#\d+\s*/, "")} /> : <Text weight={r.level === 0 ? "semibold" : "regular"}>{r.label}</Text>}</TableCell>
                  {r.perDay.map((m, i) => (
                    <TableCell key={i} className={st.num}>
                      {m ? formatMinutes(m) : ""}
                    </TableCell>
                  ))}
                  <TableCell className={st.num}>
                    <Text weight="semibold">{formatMinutes(r.total)}</Text>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className={st.total}>
                <TableCell>Total</TableCell>
                {sheet.dayTotals.map((m, i) => (
                  <TableCell key={i} className={st.num}>
                    {m ? formatMinutes(m) : ""}
                  </TableCell>
                ))}
                <TableCell className={st.num}>{formatMinutes(sheet.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        </PageCard>
      )}

      {detailed && entries && (
        <PageCard title={`Apontamentos (${visible.length})`} description="Cada apontamento com horário, atividade e comentário.">
          <EntriesTable entries={visible} showTask canEdit={(e) => canEdit(ctx, e)} onEdit={(e) => run(() => editEntry(ctx, e))} onDelete={(e) => run(() => deleteEntry(ctx, e))} />
        </PageCard>
      )}
      {busy && <Spinner size="tiny" />}
    </div>
  );
}
