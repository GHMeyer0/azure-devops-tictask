import {
  Button,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  MenuItemCheckbox,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Spinner,
  Switch,
  ToolbarDivider,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ChevronLeftRegular, ChevronRightRegular, TableSimpleRegular, TextBulletListSquareRegular } from "@fluentui/react-icons";
import type { WebApiTeam } from "azure-devops-extension-api/Core";
import { useEffect, useMemo, useState } from "react";
import type { Ctx } from "../common/actions";
import { listByRange } from "../common/data/entriesRepo";
import { entriesToCsv, summaryToCsv } from "../common/domain/csv";
import { findActivity } from "../common/domain/settings";
import { DIMS, buildSummary, type Bucket, type Dim } from "../common/domain/summary";
import { addDays, addMonths, daysBetween, formatDateBr, formatMinutes, monthEnd, monthStart, toLocalDate, weekStart } from "../common/domain/time";
import type { TimeEntry } from "../common/domain/types";
import { ErrorBar } from "../common/ui/components";
import { DateInput } from "../common/ui/dateTime";
import { errorMessage, useRunner, useTrackerEvents } from "../common/ui/hooks";
import { EmptyState, PageCard, Toolbar } from "../common/ui/page";
import { coreClient } from "../common/sdk";
import { downloadText } from "./download";
import { SummaryTable } from "./SummaryTable";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  date: { width: "150px", minWidth: 0 },
  picker: { minWidth: "150px" },
  muted: { color: tokens.colorNeutralForeground3 },
  // The card hugs the table (no stretched columns on wide screens); wide tables scroll inside it.
  card: { width: "fit-content", maxWidth: "100%", minWidth: "min(100%, 560px)" },
  scroll: { overflowX: "auto", maxWidth: "100%" },
});

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: "day", label: "Por dia" },
  { value: "week", label: "Por semana" },
  { value: "month", label: "Por mês" },
];

type Preset = "week" | "lastWeek" | "month" | "lastMonth";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "week", label: "Esta semana" },
  { value: "lastWeek", label: "Semana passada" },
  { value: "month", label: "Este mês" },
  { value: "lastMonth", label: "Mês passado" },
];

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const ws = weekStart(today);
  switch (p) {
    case "week":
      return { from: ws, to: addDays(ws, 6) };
    case "lastWeek":
      return { from: addDays(ws, -7), to: addDays(ws, -1) };
    case "month":
      return { from: monthStart(today), to: monthEnd(today) };
    case "lastMonth": {
      const m = addMonths(monthStart(today), -1);
      return { from: m, to: monthEnd(m) };
    }
  }
}

type Scope = { kind: "me" } | { kind: "all" } | { kind: "team"; teamId: string };

