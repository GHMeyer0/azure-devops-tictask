import {
  Button,
  Caption1,
  Dropdown,
  Field,
  Input,
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
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ChevronLeftRegular, ChevronRightRegular } from "@fluentui/react-icons";
import type { WebApiTeam } from "azure-devops-extension-api/Core";
import { useEffect, useMemo, useState } from "react";
import { canEdit, deleteEntry, editEntry, type Ctx } from "../common/actions";
import { listByRange } from "../common/data/entriesRepo";
import { buildSheet, type GroupMode } from "../common/domain/aggregate";
import { entriesToCsv, sheetToCsv } from "../common/domain/csv";
import { addDays, dayRange, formatDayShort, formatMinutes, isWeekend, toLocalDate, weekStart } from "../common/domain/time";
import type { TimeEntry } from "../common/domain/types";
import { EntriesTable, ErrorBar, WorkItemLink } from "../common/ui/components";
import { errorMessage, useRunner, useTrackerEvents } from "../common/ui/hooks";
import { coreClient } from "../common/sdk";
import { downloadText } from "./download";

const useStyles = makeStyles({
  toolbar: { display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "12px" },
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  level0: { fontWeight: tokens.fontWeightSemibold, backgroundColor: tokens.colorNeutralBackground2 },
  total: { fontWeight: tokens.fontWeightSemibold, backgroundColor: tokens.colorNeutralBackground3 },
  weekend: { color: tokens.colorNeutralForeground4 },
  under: { color: tokens.colorPaletteRedForeground1 },
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
  const target = ctx.settings.dailyTargetHours * 60;
  const singleUser = scope.kind === "me" || !manager;

  const shift = (n: number) => {
    setFrom(addDays(from, n));
    setTo(addDays(to, n));
  };
  const scopeKey = scope.kind === "team" ? `team:${scope.teamId}` : scope.kind;
  const scopeLabel = scope.kind === "me" ? "Eu" : scope.kind === "all" ? "Todos" : (teams.find((t) => t.id === scope.teamId)?.name ?? "Time");

  return (
    <div>
      <div className={st.toolbar}>
        <Button icon={<ChevronLeftRegular />} onClick={() => shift(-7)} aria-label="Semana anterior" />
        <Button onClick={() => (setFrom(weekStart(today)), setTo(addDays(weekStart(today), 6)))}>Esta semana</Button>
        <Button icon={<ChevronRightRegular />} onClick={() => shift(7)} aria-label="Próxima semana" />
        <Field label="De">
          <Input type="date" value={from} onChange={(_, d) => d.value && setFrom(d.value)} />
        </Field>
        <Field label="Até">
          <Input type="date" value={to} onChange={(_, d) => d.value && d.value >= from && setTo(d.value)} />
        </Field>
        {manager && (
        <Field label="Quem">
          <Dropdown
            value={scopeLabel}
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
        </Field>
        )}
        <Field label="Agrupar por">
          <Dropdown value={MODES.find((m) => m.value === mode)!.label} selectedOptions={[mode]} onOptionSelect={(_, d) => setMode(d.optionValue as GroupMode)}>
            {MODES.map((m) => (
              <Option key={m.value} value={m.value}>
                {m.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Switch label="Detalhado" checked={detailed} onChange={(_, d) => setDetailed(d.checked)} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Button icon={<ArrowDownloadRegular />} onClick={() => run(() => downloadText(`timesheet_${from}_${to}.csv`, sheetToCsv(sheet.days, sheet.rows, sheet.dayTotals, sheet.total)))}>
            Resumo CSV
          </Button>
          <Button icon={<ArrowDownloadRegular />} onClick={() => run(() => downloadText(`apontamentos_${from}_${to}.csv`, entriesToCsv(visible)))}>
            Detalhado CSV
          </Button>
        </div>
      </div>

      <ErrorBar error={loadError ?? error} />
      {entries === null && !loadError ? (
        <Spinner label="Carregando apontamentos…" />
      ) : (
        <div className={st.scroll}>
          <Table size="small" aria-label="Timesheet">
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ minWidth: 280 }}>{MODES.find((m) => m.value === mode)!.label}</TableHeaderCell>
                {days.map((d) => (
                  <TableHeaderCell key={d} className={mergeClasses(st.num, isWeekend(d) && st.weekend)} style={{ width: 72 }}>
                    {formatDayShort(d)}
                  </TableHeaderCell>
                ))}
                <TableHeaderCell className={st.num} style={{ width: 80 }}>
                  Total
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={days.length + 2}>
                    <Caption1 className={st.muted}>Nenhum apontamento no período.</Caption1>
                  </TableCell>
                </TableRow>
              )}
              {sheet.rows.map((r) => (
                <TableRow key={r.key} className={r.level === 0 ? st.level0 : undefined}>
                  <TableCell style={{ paddingLeft: 8 + r.level * 20 }}>{r.workItemId ? <WorkItemLink id={r.workItemId} title={r.label.replace(/^#\d+\s*/, "")} /> : <Text weight={r.level === 0 ? "semibold" : "regular"}>{r.label}</Text>}</TableCell>
                  {r.perDay.map((m, i) => (
                    <TableCell key={i} className={mergeClasses(st.num, r.level === 0 && mode === "user" && !isWeekend(days[i]) && days[i] <= today && m < target && st.under)}>
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
                  <TableCell key={i} className={mergeClasses(st.num, singleUser && !isWeekend(days[i]) && days[i] <= today && m < target && st.under)}>
                    {m ? formatMinutes(m) : ""}
                  </TableCell>
                ))}
                <TableCell className={st.num}>{formatMinutes(sheet.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {singleUser && <Caption1 className={st.muted}>Dias úteis abaixo da meta de {ctx.settings.dailyTargetHours}h ficam em vermelho.</Caption1>}
        </div>
      )}

      {detailed && entries && (
        <div style={{ marginTop: 16 }}>
          <EntriesTable entries={visible} showTask canEdit={(e) => canEdit(ctx, e)} onEdit={(e) => run(() => editEntry(ctx, e))} onDelete={(e) => run(() => deleteEntry(ctx, e))} />
        </div>
      )}
      {busy && <Spinner size="tiny" />}
    </div>
  );
}
