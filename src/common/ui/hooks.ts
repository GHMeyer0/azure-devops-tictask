import { useCallback, useEffect, useRef, useState } from "react";
import { loadCtx, type Ctx } from "../actions";
import { getTimer } from "../data/timerRepo";
import { segmentsMs } from "../domain/time";
import type { ActiveTimer } from "../domain/types";
import { subscribe, type TrackerEvent } from "../events";
import { SDK } from "../sdk";
import type { WorkItemWriter } from "../wit/writer";

export function useCtx(writer?: WorkItemWriter | null): { ctx: Ctx | null; error: string | null } {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (writer === null) return; // waiting for the form writer
    loadCtx(writer)
      .then(setCtx)
      .catch((e) => setError(errorMessage(e)));
  }, [writer]);
  return { ctx, error };
}

/** The current user's timer, kept fresh by events from other iframes and a slow poll. */
export function useTimer(): { timer: ActiveTimer | null; elapsedMs: number; reload: () => void } {
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const reload = useCallback(() => {
    getTimer().then(setTimer).catch(() => setTimer(null));
  }, []);

  useEffect(() => {
    reload();
    const off = subscribe((e) => e.type === "timer" && reload());
    const poll = setInterval(reload, 30_000);
    window.addEventListener("focus", reload);
    return () => {
      off();
      clearInterval(poll);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);

  useEffect(() => {
    if (timer?.status !== "running") return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [timer?.status]);

  return { timer, elapsedMs: timer ? segmentsMs(timer.segments, new Date(nowMs)) : 0, reload };
}

/** Calls `fn` when another iframe reports changes touching any of `ids` (or always, when ids is null). */
export function useTrackerEvents(ids: number[] | null, fn: (e: TrackerEvent) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  const key = ids?.join(",") ?? "*";
  useEffect(() => {
    const watched = ids ? new Set(ids) : null;
    return subscribe((e) => {
      if (e.type === "timer") return;
      if (!watched || e.workItemIds.some((id) => watched.has(id))) ref.current(e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Resizes the host container (form group / dialog) to the content height. The width is always
 * explicit: without it the SDK sends document.body.scrollWidth, and with fluid content the host
 * widens the iframe, the content follows and the dialog grows forever. `width` is a fixed size in
 * px (dialogs); omitted, the current iframe width is kept (form group).
 */
export function useAutoResize(width?: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let last = "";
    const resize = () => {
      const w = width ?? document.documentElement.clientWidth;
      const h = Math.ceil(document.body.scrollHeight);
      if (`${w}x${h}` === last) return;
      last = `${w}x${h}`;
      SDK.resize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.body);
    resize();
    return () => observer.disconnect();
  }, [width, enabled]);
}

/** Runs an async action, exposing busy/error state. */
export function useRunner(): { busy: boolean; error: string | null; run: (fn: () => Promise<unknown>) => Promise<void>; clearError: () => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}

export function errorMessage(e: unknown): string {
  if (!e) return "Erro desconhecido";
  const err = e as { message?: string; serverError?: { message?: string } };
  return err.serverError?.message ?? err.message ?? String(e);
}
