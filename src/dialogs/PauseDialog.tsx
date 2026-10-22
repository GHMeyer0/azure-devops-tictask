import { Field, Radio, RadioGroup, Text, Textarea } from "@fluentui/react-components";
import { PauseRegular } from "@fluentui/react-icons";
import { useState } from "react";
import type { PauseRequest, PauseResult } from "../common/dialogs";
import { DialogShell } from "./DialogShell";

const KEEP = "__keep";

/** Pausing the timer can also move the task to Stopped/Waiting (optional). */
export function PauseDialog({ request, onDone }: { request: PauseRequest; onDone: (r?: PauseResult) => void }) {
  const { task, settings } = request;
  const [state, setState] = useState(KEEP);
  const [reason, setReason] = useState("");
  const options = settings.states.pauseStates.filter((s) => s !== task.state);

  return (
    <DialogShell okText="Pausar" okIcon={<PauseRegular />} onOk={() => onDone({ state: state === KEEP ? undefined : state, reason: reason.trim() || undefined })} onCancel={() => onDone()}>
      <Text>
        #{task.id} {task.title}
      </Text>
      <RadioGroup value={state} onChange={(_, d) => setState(d.value)}>
        <Radio value={KEEP} label={`Só pausar o timer (task continua ${task.state})`} />
        {options.map((s) => (
          <Radio key={s} value={s} label={`Pausar e mudar a task para ${s}`} />
        ))}
      </RadioGroup>
      {state !== KEEP && (
        <Field label="Motivo (vai para a discussão da task)">
          <Textarea value={reason} onChange={(_, d) => setReason(d.value)} placeholder="Ex.: aguardando retorno do cliente" />
        </Field>
      )}
    </DialogShell>
  );
}
