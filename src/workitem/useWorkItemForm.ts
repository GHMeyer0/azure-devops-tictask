import type { IWorkItemFieldChangedArgs, IWorkItemFormService } from "azure-devops-extension-api/WorkItemTracking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskInfo } from "../common/domain/types";
import { SDK } from "../common/sdk";
import { useTrackerEvents } from "../common/ui/hooks";

export { useTimerHandlers } from "../common/ui/hooks";
import { F } from "../common/wit/witService";
import { formWriter, getFormService, readForm, type WorkItemWriter } from "../common/wit/writer";

const WATCHED = new Set<string>([F.state, F.original, F.remaining, F.completed, F.title, F.assignedTo]);

// The host looks up the form listener as soon as the page reports it loaded, so it is registered
// before the first render (see registerFormEvents) and forwards to whatever hook is mounted.
type FormEvent = "changed" | "unloaded";
const formListeners = new Set<(e: FormEvent) => void>();
const fire = (e: FormEvent) => formListeners.forEach((fn) => fn(e));

export function registerFormEvents(): void {
  SDK.register(SDK.getContributionId(), () => ({
    onLoaded: () => fire("changed"),
    onSaved: () => fire("changed"),
    onRefreshed: () => fire("changed"),
    onReset: () => fire("changed"),
    onFieldChanged: (args: IWorkItemFieldChangedArgs) => {
      if (Object.keys(args.changedFields ?? {}).some((f) => WATCHED.has(f))) fire("changed");
    },
    onUnloaded: () => fire("unloaded"),
  }));
}

/** The work item open in the form, refreshed on load/save/refresh and when relevant fields change. */
export function useWorkItemForm(): { info: TaskInfo | null; isNew: boolean; writer: WorkItemWriter | null; reload: () => void } {
  const [form, setForm] = useState<IWorkItemFormService | null>(null);
  const [info, setInfo] = useState<TaskInfo | null>(null);
  const [isNew, setIsNew] = useState(false);
  const formRef = useRef<IWorkItemFormService | null>(null);

  const reload = useCallback(async () => {
    const f = formRef.current ?? (await getFormService());
    formRef.current = f;
    setForm(f);
    if (!(await f.hasActiveWorkItem())) return;
    setIsNew(await f.isNew());
    setInfo(await readForm(f));
  }, []);

  useEffect(() => {
    const listener = (e: FormEvent) => (e === "unloaded" ? setInfo(null) : void reload());
    formListeners.add(listener);
    void reload();
    return () => void formListeners.delete(listener);
  }, [reload]);

  // Another iframe may have changed this item through REST: pull the new revision into the form,
  // but never throw away edits the user has not saved yet.
  useTrackerEvents(info ? [info.id] : [], async () => {
    const f = formRef.current;
    if (!f || (await f.isDirty())) return void reload();
    await f.refresh().catch(() => undefined);
    void reload();
  });

  const writer = useMemo(() => (form && info && !isNew ? formWriter(form, info.id) : null), [form, info?.id, isNew]);
  return { info, isNew, writer, reload };
}
