// Smoke test: renders dialogs and shared components outside Azure DevOps (SDK mocked) to catch
// runtime errors in the React tree. Interaction with the host is covered by the manual checklist.
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("azure-devops-extension-sdk", () => ({
  getConfiguration: () => ({}),
  getExtensionContext: () => ({ publisherId: "contoso", extensionId: "time-tracker" }),
  resize: () => undefined,
  register: () => undefined,
  unregister: () => undefined,
}));
vi.mock("azure-devops-extension-api", () => ({ getClient: () => ({}) }));
vi.mock("azure-devops-extension-api/Core", () => ({ CoreRestClient: class {} }));
vi.mock("azure-devops-extension-api/WorkItemTracking", () => ({
  WorkItemTrackingRestClient: class {},
  WorkItemTrackingServiceIds: { WorkItemFormService: "form", WorkItemFormNavigationService: "nav" },
  WorkItemExpand: { Relations: 1 },
  WorkItemTypeFieldsExpandLevel: { AllowedValues: 1 },
}));

const { LogDialog } = await import("../src/dialogs/LogDialog");
const { PauseDialog } = await import("../src/dialogs/PauseDialog");
const { EstimateDialog } = await import("../src/dialogs/EstimateDialog");
const { StartDialog } = await import("../src/dialogs/StartDialog");
const { StandardDialog } = await import("../src/dialogs/StandardDialog");
const { EntriesTable, HoursSummary, TimerControls } = await import("../src/common/ui/components");
const { DEFAULT_SETTINGS } = await import("../src/common/domain/settings");
const { MigrationSection } = await import("../src/hub/MigrationSection");

const settings = DEFAULT_SETTINGS;
const html = (node: React.ReactElement) => renderToString(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>);
const task = { id: 11222, title: "Desenvolvimento: incluir ações judiciais", type: "Task", state: "New", original: 5, remaining: 5, completed: 0, parentId: 11065, assignedTo: { displayName: "Ana", email: "ana@x.com", id: "u1" } };
const parent = { id: 11065, title: "Soma de restrições", type: "User Story", state: "Ready for Development", original: null, remaining: null, completed: null };
const draft = { date: "2026-10-21", startTime: "09:00", endTime: "10:30", minutes: 90, segments: [], activity: "Desenvolvimento/Correção", comment: "" };

