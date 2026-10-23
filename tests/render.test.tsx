// Smoke test: renders dialogs and shared components outside Azure DevOps (SDK mocked) to catch
// runtime errors in the React tree. Interaction with the host is covered by the manual checklist.
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("azure-devops-extension-sdk", () => ({
  getConfiguration: () => ({}),
  getExtensionContext: () => ({ publisherId: "tiino", extensionId: "time-tracker" }),
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
const { StartDialog } = await import("../src/dialogs/StartDialog");
const { StandardDialog } = await import("../src/dialogs/StandardDialog");
const { PauseDialog } = await import("../src/dialogs/PauseDialog");
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
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task, draft, settings, projectName: "Tiino" }} onDone={() => undefined} />);
    expect(out).toContain("Remaining após apontar");
    expect(out).toContain("Concluir task");
  });

  it("log dialog shows the task picker when no task comes (null or lost on the host bridge)", () => {
    const req = { kind: "log" as const, mode: "create" as const, draft, settings, projectName: "Tiino" };
    expect(html(<LogDialog request={{ ...req, task: null }} onDone={() => undefined} />)).toContain("Buscar task");
    expect(html(<LogDialog request={{ ...req, task: undefined as never }} onDone={() => undefined} />)).toContain("Buscar task");
  });

  it("log dialog explains times filled from the timer's pause", () => {
    const note = "Horário preenchido com a pausa do seu timer (15:00–15:45).";
    expect(html(<LogDialog request={{ kind: "log", mode: "create", task: null, draft, settings, projectName: "Tiino", note }} onDone={() => undefined} />)).toContain(note);
  });

  it("log dialog asks for an estimate when the task has none", () => {
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task: { ...task, original: null, remaining: null }, draft, settings, projectName: "Tiino" }} onDone={() => undefined} />);
    expect(out).toContain("Estimativa da task");
  });

  it("log dialog with timer segments", () => {
    const segments = [
      { start: "2026-10-21T12:00:00.000Z", end: "2026-10-21T15:00:00.000Z" },
      { start: "2026-10-21T16:00:00.000Z", end: "2026-10-21T17:30:00.000Z" },
    ];
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task, draft: { ...draft, minutes: 270, segments }, settings, projectName: "Tiino", fromTimer: true }} onDone={() => undefined} />);
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

  it("standard and pause dialogs", () => {
    expect(html(<StandardDialog request={{ kind: "standard", parent, children: [task], settings }} onDone={() => undefined} />)).toContain("Investigação");
    expect(html(<PauseDialog request={{ kind: "pause", task, settings }} onDone={() => undefined} />)).toContain("Stopped");
  });

  it("pause dialog only offers states the task type has", () => {
    const configured = { ...settings, states: { ...settings.states, pauseStates: ["Stopped", "Waiting"] } };
    const out = html(<PauseDialog request={{ kind: "pause", task, settings: configured, states: ["Stopped"] }} onDone={() => undefined} />);
    expect(out).toContain("mudar a task para Stopped");
    expect(out).not.toContain("Waiting");
  });

  it("log dialog offers to leave the task paused when switching timers", () => {
    const out = html(<LogDialog request={{ kind: "log", mode: "create", task, draft, settings, projectName: "Tiino", fromTimer: true, offerState: "Stopped" }} onDone={() => undefined} />);
    expect(out).toContain("Deixar a task em Stopped");
  });
});

describe("team view render", () => {
  it("says when the team view is disabled", async () => {
    const { TeamNow } = await import("../src/common/ui/TeamNow");
    const ctx = { projectId: "p", projectName: "Tiino", user: { id: "u1", displayName: "Ana", email: "ana@x.com" }, settings: { ...settings, teamPresence: false }, writer: { apply: async () => ({}) as never } };
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
    const ctx = { projectId: "p", projectName: "Tiino", user: { id: "u1", displayName: "Ana", email: "ana@x.com" }, settings, writer: { apply: async () => ({}) as never } };
    const out = html(<MigrationSection ctx={ctx} onSettingsImported={() => undefined} />);
    expect(out).toContain("Exportar dados do projeto");
    expect(out).toContain("tiino.time-tracker");
  });

  it("settings use pickers and have no daily target", async () => {
    const { SettingsView } = await import("../src/hub/SettingsView");
    const ctx = { projectId: "p", projectName: "Tiino", user: { id: "u1", displayName: "Ana", email: "ana@x.com" }, settings, writer: { apply: async () => ({}) as never } };
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
    expect(html(<TimerControls timer={timer} elapsedMs={3_723_000} busy={false} onPause={() => undefined} onResume={() => undefined} onStop={() => undefined} />)).toContain("01:02:03");
    const entry = {
      id: "e1", projectId: "p", workItemId: 1, workItemTitle: "T", workItemType: "Task", userId: "u1", userName: "Ana", userEmail: "a@x", date: "2026-10-21",
      start: "2026-10-21T12:00:00.000Z", end: "2026-10-21T13:30:00.000Z", minutes: 90, segments: [], activity: "Testes", comment: "ok", source: "manual" as const,
      createdAt: "2026-10-21T13:30:00.000Z", createdBy: "u1", history: [],
    };
    expect(html(<EntriesTable entries={[entry]} canEdit={() => true} onEdit={() => undefined} onDelete={() => undefined} />)).toContain("1h30");
  });
});
