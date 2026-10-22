import { Caption1, Checkbox, Divider, Field, Input, Link, Radio, RadioGroup, Text, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowRightRegular, PlayRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import type { NewTaskInput, StartRequest, StartResult } from "../common/dialogs";
import { buildTaskTitle, findActivity, guessActivity } from "../common/domain/settings";
import { isClosedState } from "../common/domain/state";
import { formatHours, minutesToHours } from "../common/domain/time";
import type { TaskInfo } from "../common/domain/types";
import { StateBadge } from "../common/ui/components";
import { DialogShell } from "./DialogShell";
import { ActivityField, DurationInput } from "./fields";

const useStyles = makeStyles({
  group: { display: "flex", flexDirection: "column", gap: "2px" },
  newTask: { display: "flex", flexDirection: "column", gap: "10px", padding: "8px 12px", marginLeft: "28px", minWidth: 0, borderLeft: `2px solid ${tokens.colorBrandStroke1}` },
  row: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
  label: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" },
});

const NEW = "new";

const isMine = (t: TaskInfo, req: StartRequest) => {
  const a = t.assignedTo;
  return !!a && (a.id === req.me.id || a.email.toLowerCase() === req.me.email.toLowerCase());
};

/** "O que você vai fazer?" — pick one of my tasks under the US/Bug, or create a new one from a description. */
export function StartDialog({ request, onDone }: { request: StartRequest; onDone: (r?: StartResult) => void }) {
  const st = useStyles();
  const { settings, children } = request;
  const open = children.filter((c) => !isClosedState(c.state, settings.states));
  const mine = open.filter((c) => isMine(c, request));
  const others = children.filter((c) => !mine.includes(c));

  const [selected, setSelected] = useState<string>(mine.length ? String(mine[0].id) : NEW);
  const [showOthers, setShowOthers] = useState(false);
  const [taskActivity, setTaskActivity] = useState<Record<number, string>>({});
  const [activity, setActivity] = useState(settings.activities[0]?.name ?? "");
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState<number | null>((findActivity(settings, settings.activities[0]?.name)?.defaultEstimate ?? 1) * 60);
  const [createStandard, setCreateStandard] = useState(false);

  const activityOf = (t: TaskInfo) => taskActivity[t.id] ?? guessActivity(settings, t.title, t.activity) ?? settings.activities[0]?.name ?? "";
  const selectedTask = children.find((c) => String(c.id) === selected);

  // Standard tasks that are missing (no child already looks like that activity), minus the one being created now.
  const missingStandard = useMemo(() => {
    const present = new Set(children.map((c) => guessActivity(settings, c.title, c.activity)));
    return settings.activities.filter((a) => a.standard && !present.has(a.name) && a.name !== activity);
  }, [children, settings, activity]);

  const changeActivity = (name: string) => {
    setActivity(name);
    const def = findActivity(settings, name);
    if (def) setEstimate(def.defaultEstimate * 60);
  };

  const submit = () => {
    if (selectedTask) {
      onDone({ kind: "existing", taskId: selectedTask.id, activity: activityOf(selectedTask) });
      return;
    }
    const task: NewTaskInput = { activity, description, estimate: estimate ? minutesToHours(estimate) : undefined };
    const standard: NewTaskInput[] = createStandard ? missingStandard.map((a) => ({ activity: a.name, description: a.defaultTitle, estimate: a.defaultEstimate })) : [];
    onDone({ kind: "new", task, standard });
  };

  const placeholder = findActivity(settings, activity)?.defaultTitle || "Descreva o que vai fazer";
  const verb = request.purpose === "timer" ? "Iniciar" : "Continuar";

  const taskRadio = (t: TaskInfo) => (
    <Radio
      key={t.id}
      value={String(t.id)}
      label={
        <span className={st.label}>
          <Text weight={selected === String(t.id) ? "semibold" : "regular"}>
            #{t.id} {t.title}
          </Text>
          <StateBadge state={t.state} settings={settings} />
          <Caption1 className={st.muted}>
            {formatHours(t.completed ?? 0)} / {formatHours(t.original)}
            {t.assignedTo && !isMine(t, request) ? ` · ${t.assignedTo.displayName}` : ""}
          </Caption1>
        </span>
      }
    />
  );

  return (
    <DialogShell okText={verb} okIcon={request.purpose === "timer" ? <PlayRegular /> : <ArrowRightRegular />} okDisabled={!selectedTask && !activity} onOk={submit} onCancel={() => onDone()}>
      <Text>
        <b>
          #{request.parent.id} {request.parent.title}
        </b>
      </Text>

      <RadioGroup value={selected} onChange={(_, d) => setSelected(d.value)}>
        <Caption1 className={st.muted}>{mine.length ? `Minhas tasks em #${request.parent.id}` : `Você ainda não tem tasks abertas em #${request.parent.id}.`}</Caption1>
        <div className={st.group}>{mine.map(taskRadio)}</div>

        {others.length > 0 && (
          <>
            <Link onClick={() => setShowOthers(!showOthers)}>
              {showOthers ? "▾" : "▸"} Outras tasks ({others.length})
            </Link>
            {showOthers && <div className={st.group}>{others.map(taskRadio)}</div>}
          </>
        )}

        <Divider />
        <Radio value={NEW} label={<Text weight={selected === NEW ? "semibold" : "regular"}>Nova task</Text>} />
      </RadioGroup>

      {selectedTask && (
        <div style={{ maxWidth: 280 }}>
          <ActivityField settings={settings} value={activityOf(selectedTask)} onChange={(v) => setTaskActivity({ ...taskActivity, [selectedTask.id]: v })} label="Atividade do apontamento" />
        </div>
      )}

      {selected === NEW && (
        <div className={st.newTask}>
          <div className={st.row}>
            <div style={{ flexGrow: 1, minWidth: 180 }}>
              <ActivityField settings={settings} value={activity} onChange={changeActivity} />
            </div>
            <div style={{ width: 120 }}>
              <DurationInput label="Estimativa" minutes={estimate} onChange={setEstimate} />
            </div>
          </div>
          <Field label="Descrição (vira o título da task)" hint={`Título: "${buildTaskTitle(settings, activity, description)}" · atribuída a você`}>
            <Input value={description} onChange={(_, d) => setDescription(d.value)} placeholder={placeholder} autoFocus />
          </Field>
          {missingStandard.length > 0 && (
            <Checkbox
              checked={createStandard}
              onChange={(_, d) => setCreateStandard(!!d.checked)}
              label={`Criar também as tasks padrão que faltam: ${missingStandard.map((a) => a.name).join(", ")}`}
            />
          )}
        </div>
      )}
    </DialogShell>
  );
}