describe("dialogs render", () => {
  it("log dialog for a task", () => {
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task, draft, settings, projectName: "Contoso" }} onDone={() => undefined} />);
    expect(out).toContain("Remaining após apontar");
    expect(out).toContain("Concluir a task (Closed)");
  });

  it("log dialog shows the task picker when no task comes (null or lost on the host bridge)", () => {
    const req = { kind: "log" as const, mode: "create" as const, draft, settings, projectName: "Contoso" };
    expect(html(<LogDialog request={{ ...req, task: null }} onDone={() => undefined} />)).toContain("Buscar task");
    expect(html(<LogDialog request={{ ...req, task: undefined as never }} onDone={() => undefined} />)).toContain("Buscar task");
  });

  it("log dialog shows a note above the times", () => {
    const note = "O timer está rodando desde 22/10/2026 17:30.";
    expect(html(<LogDialog request={{ kind: "log", mode: "create", task: null, draft, settings, projectName: "Contoso", note }} onDone={() => undefined} />)).toContain(note);
  });

  it("log dialog asks for an estimate when the task has none", () => {
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task: { ...task, original: null, remaining: null }, draft, settings, projectName: "Contoso" }} onDone={() => undefined} />);
    expect(out).toContain("Estimativa da task");
  });

  it("log dialog with timer segments", () => {
    const segments = [
      { start: "2026-10-21T12:00:00.000Z", end: "2026-10-21T15:00:00.000Z" },
      { start: "2026-10-21T16:00:00.000Z", end: "2026-10-21T17:30:00.000Z" },
    ];
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task, draft: { ...draft, minutes: 270, segments }, settings, projectName: "Contoso", fromTimer: true }} onDone={() => undefined} />);
    expect(out).toContain("Trechos do timer");
  });

  it("start dialog with and without tasks", () => {
    const me = { id: "u1", displayName: "Ana", email: "ana@x.com" };
    const withTasks = html(<StartDialog request={{ kind: "start", purpose: "timer", parent, children: [task], me, settings }} onDone={() => undefined} />);
    expect(withTasks).toContain("Minhas tasks em #11065");
    const empty = html(<StartDialog request={{ kind: "start", purpose: "timer", parent, children: [], me, settings }} onDone={() => undefined} />);
    expect(empty).toContain("Nova task");
    expect(empty).toContain("Criar também as tasks padrão");
  });

  it("standard dialog", () => {
    expect(html(<StandardDialog request={{ kind: "standard", parent, children: [task], settings }} onDone={() => undefined} />)).toContain("Investigação");
  });

  it("log dialog refuses a date older than the edit limit", () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toLocaleDateString("en-CA");
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task, draft: { ...draft, date: old }, settings, projectName: "Contoso" }} onDone={() => undefined} />);
    expect(out).toContain("não podem ser criados nem alterados");
    const fromTimer = html(<LogDialog request={{ kind: "log", mode: "create", task, draft: { ...draft, date: old }, settings, projectName: "Contoso", fromTimer: true }} onDone={() => undefined} />);
    expect(fromTimer).not.toContain("não podem ser criados nem alterados"); // a forgotten timer is still logged
  });

  it("Concluir offers the next step and suggests Remaining 0", () => {
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task, draft, settings, projectName: "Contoso", fromTimer: true, conclude: true }} onDone={() => undefined} />);
    expect(out).toContain("Próximo passo");
    expect(out).toContain("Enviado para revisão");
    expect(out).toContain("Outro…");
    expect(out).not.toContain("Aguardando correções"); // pause reasons are not next steps
    expect(out).not.toContain("Concluir a task (Closed)");
    expect(out).toContain(">Concluir<");
  });

  const segments = [{ start: "2026-10-21T12:00:00.000Z", end: "2026-10-21T13:30:00.000Z" }];
  const pauseDraft = { ...draft, minutes: 90, segments };

  it("pause dialog asks for the reason", () => {
    const out = html(<PauseDialog request={{ kind: "pause", task, draft: pauseDraft, settings, withReason: true, askEnd: false }} onDone={() => undefined} />);
    expect(out).toContain("Motivo (vai para a discussão da task)");
    expect(out).toContain("Aguardando revisão");
    expect(out).not.toContain("Enviado para revisão");
    expect(out).not.toContain("Quanto ainda falta");
  });

  it("pause dialog asks how much is left when the Remaining would be zeroed", () => {
    const out = html(<PauseDialog request={{ kind: "pause", task: { ...task, remaining: 1 }, draft: pauseDraft, settings, withReason: false, askEnd: false }} onDone={() => undefined} />);
    expect(out).toContain("Quanto ainda falta nesta task?");
    expect(out).toContain("Na verdade terminei: Concluir");
    expect(out).not.toContain("Motivo");
  });

  it("estimate dialog suggests the activity's default estimate", () => {
    const out = html(<EstimateDialog request={{ kind: "estimate", task: { ...task, original: null, remaining: null }, settings, activity: "Desenvolvimento" }} onDone={() => undefined} />);
    expect(out).toContain("Estimativa da task");
    expect(out).toContain('value="4h"');
  });

  it("pause dialog asks until when a forgotten timer ran", () => {
    const out = html(<PauseDialog request={{ kind: "pause", task, draft: pauseDraft, settings, withReason: false, askEnd: true }} onDone={() => undefined} />);
    expect(out).toContain("O timer está rodando desde");
    expect(out).toContain("Até (21/10/2026)");
  });
});

describe("team view render", () => {
  it("says when the team view is disabled", async () => {
    const { TeamNow } = await import("../src/common/ui/TeamNow");
    const ctx = { projectId: "p", projectName: "Contoso", user: { id: "u1", displayName: "Ana", email: "ana@x.com" }, settings: { ...settings, teamPresence: false }, writer: { apply: async () => ({}) as never } };
    expect(html(<TeamNow ctx={ctx} />)).toContain("desativada");
  });
});

describe("Meu tempo render", () => {
  it("renders the loading state outside ADO", async () => {
    const { MyTimeView } = await import("../src/hub/MyTimeView");
    expect(html(<MyTimeView />)).toContain("Carregando");
  });
});

