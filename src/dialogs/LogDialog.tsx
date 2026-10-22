import { Button, Caption1, Checkbox, Field, Input, MessageBar, MessageBarBody, Radio, RadioGroup, Spinner, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { SaveRegular, SearchRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import type { LogRequest, LogResult } from "../common/dialogs";
import { applyCreate, applyEdit, needsEstimate } from "../common/domain/remaining";
import { guessActivity } from "../common/domain/settings";
import { isClosedState } from "../common/domain/state";
import { addMinutesToTime, formatHours, formatMinutes, hoursToMinutes, minutesBetweenTimes, minutesToHours, toLocalTime } from "../common/domain/time";
import { groupByParent, type ParentRef } from "../common/domain/tree";
import type { TaskInfo } from "../common/domain/types";
import { StateBadge, TypeBadge } from "../common/ui/components";
import { errorMessage } from "../common/ui/hooks";
import { getWorkItems, searchTasks } from "../common/wit/witService";
import { DialogShell } from "./DialogShell";
import { ActivityField, DurationInput } from "./fields";

const useStyles = makeStyles({
  row: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  grow: { flexGrow: 1 },
  quick: { display: "flex", gap: "4px", flexWrap: "wrap" },
  task: { padding: "8px 12px", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, display: "flex", flexDirection: "column", gap: "4px" },
  results: { maxHeight: "260px", overflowY: "auto", overflowX: "hidden", border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: "4px 8px" },
  group: { display: "flex", flexDirection: "column", padding: "4px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  groupHeader: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden", padding: "2px 0" },
  groupTitle: { minWidth: 0, overflow: "hidden" },
  muted: { color: tokens.colorNeutralForeground3 },
});

const QUICK = [30, 60, 120, 240];

export function LogDialog({ request, onDone }: { request: LogRequest; onDone: (r?: LogResult) => void }) {
  const st = useStyles();
  const { settings, draft: initial } = request;
  // `task: null` may arrive as undefined: the dialog configuration crosses the host/iframe bridge.
  const pickTask = !request.task;
  const [task, setTask] = useState<TaskInfo | null>(request.task ?? null);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [minutes, setMinutes] = useState<number | null>(initial.minutes);
  const [segments, setSegments] = useState(initial.segments);
  const [activity, setActivity] = useState(initial.activity);
  const [comment, setComment] = useState(initial.comment);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [remainingEdited, setRemainingEdited] = useState<number | null | undefined>(undefined);
  const [closeTask, setCloseTask] = useState(false);

  const bySegments = segments.length > 0;
  const hours = minutesToHours(minutes ?? 0);
  const askEstimate = request.mode === "create" && !!task && needsEstimate(task);

  const computedRemaining = useMemo(() => {
    if (!task) return null;
    if (request.mode === "edit") return applyEdit(task, minutesToHours(request.previousMinutes ?? 0), hours).remaining;
    return applyCreate(task, hours, estimate === null ? undefined : minutesToHours(estimate)).remaining;
  }, [task, hours, estimate, request.mode, request.previousMinutes]);
  const remainingMinutes = remainingEdited !== undefined ? remainingEdited : computedRemaining === null ? null : hoursToMinutes(computedRemaining);

  const timeError = !bySegments && minutesBetweenTimes(startTime, endTime) <= 0 ? "O fim deve ser depois do início" : null;
  const problems = [
    !task && "Selecione a task",
    (!minutes || minutes <= 0) && "Informe a duração",
    minutes !== null && minutes > 24 * 60 && "Duração maior que 24h",
    timeError,
    askEstimate && !estimate && "Informe a estimativa da task",
    remainingMinutes === null && remainingEdited !== undefined && "Remaining inválido",
    !activity && "Selecione a atividade",
  ].filter(Boolean) as string[];

  const changeStart = (v: string) => {
    setStartTime(v);
    if (minutes) setEndTime(addMinutesToTime(v, minutes));
  };
  const changeEnd = (v: string) => {
    setEndTime(v);
    const m = minutesBetweenTimes(startTime, v);
    if (m > 0) setMinutes(m);
  };
  const changeMinutes = (m: number | null) => {
    setMinutes(m);
    if (m && !bySegments) setEndTime(addMinutesToTime(startTime, m));
  };

  const submit = () => {
    if (!task || !minutes) return;
    onDone({
      task,
      draft: { date, startTime, endTime, minutes, segments, activity, comment: comment.trim() },
      remaining: remainingEdited !== undefined && remainingEdited !== null ? minutesToHours(remainingEdited) : undefined,
      estimate: askEstimate && estimate ? minutesToHours(estimate) : undefined,
      closeTask,
    });
  };

  return (
    <DialogShell okText="Salvar" okIcon={<SaveRegular />} okDisabled={problems.length > 0} onOk={submit} onCancel={() => onDone()} error={problems.length && task ? problems[0] : null}>
      {pickTask ? (
        <TaskPicker
          request={request}
          value={task}
          onChange={(t) => {
            setTask(t);
            if (t) setActivity(guessActivity(settings, t.title, t.activity) ?? activity);
          }}
        />
      ) : (
        task && <TaskCard task={task} request={request} />
      )}

      {task && isClosedState(task.state, settings.states) && request.mode === "create" && (
        <MessageBar intent="warning">
          <MessageBarBody>
            A task está {task.state}. Ao salvar ela volta para {settings.states.active}.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={st.row}>
        <Field label="Data" required>
          <Input type="date" value={date} onChange={(_, d) => setDate(d.value)} />
        </Field>
        <Field label="De">
          <Input type="time" value={startTime} disabled={bySegments} onChange={(_, d) => changeStart(d.value)} />
        </Field>
        <Field label="Até" validationState={timeError ? "error" : "none"}>
          <Input type="time" value={endTime} disabled={bySegments} onChange={(_, d) => changeEnd(d.value)} />
        </Field>
        <div style={{ width: 110 }}>
          <DurationInput label="Duração" required minutes={minutes} onChange={changeMinutes} disabled={bySegments} />
        </div>
      </div>

      {bySegments ? (
        <Caption1 className={st.muted}>
          Trechos do timer: {segments.map((s) => `${toLocalTime(s.start)}–${toLocalTime(s.end)}`).join(" · ")} ({segments.length - 1} {segments.length - 1 === 1 ? "pausa" : "pausas"}) ·{" "}
          <Button size="small" appearance="transparent" onClick={() => setSegments([])}>
            editar horário manualmente
          </Button>
        </Caption1>
      ) : (
        <div className={st.quick}>
          {QUICK.map((m) => (
            <Button key={m} size="small" appearance={minutes === m ? "primary" : "secondary"} onClick={() => changeMinutes(m)}>
              {formatMinutes(m)}
            </Button>
          ))}
        </div>
      )}

      <ActivityField settings={settings} value={activity} onChange={setActivity} />

      <Field label="Comentário">
        <Textarea value={comment} onChange={(_, d) => setComment(d.value)} resize="vertical" placeholder="O que foi feito (opcional)" />
      </Field>

      {task && (
        <div className={st.row}>
          {askEstimate && (
            <div style={{ width: 160 }}>
              <DurationInput label="Estimativa da task" required minutes={estimate} onChange={setEstimate} hint="Task sem estimativa" />
            </div>
          )}
          <div style={{ width: 180 }}>
            <DurationInput
              label="Remaining após apontar"
              minutes={remainingMinutes}
              onChange={(m) => setRemainingEdited(m)}
              hint={remainingEdited !== undefined ? "Ajustado manualmente" : "Calculado automaticamente"}
            />
          </div>
          {request.mode === "create" && (
            <Checkbox
              checked={closeTask}
              onChange={(_, d) => setCloseTask(!!d.checked)}
              label={`Concluir task (${settings.states.closed})`}
              style={remainingMinutes === 0 && !closeTask ? { fontWeight: 600 } : undefined}
            />
          )}
        </div>
      )}
      {task && request.mode === "create" && remainingMinutes === 0 && !closeTask && <Caption1 className={st.muted}>Remaining zerado: marque "Concluir task" se o trabalho terminou.</Caption1>}
    </DialogShell>
  );
}

function TaskCard({ task, request }: { task: TaskInfo; request: LogRequest }) {
  const st = useStyles();
  return (
    <div className={st.task}>
      <Text weight="semibold">
        #{task.id} {task.title}
      </Text>
      <Caption1>
        <StateBadge state={task.state} settings={request.settings} /> · Estimado {formatHours(task.original)} · Completo {formatHours(task.completed ?? 0)} · Restante {formatHours(task.remaining)}
      </Caption1>
    </div>
  );
}

/** Parent items (Bug / US / TS) of the given tasks: tasks named "Revisão" or "Desenvolvimento" repeat, the parent tells them apart. */
async function parentsOf(tasks: TaskInfo[]): Promise<Map<number, ParentRef>> {
  const ids = [...new Set(tasks.map((t) => t.parentId).filter((id): id is number => !!id))];
  if (!ids.length) return new Map();
  const items = await getWorkItems(ids);
  return new Map(items.map((p) => [p.id, { id: p.id, type: p.type, title: p.title }]));
}

function TaskPicker({ request, value, onChange }: { request: LogRequest; value: TaskInfo | null; onChange: (t: TaskInfo | null) => void }) {
  const st = useStyles();
  const [text, setText] = useState("");
  const [results, setResults] = useState<{ tasks: TaskInfo[]; parents: Map<number, ParentRef> }>({ tasks: [], parents: new Map() });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchTasks(request.projectName, request.settings.taskType, request.settings.states.closedStates, text)
        .then(async (tasks) => setResults({ tasks, parents: await parentsOf(tasks).catch(() => new Map()) }))
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [text, request]);

  const groups = groupByParent(results.tasks, (t) => t.parentId, results.parents);

  return (
    <Field label="Task" required hint={text ? undefined : "Suas tasks abertas, agrupadas pelo item pai. Busque por título ou #id."} validationMessage={error ?? undefined} validationState={error ? "error" : "none"}>
      <Input contentBefore={<SearchRegular />} value={text} onChange={(_, d) => setText(d.value)} placeholder="Buscar task…" />
      <div className={st.results}>
        {loading && <Spinner size="tiny" />}
        {!loading && !results.tasks.length && <Caption1 className={st.muted}>Nenhuma task encontrada.</Caption1>}
        <RadioGroup value={value ? String(value.id) : ""} onChange={(_, d) => onChange(results.tasks.find((r) => String(r.id) === d.value) ?? null)}>
          {groups.map((g) => (
            <div key={g.parent?.id ?? "none"} className={st.group}>
              <div className={st.groupHeader}>
                {g.parent ? (
                  <>
                    <TypeBadge type={g.parent.type} />
                    <Text className={st.groupTitle} size={200} weight="semibold" truncate wrap={false} title={g.parent.title}>
                      #{g.parent.id} {g.parent.title}
                    </Text>
                  </>
                ) : (
                  <Caption1 className={st.muted}>(sem item pai)</Caption1>
                )}
              </div>
              {g.items.map((t) => (
                <Radio
                  key={t.id}
                  value={String(t.id)}
                  label={
                    <span>
                      #{t.id} {t.title}
                      <Caption1 className={st.muted}>
                        {" "}
                        · {t.state} · {formatHours(t.completed ?? 0)}/{formatHours(t.original)}
                      </Caption1>
                    </span>
                  }
                />
              ))}
            </div>
          ))}
        </RadioGroup>
      </div>
    </Field>
  );
}
