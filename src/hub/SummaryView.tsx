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
import { canEdit, deleteEntry, editEntry, type Ctx } from "../common/actions";
import { loadEntries } from "../common/data/crossProject";
import { peekSettings } from "../common/data/settingsRepo";
import { entriesToCsv, summaryToCsv } from "../common/domain/csv";
import { findActivity } from "../common/domain/settings";
import { DIMS, buildSummary, type Bucket, type Dim } from "../common/domain/summary";
import { PRESETS, presetRange, readPrefs, savePrefs, scopeOf, type Preset, type Prefs } from "./summaryPrefs";
import { summaryPdfTable } from "../common/domain/summaryPdf";
import { addDays, addMonths, daysBetween, formatDateBr, formatMinutes, monthEnd, monthStart, toLocalDate, weekStart } from "../common/domain/time";
import type { TimeEntry } from "../common/domain/types";
import { EntriesTable, ErrorBar } from "../common/ui/components";
import { DateInput } from "../common/ui/dateTime";
import { errorMessage, useRunner, useTrackerEvents } from "../common/ui/hooks";
import { EmptyState, PageCard, Toolbar } from "../common/ui/page";
import { coreClient } from "../common/sdk";
import { downloadBlob, downloadText } from "./download";
import { loadPdf } from "./pdf/loadPdf";
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

/**
 * Hours per person / project / US / task / activity across days, weeks or months (like the TimeLog
 * "Time Log Summary"), and optionally each entry with edit/delete ("Detalhado"). Everyone sees their
 * own hours in every project; other people's hours only where the user is a manager.
 */
