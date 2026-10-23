import { Button, Caption1, Field, MessageBar, MessageBarBody, Text, makeStyles, tokens } from "@fluentui/react-components";
import { CheckmarkRegular, PauseRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import type { PauseRequest, PauseResult } from "../common/dialogs";
import { applyCreate, needsEstimate } from "../common/domain/remaining";
import { combineLocal, formatDateBr, formatHours, formatMinutes, minutesBetweenTimes, minutesToHours, segmentsMs, toLocalDate, toLocalTime } from "../common/domain/time";
import { EndTimeInput } from "../common/ui/dateTime";
import { DialogShell } from "./DialogShell";
import { DurationInput, NO_REASON, ReasonField, reasonProblem, reasonResult, type ReasonValue } from "./fields";

const useStyles = makeStyles({
  task: { padding: "8px 12px", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, display: "flex", flexDirection: "column", gap: "4px" },
  row: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
});

/**
 * Pausing when something must be confirmed before the time is logged: the reason ("Pausar com
 * motivo…"), the end of a forgotten timer, or how much is left when the Remaining would be zeroed.
 */
export function PauseDialog({ request, onDone }: { request: PauseRequest; onDone: (r?: PauseResult) => void }) {
  const st = useStyles();
  const { task, settings, draft: initial } = request;
  const open = initial.segments.at(-1)!;
  const openDate = toLocalDate(open.start);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [reason, setReason] = useState<ReasonValue>(NO_REASON);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // A forgotten timer ends when the user says: its last segment stops at that time, on the day it started.
  const segments = useMemo(
    () => (request.askEnd ? [...initial.segments.slice(0, -1), { start: open.start, end: combineLocal(openDate, endTime) }] : initial.segments),
    [request.askEnd, initial.segments, open.start, openDate, endTime],
  );
  const minutes = Math.max(1, Math.round(segmentsMs(segments) / 60_000));
  const hours = minutesToHours(minutes);
  const endError = request.askEnd && minutesBetweenTimes(toLocalTime(open.start), endTime) <= 0 ? "O fim deve ser depois do início" : null;

  const askEstimate = needsEstimate(task);
  const left = askEstimate ? (estimate ? applyCreate(task, hours, minutesToHours(estimate)).remaining : null) : applyCreate(task, hours).remaining;
  const askRemaining = left !== null && left <= 0;

  const problems = [
    endError,
    askEstimate && !estimate && "Informe a estimativa da task",
    askRemaining && !remaining && "Informe quanto ainda falta, ou conclua a task",
    request.withReason && reasonProblem(reason, true),
  ].filter(Boolean) as string[];

  // Empty required fields only disable Pausar; the bar shows what the user typed wrong.
  const shownError = endError ?? (request.withReason && reason.choice ? reasonProblem(reason, true) : null);

  const submit = () =>
    onDone({
      draft: { ...initial, segments, minutes, endTime: toLocalTime(segments.at(-1)!.end) },
      estimate: askEstimate && estimate ? minutesToHours(estimate) : undefined,
      remaining: askRemaining && remaining ? minutesToHours(remaining) : undefined,
      ...(request.withReason ? reasonResult(reason) : {}),
    });

  return (
    <DialogShell okText="Pausar" okIcon={<PauseRegular />} okDisabled={problems.length > 0} onOk={submit} onCancel={() => onDone()} error={shownError}>
      <div className={st.task}>
        <Text weight="semibold">
          #{task.id} {task.title}
        </Text>
        <Caption1>
          Apontar {formatMinutes(minutes)} ({segments.map((s) => `${toLocalTime(s.start)}–${toLocalTime(s.end)}`).join(" · ")}) · Restante agora {formatHours(task.remaining)}
        </Caption1>
      </div>

      {request.askEnd && (
        <>
          <MessageBar intent="warning">
            <MessageBarBody>
              O timer está rodando desde {formatDateBr(openDate)} às {toLocalTime(open.start)}. Até que horas você trabalhou nesta task?
            </MessageBarBody>
          </MessageBar>
          <Field label={`Até (${formatDateBr(openDate)})`} validationState={endError ? "error" : "none"}>
            <EndTimeInput start={toLocalTime(open.start)} value={endTime} onChange={setEndTime} />
          </Field>
        </>
      )}

      {request.withReason && <ReasonField settings={settings} kind="pause" label="Motivo (vai para a discussão da task)" value={reason} onChange={setReason} />}

      {askEstimate && (
        <div style={{ width: 180 }}>
          <DurationInput label="Estimativa da task" required minutes={estimate} onChange={setEstimate} hint="Task sem estimativa" />
        </div>
      )}
      {askRemaining && (
        <>
          <MessageBar intent="info">
            <MessageBarBody>Com este apontamento o Remaining zera. Se a task ainda não terminou, informe quanto falta de verdade.</MessageBarBody>
          </MessageBar>
          <div className={st.row}>
            <div style={{ width: 200 }}>
              <DurationInput label="Quanto ainda falta nesta task?" required minutes={remaining} onChange={setRemaining} />
            </div>
            <Button icon={<CheckmarkRegular />} onClick={() => onDone({ conclude: true })}>
              Na verdade terminei: Concluir
            </Button>
          </div>
        </>
      )}
    </DialogShell>
  );
}
