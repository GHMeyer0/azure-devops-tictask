import { Caption1, Text, makeStyles, tokens } from "@fluentui/react-components";
import { PlayRegular } from "@fluentui/react-icons";
import { useState } from "react";
import type { EstimateRequest, EstimateResult } from "../common/dialogs";
import { findActivity } from "../common/domain/settings";
import { minutesToHours } from "../common/domain/time";
import { DialogShell } from "./DialogShell";
import { DurationInput } from "./fields";

const useStyles = makeStyles({
  task: { padding: "8px 12px", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, display: "flex", flexDirection: "column", gap: "4px" },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** Asked before the timer starts on a task without an estimate: it becomes Original Estimate and Remaining. */
export function EstimateDialog({ request, onDone }: { request: EstimateRequest; onDone: (r?: EstimateResult) => void }) {
  const st = useStyles();
  const suggested = findActivity(request.settings, request.activity)?.defaultEstimate;
  const [minutes, setMinutes] = useState<number | null>(suggested ? suggested * 60 : null);
  return (
    <DialogShell okText="Iniciar" okIcon={<PlayRegular />} okDisabled={!minutes} onOk={() => minutes && onDone({ estimate: minutesToHours(minutes) })} onCancel={() => onDone()}>
      <div className={st.task}>
        <Text weight="semibold">
          #{request.task.id} {request.task.title}
        </Text>
        <Caption1 className={st.muted}>A task ainda não tem estimativa, e o processo exige uma para começar o trabalho.</Caption1>
      </div>
      <div style={{ width: 180 }}>
        <DurationInput label="Estimativa da task" required minutes={minutes} onChange={setMinutes} hint="Vira o Original Estimate e o Remaining" />
      </div>
    </DialogShell>
  );
}