interface Prefs {
  bucket: Bucket;
  dims: Dim[];
  hideEmpty: boolean;
}
const PREFS_KEY = "tt-summary";
const DEFAULT_PREFS: Prefs = { bucket: "day", dims: ["user", "parent", "task", "activity"], hideEmpty: true };

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    const dims = p?.dims?.filter((d) => DIMS.some((x) => x.value === d));
    return { ...DEFAULT_PREFS, ...p, dims: dims?.length ? dims : DEFAULT_PREFS.dims };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Hours per person / US / task / activity across days, weeks or months (like the TimeLog "Time Log
 * Summary"). Non-managers only see their own hours.
 */
export function SummaryView({ ctx, manager }: { ctx: Ctx; manager: boolean }) {
  const st = useStyles();
  const today = toLocalDate(new Date());
  const [{ from, to }, setRange] = useState(() => presetRange("month", today));
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [scope, setScope] = useState<Scope>({ kind: "me" });
  const [person, setPerson] = useState("");
  const [teams, setTeams] = useState<WebApiTeam[]>([]);
  const [members, setMembers] = useState<Set<string> | null>(null);
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const { busy, error, run } = useRunner();

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  }, [prefs]);

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

  const singleUser = scope.kind === "me" || !manager;
  const inScope = useMemo(() => {
    if (!entries) return [];
    if (singleUser) return entries.filter((e) => e.userId === ctx.user.id);
    if (scope.kind === "team") return members ? entries.filter((e) => members.has(e.userId)) : [];
    return entries;
  }, [entries, scope, members, ctx.user.id, singleUser]);

  // "Pessoa" lists whoever has hours in the period and scope.
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of inScope) if (!e.deleted) map.set(e.userId, e.userName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [inScope]);
  const onePerson = singleUser || (person !== "" && people.some(([id]) => id === person));
  const visible = useMemo(() => (singleUser || !onePerson ? inScope : inScope.filter((e) => e.userId === person)), [inScope, singleUser, onePerson, person]);

  // The Pessoa column is pointless when only one person is shown.
  const dims = useMemo(() => {
    const d = onePerson ? prefs.dims.filter((x) => x !== "user") : prefs.dims;
    return d.length ? d : (["task"] as Dim[]);
  }, [prefs.dims, onePerson]);
  const summary = useMemo(() => buildSummary(visible, { from, to, bucket: prefs.bucket, dims, hideEmpty: prefs.hideEmpty }), [visible, from, to, prefs.bucket, prefs.hideEmpty, dims]);

  const preset = PRESETS.find((p) => {
    const r = presetRange(p.value, today);
    return r.from === from && r.to === to;
  });
  const isMonth = from === monthStart(from) && to === monthEnd(from);
  const isWeek = from === weekStart(from) && to === addDays(from, 6);
  const shift = (n: -1 | 1) => {
    if (isMonth) {
      const m = addMonths(from, n);
      return setRange({ from: m, to: monthEnd(m) });
    }
    const len = isWeek ? 7 : daysBetween(from, to) + 1;
    setRange({ from: addDays(from, n * len), to: addDays(to, n * len) });
  };
  const unit = isMonth ? "mês" : isWeek ? "semana" : "período";

  const scopeKey = scope.kind === "team" ? `team:${scope.teamId}` : scope.kind;
  const scopeLabel = scope.kind === "me" ? "Eu" : scope.kind === "all" ? "Todos" : (teams.find((t) => t.id === scope.teamId)?.name ?? "Time");
  const dimsText = dims.map((d) => DIMS.find((x) => x.value === d)!.label).join(", ");
  const tasks = new Set(visible.filter((e) => !e.deleted && e.date >= from && e.date <= to).map((e) => e.workItemId)).size;
  const days = new Set(visible.filter((e) => !e.deleted && e.date >= from && e.date <= to).map((e) => e.date)).size;
  const facts = [`${tasks} ${tasks === 1 ? "task" : "tasks"}`, `${days} ${days === 1 ? "dia" : "dias"} com apontamento`];
  if (!onePerson) facts.unshift(`${people.length} ${people.length === 1 ? "pessoa" : "pessoas"}`);

  return (
    <div className={st.root}>
      <Toolbar
        end={
          <>
            <Switch label="Só colunas com horas" checked={prefs.hideEmpty} onChange={(_, d) => setPrefs({ ...prefs, hideEmpty: d.checked })} />
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <MenuButton icon={<ArrowDownloadRegular />}>Exportar</MenuButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={() => run(() => downloadText(`resumo_${from}_${to}.csv`, summaryToCsv(summary, dims)))}>Resumo (CSV)</MenuItem>
                  <MenuItem onClick={() => run(() => downloadText(`apontamentos_${from}_${to}.csv`, entriesToCsv(visible)))}>Apontamentos detalhados (CSV)</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </>
        }
      >
        <Tooltip content={`${unit[0].toUpperCase()}${unit.slice(1)} anterior`} relationship="label">
          <Button appearance="subtle" icon={<ChevronLeftRegular />} onClick={() => shift(-1)} />
        </Tooltip>
        <Dropdown className={st.picker} aria-label="Período" value={preset?.label ?? "Personalizado"} selectedOptions={preset ? [preset.value] : []} onOptionSelect={(_, d) => setRange(presetRange(d.optionValue as Preset, today))}>
          {PRESETS.map((p) => (
            <Option key={p.value} value={p.value}>
              {p.label}
            </Option>
          ))}
        </Dropdown>
        <Tooltip content={unit === "semana" ? "Próxima semana" : `Próximo ${unit}`} relationship="label">
          <Button appearance="subtle" icon={<ChevronRightRegular />} onClick={() => shift(1)} />
        </Tooltip>
        <DateInput className={st.date} ariaLabel="De" value={from} onChange={(v) => setRange({ from: v, to: v > to ? v : to })} />
        <span className={st.muted}>até</span>
        <DateInput className={st.date} ariaLabel="Até" value={to} minDate={from} onChange={(v) => v >= from && setRange({ from, to: v })} />
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
              setPerson("");
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
        {manager && !singleUser && (
          <Dropdown
            className={st.picker}
            aria-label="Pessoa"
            value={people.find(([id]) => id === person)?.[1] ?? "Todas as pessoas"}
            selectedOptions={[person]}
            onOptionSelect={(_, d) => setPerson(d.optionValue ?? "")}
          >
            <Option value="">Todas as pessoas</Option>
            {people.map(([id, name]) => (
              <Option key={id} value={id}>
                {name}
              </Option>
            ))}
          </Dropdown>
        )}
        <Dropdown className={st.picker} aria-label="Colunas" value={BUCKETS.find((b) => b.value === prefs.bucket)!.label} selectedOptions={[prefs.bucket]} onOptionSelect={(_, d) => setPrefs({ ...prefs, bucket: d.optionValue as Bucket })}>
          {BUCKETS.map((b) => (
            <Option key={b.value} value={b.value}>
              {b.label}
            </Option>
          ))}
        </Dropdown>
        <Menu
          checkedValues={{ dims: prefs.dims }}
          onCheckedValueChange={(_, d) => d.checkedItems.length && setPrefs({ ...prefs, dims: DIMS.map((x) => x.value).filter((v) => d.checkedItems.includes(v)) })}
        >
          <MenuTrigger disableButtonEnhancement>
            <Tooltip content={`Linhas por ${dimsText}. Desmarque colunas para somar as linhas (ex.: só US/Bug).`} relationship="description">
              <MenuButton icon={<TextBulletListSquareRegular />}>Linhas ({dims.length})</MenuButton>
            </Tooltip>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {DIMS.map((d) => (
                <MenuItemCheckbox key={d.value} name="dims" value={d.value} disabled={d.value === "user" && singleUser}>
                  {d.label}
                </MenuItemCheckbox>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      </Toolbar>

      <ErrorBar error={loadError ?? error} />
      {entries === null && !loadError ? (
        <Spinner label="Carregando apontamentos…" />
      ) : (
        <PageCard className={st.card} title={`${formatDateBr(from)} a ${formatDateBr(to)} · ${formatMinutes(summary.total)}`} description={facts.join(" · ")}>
          {summary.rows.length === 0 ? (
            <EmptyState icon={<TableSimpleRegular />} title="Nenhum apontamento no período" />
          ) : (
            <div className={st.scroll}>
              <SummaryTable summary={summary} dims={dims} colorOf={(a) => findActivity(ctx.settings, a)?.color} />
            </div>
          )}
        </PageCard>
      )}
      {busy && <Spinner size="tiny" />}
    </div>
  );
}