export function SummaryView({ ctx, manager }: { ctx: Ctx; manager: boolean }) {
  const st = useStyles();
  const today = toLocalDate(new Date());
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [{ from, to }, setRange] = useState(() => presetRange(prefs.period, today));
  const scope = scopeOf(prefs.scope);
  const person = prefs.person;
  const setPerson = (v: string) => setPrefs((p) => ({ ...p, person: v }));
  const [teams, setTeams] = useState<WebApiTeam[]>([]);
  const [members, setMembers] = useState<Set<string> | null>(null);
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const { busy, error, run } = useRunner();

  useEffect(() => savePrefs(prefs), [prefs]);

  useEffect(() => {
    if (!manager) return;
    coreClient()
      .getTeams(ctx.projectId)
      .then((list) => {
        setTeams(list);
        // A saved team that no longer exists goes back to "Eu".
        setPrefs((p) => (p.scope.startsWith("team:") && !list.some((t) => `team:${t.id}` === p.scope) ? { ...p, scope: "me", person: "" } : p));
      })
      .catch(() => setTeams([]));
  }, [ctx.projectId, manager]);

  const teamId = scope.kind === "team" ? scope.teamId : null;
  useEffect(() => {
    if (!teamId) return setMembers(null);
    coreClient()
      .getTeamMembersWithExtendedProperties(ctx.projectId, teamId)
      .then((m) => setMembers(new Set(m.map((x) => x.identity.id))))
      .catch(() => setMembers(new Set()));
  }, [teamId, ctx.projectId]);

  useEffect(() => {
    let current = true;
    setEntries(null);
    setLoadError(null);
    loadEntries(ctx, from, to, { allProjects: prefs.allProjects, others: manager, manager })
      .then((r) => current && (setEntries(r.entries), setProjectNames(r.projects)))
      .catch((e) => current && setLoadError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [ctx, manager, from, to, prefs.allProjects, version]);
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
  const summary = useMemo(
    () => buildSummary(visible, { from, to, bucket: prefs.bucket, dims, hideEmpty: prefs.hideEmpty, projectNames }),
    [visible, from, to, prefs.bucket, prefs.hideEmpty, dims, projectNames],
  );
  // Activity colors: this project's settings first, then the other projects' (activities may differ).
  const colorOf = (activity: string) => {
    for (const s of [ctx.settings, ...[...projectNames.keys()].map(peekSettings)]) {
      const color = s ? findActivity(s, activity)?.color : undefined;
      if (color) return color;
    }
    return undefined;
  };

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

  const exportPdf = async () => {
    const pdf = await loadPdf();
    const who = singleUser ? ctx.user.displayName : `${scopeLabel}${onePerson ? ` · ${people.find(([id]) => id === person)?.[1] ?? ""}` : ""}`;
    const generated = new Date();
    const blob = pdf.renderSummaryPdf(summaryPdfTable(summary, dims), {
      title: `Resumo de horas · ${prefs.allProjects ? "todos os projetos" : ctx.projectName}`,
      lines: [
        `${formatDateBr(from)} a ${formatDateBr(to)} · ${BUCKETS.find((b) => b.value === prefs.bucket)!.label.toLowerCase()} · total ${formatMinutes(summary.total)}`,
        `Quem: ${who} · ${facts.join(" · ")}`,
        `Linhas: ${dimsText}${prefs.hideEmpty ? " · só colunas com horas" : ""}`,
      ],
      footer: `Gerado por ${ctx.user.displayName} em ${formatDateBr(toLocalDate(generated))} ${generated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · TicTask`,
    });
    downloadBlob(`resumo_${from}_${to}.pdf`, blob);
  };

  return (
    <div className={st.root}>
      <Toolbar
        end={
          <>
            <Switch label="Só colunas com horas" checked={prefs.hideEmpty} onChange={(_, d) => setPrefs({ ...prefs, hideEmpty: d.checked })} />
            <Switch label="Detalhado" checked={prefs.detailed} onChange={(_, d) => setPrefs({ ...prefs, detailed: d.checked })} />
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <MenuButton icon={<ArrowDownloadRegular />}>Exportar</MenuButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={() => run(exportPdf)} disabled={!summary.rows.length}>
                    Resumo (PDF)
                  </MenuItem>
                  <MenuItem onClick={() => run(() => downloadText(`resumo_${from}_${to}.csv`, summaryToCsv(summary, dims)))}>Resumo (CSV)</MenuItem>
                  <MenuItem onClick={() => run(() => downloadText(`apontamentos_${from}_${to}.csv`, entriesToCsv(visible, projectNames)))}>Apontamentos detalhados (CSV)</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </>
        }
      >
        <Tooltip content={`${unit[0].toUpperCase()}${unit.slice(1)} anterior`} relationship="label">
          <Button appearance="subtle" icon={<ChevronLeftRegular />} onClick={() => shift(-1)} />
        </Tooltip>
        <Dropdown
          className={st.picker}
          aria-label="Período"
          value={preset?.label ?? "Personalizado"}
          selectedOptions={preset ? [preset.value] : []}
          onOptionSelect={(_, d) => {
            const p = d.optionValue as Preset;
            setRange(presetRange(p, today));
            setPrefs((x) => ({ ...x, period: p }));
          }}
        >
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
        <Tooltip content="Suas horas aparecem em todos os projetos que você acessa; as de outras pessoas, nos projetos em que você é gestor." relationship="description">
          <Dropdown
            className={st.picker}
            aria-label="Projetos"
            value={prefs.allProjects ? "Todos os projetos" : "Este projeto"}
            selectedOptions={[prefs.allProjects ? "all" : "this"]}
            onOptionSelect={(_, d) => setPrefs((p) => ({ ...p, allProjects: d.optionValue === "all" }))}
          >
            <Option value="this">Este projeto</Option>
            <Option value="all">Todos os projetos</Option>
          </Dropdown>
        </Tooltip>
        {manager && (
          <Dropdown
            className={st.picker}
            aria-label="Quem"
            value={`Quem: ${scopeLabel}`}
            selectedOptions={[scopeKey]}
            onOptionSelect={(_, d) => setPrefs((p) => ({ ...p, scope: d.optionValue ?? "me", person: "" }))}
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
            <Tooltip content={`Linhas por ${dimsText}. Desmarque colunas para somar as linhas (ex.: só WI pai).`} relationship="description">
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
              <SummaryTable summary={summary} dims={dims} colorOf={colorOf} />
            </div>
          )}
        </PageCard>
      )}
      {prefs.detailed && entries && (
        <PageCard title={`Apontamentos (${visible.length})`} description="Cada apontamento com horário, atividade e comentário. Os seus podem ser editados ou excluídos até o limite de dias do projeto dele.">
          <EntriesTable
            entries={visible}
            showTask
            projectOf={prefs.allProjects ? (e) => projectNames.get(e.projectId) ?? "" : undefined}
            canEdit={(e) => canEdit(ctx, e)}
            onEdit={(e) => run(() => editEntry(ctx, e))}
            onDelete={(e) => run(() => deleteEntry(ctx, e))}
          />
        </PageCard>
      )}
      {busy && <Spinner size="tiny" />}
    </div>
  );
}
