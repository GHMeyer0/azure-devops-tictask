import type { ActivityDef, Settings } from "./types";

export const DEFAULT_ACTIVITIES: ActivityDef[] = [
  { name: "Investigação", witActivity: "Requirements", defaultTitle: "Investigação", standard: true, defaultEstimate: 2, color: "#8764b8" },
  { name: "Desenvolvimento/Correção", witActivity: "Development", defaultTitle: "Desenvolvimento", standard: true, defaultEstimate: 4, color: "#0078d4" },
  { name: "Revisão", witActivity: "Development", defaultTitle: "Revisão de PR", standard: true, defaultEstimate: 1, color: "#ca5010" },
  { name: "Testes", witActivity: "Testing", defaultTitle: "Testes e ajustes", standard: true, defaultEstimate: 2, color: "#107c10" },
  { name: "Reunião", defaultTitle: "Reunião com cliente", standard: false, defaultEstimate: 1, color: "#038387" },
  { name: "Outros", defaultTitle: "", standard: false, defaultEstimate: 1, color: "#69797e" },
];

export const DEFAULT_SETTINGS: Settings = {
  activities: DEFAULT_ACTIVITIES,
  parentTypes: ["User Story", "Technical Story", "Bug", "Product Backlog Item", "Issue"],
  taskType: "Task",
  titleWithActivityPrefix: false,
  lockDays: 7,
  dailyTargetHours: 8,
  postComment: false,
  teamPresence: true,
  managers: [],
  states: {
    active: "Active",
    closed: "Closed",
    autoActivateFrom: ["New", "Stopped", "Waiting", "To Do"],
    closedStates: ["Closed", "Done", "Removed"],
    pauseStates: ["Stopped", "Waiting"],
    closedPolicy: "confirm",
    parentAutoActivateFrom: ["New", "Ready for Development", "Approved", "Committed"],
    parentActive: "Active",
  },
};

/** Fills fields missing from a stored settings document (older versions) with defaults. */
export function mergeSettings(stored: Partial<Settings> | undefined | null): Settings {
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...stored,
    activities: stored.activities?.length ? stored.activities : structuredClone(DEFAULT_ACTIVITIES),
    states: { ...DEFAULT_SETTINGS.states, ...(stored.states ?? {}) },
  };
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
    ["Revisão", /revis|review|\bpr\b/],
    ["Testes", /test|valida|homolog/],
    ["Investigação", /investig|anális|analis|mapear|levantamento/],
    ["Reunião", /reuni|meeting|daily|alinhamento/],
    ["Desenvolvimento/Correção", /desenv|corre|ajust|implement|fix|dev/],
  ];
  for (const [name, re] of keywords) {
    if (re.test(t) && findActivity(settings, name)) return name;
  }
  if (witActivity) return settings.activities.find((a) => a.witActivity === witActivity)?.name;
  return undefined;
}
