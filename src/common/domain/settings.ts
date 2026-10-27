import type { ActivityDef, ReasonDef, Settings } from "./types";

/** Activity of the review rework task (see the review flow in docs/wiki/Usar-numa-User-Story-ou-Bug.md). */
export const CORRECTION = "Correção";

export const DEFAULT_ACTIVITIES: ActivityDef[] = [
  { name: "Investigação", witActivity: "Requirements", defaultTitle: "Investigação", standard: true, defaultEstimate: 2, color: "#8764b8" },
  { name: "Desenvolvimento", witActivity: "Development", defaultTitle: "Desenvolvimento", standard: true, defaultEstimate: 4, color: "#0078d4" },
  { name: "Revisão", witActivity: "Development", defaultTitle: "Revisão de PR", standard: true, defaultEstimate: 1, color: "#ca5010" },
  { name: "Testes", witActivity: "Testing", defaultTitle: "Testes e ajustes", standard: true, defaultEstimate: 2, color: "#107c10" },
  // Rework asked in the PR review: one task per story, kept apart so the development estimate stays clean.
  { name: CORRECTION, witActivity: "Development", defaultTitle: "Correções da revisão", standard: false, defaultEstimate: 1, color: "#4f6bed" },
  { name: "Reunião", defaultTitle: "Reunião com cliente", standard: false, defaultEstimate: 1, color: "#038387" },
  { name: "Outros", defaultTitle: "", standard: false, defaultEstimate: 1, color: "#69797e" },
];

export const DEFAULT_REASONS: ReasonDef[] = [
  { name: "Aguardando revisão", kind: "pause", commentOnParent: true },
  { name: "Aguardando correções", kind: "pause", commentOnParent: true },
  { name: "Revisando PR", kind: "pause", commentOnParent: false },
  { name: "Apoio a colega", kind: "pause", commentOnParent: false },
  { name: "Aguardando terceiros", kind: "pause", commentOnParent: true },
  { name: "Reunião", kind: "pause", commentOnParent: false },
  { name: "Enviado para revisão", kind: "conclude", commentOnParent: true },
  { name: "PR aprovado", kind: "conclude", commentOnParent: true },
  { name: "Pronto para testes", kind: "conclude", commentOnParent: true },
];

export const DEFAULT_SETTINGS: Settings = {
  activities: DEFAULT_ACTIVITIES,
  parentTypes: ["User Story", "Technical Story", "Bug", "Product Backlog Item", "Issue"],
  taskType: "Task",
  titleWithActivityPrefix: false,
  lockDays: 7,
  postComment: false,
  teamPresence: true,
  managers: [],
  chat: {
    remindersEnabled: false,
    recipients: [],
    workStart: "08:00",
    workEnd: "17:00",
    lunchStart: "12:00",
    lunchEnd: "14:00",
    maxRemindersPerDay: 2,
    yesterdayInDaily: true,
  },
  states: {
    active: "Active",
    closed: "Closed",
    autoActivateFrom: ["New", "Stopped", "Waiting", "To Do"],
    closedStates: ["Closed", "Done", "Removed"],
    pauseStates: ["Stopped"],
    reasons: DEFAULT_REASONS,
    runningAlertHours: 10,
    pausedAlertDays: 5,
    closedPolicy: "confirm",
    parentAutoActivateFrom: ["New", "Ready for Development", "Approved", "Committed"],
    parentActive: "Active",
  },
};

/** Fills fields missing from a stored settings document (older versions) with defaults. */
export function mergeSettings(input: Partial<Settings> | undefined | null): Settings {
  if (!input) return structuredClone(DEFAULT_SETTINGS);
  // Dropped in 0.5.0 (no hour targets); old documents still carry it.
  const { dailyTargetHours: _dropped, ...stored } = input as Partial<Settings> & { dailyTargetHours?: number };
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...stored,
    activities: stored.activities?.length ? stored.activities : structuredClone(DEFAULT_ACTIVITIES),
    states: { ...structuredClone(DEFAULT_SETTINGS.states), ...(stored.states ?? {}) },
    chat: { ...DEFAULT_SETTINGS.chat, ...(stored.chat ?? {}) },
  };
}

export function reasonsOf(settings: Settings, kind: ReasonDef["kind"]): ReasonDef[] {
  return settings.states.reasons.filter((r) => r.kind === kind);
}

export function findActivity(settings: Settings, name: string | undefined): ActivityDef | undefined {
  return settings.activities.find((a) => a.name === name);
}

/** Task title for a new task: the description, optionally prefixed by the activity. */
export function buildTaskTitle(settings: Settings, activity: string, description: string): string {
  const text = description.trim() || findActivity(settings, activity)?.defaultTitle || activity;
  return settings.titleWithActivityPrefix && !text.toLowerCase().startsWith(activity.toLowerCase()) ? `${activity}: ${text}` : text;
}

/**
 * Guesses the activity of an existing task: its Activity field mapped back, or keywords in the title
 * (the team names tasks "Investigação", "Desenvolvimento...", "Revisão de PR", "Testes e ajustes").
 */
export function guessActivity(settings: Settings, title: string, witActivity?: string): string | undefined {
  const t = title.toLowerCase();
  const keywords: [string, RegExp][] = [
    // Before Revisão: "Correções da revisão" is the rework, not the review.
    [CORRECTION, /corre[çc]|corrig|\bfix/],
    ["Revisão", /revis|review|\bpr\b/],
    ["Testes", /test|valida|homolog/],
    ["Investigação", /investig|anális|analis|mapear|levantamento/],
    ["Reunião", /reuni|meeting|daily|alinhamento/],
    ["Desenvolvimento", /desenv|implement|dev/],
    // Projects saved before 0.7.0 have a single "Desenvolvimento/Correção" activity.
    ["Desenvolvimento/Correção", /desenv|corre|ajust|implement|fix|dev/],
  ];
  for (const [name, re] of keywords) {
    if (re.test(t) && findActivity(settings, name)) return name;
  }
  if (witActivity) return settings.activities.find((a) => a.witActivity === witActivity)?.name;
  return undefined;
}
