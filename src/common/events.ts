// Cross-iframe notifications: the form group, the form tab, the hub and dialogs are separate
// iframes served from the same extension origin, so a BroadcastChannel reaches all of them.

export type TrackerEvent = { type: "timer" } | { type: "entries"; workItemIds: number[] } | { type: "workitems"; workItemIds: number[] };

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("time-tracker") : undefined;
const local = new Set<(e: TrackerEvent) => void>();

export function emit(event: TrackerEvent): void {
  channel?.postMessage(event);
  local.forEach((fn) => fn(event));
}

export function subscribe(fn: (e: TrackerEvent) => void): () => void {
  const handler = (m: MessageEvent<TrackerEvent>) => fn(m.data);
  channel?.addEventListener("message", handler);
  local.add(fn);
  return () => {
    channel?.removeEventListener("message", handler);
    local.delete(fn);
  };
}