describe("hub sections render", () => {
  it("export/import section", () => {
    const ctx = { projectId: "p", projectName: "Contoso", user: { id: "u1", displayName: "Ana", email: "ana@x.com" }, settings, writer: { apply: async () => ({}) as never } };
    const out = html(<MigrationSection ctx={ctx} onSettingsImported={() => undefined} />);
    expect(out).toContain("Exportar dados do projeto");
    expect(out).toContain("Importar do Time Log");
    expect(out).toContain("contoso.time-tracker");
  });

  it("settings use pickers and have no daily target", async () => {
    const { SettingsView } = await import("../src/hub/SettingsView");
    const ctx = { projectId: "p", projectName: "Contoso", user: { id: "u1", displayName: "Ana", email: "ana@x.com" }, settings, writer: { apply: async () => ({}) as never } };
    const geral = html(<SettingsView ctx={ctx} onSaved={() => undefined} initialSection="geral" />);
    expect(geral).toContain("Gestores adicionais");
    expect(geral).toContain("Google Chat"); // side navigation
    expect(geral).not.toContain("Meta diária");
    expect(html(<SettingsView ctx={ctx} onSaved={() => undefined} initialSection="estados" />)).toContain("Estado ao iniciar trabalho");
    const chat = html(<SettingsView ctx={ctx} onSaved={() => undefined} initialSection="chat" />);
    expect(chat).toContain("Como funciona");
    expect(chat).not.toContain("total do fim do dia");
  });

  it("pickers show saved values, also those ADO did not return", async () => {
    const { MultiPicker, Picker } = await import("../src/hub/Pickers");
    const multi = html(<MultiPicker options={[{ value: "Active", label: "Active" }]} values={["Active", "Waiting"]} onChange={() => undefined} />);
    expect(multi).toContain("Active, Waiting");
    expect(html(<Picker options={null} value="Task" onChange={() => undefined} />)).toContain("Task");
  });
});

describe("components render", () => {
  it("summary, timer and entries", () => {
    expect(html(<HoursSummary fields={{ original: 5, remaining: 2, completed: 3 }} />)).toContain("60%");
    const timer = { id: "active" as const, projectId: "p", workItem: { id: 1, title: "T", type: "Task" }, activity: "Testes", comment: "", status: "running" as const, segments: [{ start: "2026-10-21T12:00:00.000Z" }] };
    const handlers = { onPause: () => undefined, onPauseWithReason: () => undefined, onResume: () => undefined, onConclude: () => undefined };
    const controls = html(<TimerControls timer={timer} elapsedMs={3_723_000} busy={false} {...handlers} />);
    expect(controls).toContain("01:02:03");
    expect(controls).toContain("Pausar");
    expect(controls).toContain("Pausar com motivo");
    expect(controls).toContain("Concluir");
    expect(controls).not.toContain("Retomar");
    expect(html(<TimerControls timer={{ ...timer, status: "paused" }} elapsedMs={0} busy={false} {...handlers} />)).toContain("Retomar");
    const entry = {
      id: "e1", projectId: "p", workItemId: 1, workItemTitle: "T", workItemType: "Task", userId: "u1", userName: "Ana", userEmail: "a@x", date: "2026-10-21",
      start: "2026-10-21T12:00:00.000Z", end: "2026-10-21T13:30:00.000Z", minutes: 90, segments: [], activity: "Testes", comment: "ok", source: "manual" as const,
      createdAt: "2026-10-21T13:30:00.000Z", createdBy: "u1", history: [],
    };
    expect(html(<EntriesTable entries={[entry]} canEdit={() => true} onEdit={() => undefined} onDelete={() => undefined} />)).toContain("1h30");
  });
});

describe("summary render", () => {
  it("merged dimension cells, week header and totals", async () => {
    const { SummaryTable } = await import("../src/hub/SummaryTable");
    const { buildSummary } = await import("../src/common/domain/summary");
    const base = {
      id: "e", projectId: "p", workItemId: 17823, workItemTitle: "Ajustar layout", workItemType: "Task", parentId: 11065, parentTitle: "Relatório", userId: "u1", userName: "Ana Souza",
      userEmail: "a@x", date: "2026-10-19", start: "", end: "", minutes: 360, segments: [], activity: "Desenvolvimento/Correção", comment: "", source: "manual" as const, createdAt: "", createdBy: "u1", history: [],
    };
    const entries = [base, { ...base, id: "f", date: "2026-10-27", minutes: 30, activity: "Revisão" }];
    const dims = ["user", "parent", "task", "activity"] as const;
    const summary = buildSummary(entries, { from: "2026-10-01", to: "2026-10-31", bucket: "day", dims: [...dims], hideEmpty: true });
    const out = html(<SummaryTable summary={summary} dims={[...dims]} colorOf={() => "#0078d4"} />);
    expect(out).toContain("19–25/10");
    expect(out).toContain("Seg 19/10");
    expect(out).toContain('rowSpan="2"');
    expect(out).toContain("6h30");
  });
});
