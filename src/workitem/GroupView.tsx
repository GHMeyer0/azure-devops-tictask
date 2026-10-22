import { Button, Caption1, ProgressBar, Spinner, Text, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, PlayRegular, TaskListAddRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { createStandardTasks, isTask, logTime, startOnParent, startTimer } from "../common/actions";
import { consumption } from "../common/domain/remaining";
import { round2, formatHours } from "../common/domain/time";
import type { TaskInfo } from "../common/domain/types";
import { ErrorBar, StateBadge, TimerControls } from "../common/ui/components";
import { useAutoResize, useCtx, useRunner, useTimer, useTrackerEvents } from "../common/ui/hooks";
import { getChildren } from "../common/wit/witService";
import { useTimerHandlers, useWorkItemForm } from "./useWorkItemForm";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "8px", padding: "4px 2px 8px" },
  row: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
  other: { padding: "4px 8px", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
});

export function sumHours(tasks: TaskInfo[]) {
  const add = (k: "original" | "remaining" | "completed") => round2(tasks.reduce((s, t) => s + (t[k] ?? 0), 0));
  return { original: add("original"), remaining: add("remaining"), completed: add("completed") };
}

/** Compact block in the Details tab: start/pause/stop + log, like the 7pace group. */
export function GroupView() {
  const st = useStyles();
  useAutoResize();
  const { info, isNew, writer } = useWorkItemForm();
  const { ctx, error: ctxError } = useCtx(writer);
  const { timer, elapsedMs } = useTimer();
  const { busy, error, run } = useRunner();
  const handlers = useTimerHandlers(ctx, timer, run);
  const [children, setChildren] = useState<TaskInfo[] | null>(null);

  const parentMode = !!ctx && !!info && !isTask(ctx, info);
  const loadChildren = () => {
    if (parentMode && info) getChildren(info.id).then((c) => setChildren(c.filter((t) => isTask(ctx!, t)))).catch(() => setChildren([]));
  };
  useEffect(loadChildren, [parentMode, info?.id]);
  useTrackerEvents(info ? [info.id, ...(children ?? []).map((c) => c.id)] : [], loadChildren);

  if (ctxError) return <ErrorBar error={ctxError} />;
  if (isNew) return <Caption1 className={st.muted}>Salve o work item para apontar horas.</Caption1>;
  if (!info || !ctx) return <Spinner size="tiny" />;

  const timerHere = !!timer && (timer.workItem.id === info.id || (parentMode && timer.workItem.parentId === info.id));
  const fields = parentMode ? sumHours(children ?? []) : info;
  const pct = consumption(fields);

  return (
    <div className={st.root}>
      {timer && timerHere ? (
        <TimerControls timer={timer} elapsedMs={elapsedMs} busy={busy} {...handlers} showTarget={parentMode} />
      ) : (
        <div className={st.row}>
          <Button appearance="primary" size="small" icon={<PlayRegular />} disabled={busy} onClick={() => run(() => (parentMode ? startOnParent(ctx, info, "timer") : startTimer(ctx, info)))}>
            Iniciar
          </Button>
          <Button size="small" icon={<AddRegular />} disabled={busy} onClick={() => run(() => (parentMode ? startOnParent(ctx, info, "log") : logTime(ctx, info)))}>
            Apontar
          </Button>
          {parentMode && (
            <Button size="small" appearance="subtle" icon={<TaskListAddRegular />} disabled={busy} onClick={() => run(() => createStandardTasks(ctx, info))}>
              Tasks padrão
            </Button>
          )}
        </div>
      )}

      {timer && !timerHere && (
        <div className={st.other}>
          <TimerControls timer={timer} elapsedMs={elapsedMs} busy={busy} {...handlers} showTarget />
        </div>
      )}

      <div className={st.row}>
        {!parentMode && <StateBadge state={info.state} settings={ctx.settings} />}
        <Text size={200}>
          {parentMode && children ? `${children.length} tasks · ` : ""}Est {formatHours(fields.original)} · Compl {formatHours(fields.completed ?? 0)} · Rest {formatHours(fields.remaining)}
          {pct !== null ? ` · ${pct}%` : ""}
        </Text>
        {busy && <Spinner size="extra-tiny" />}
      </div>
      {pct !== null && <ProgressBar value={Math.min(1, pct / 100)} color={pct > 100 ? "error" : pct >= 90 ? "warning" : "brand"} />}
      <ErrorBar error={error} />
    </div>
  );
}
