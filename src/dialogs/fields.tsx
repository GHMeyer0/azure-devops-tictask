import { Dropdown, Field, Input, Option, Radio, RadioGroup, makeStyles } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { reasonsOf } from "../common/domain/settings";
import { formatMinutes, parseDuration } from "../common/domain/time";
import type { ReasonDef, Settings } from "../common/domain/types";

const useStyles = makeStyles({
  // Two columns: the reasons are short and a single column made the 480px dialog too tall.
  reasons: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "8px" },
});

export function ActivityField({ settings, value, onChange, label = "Atividade" }: { settings: Settings; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label} required>
      <Dropdown value={value} selectedOptions={[value]} onOptionSelect={(_, d) => d.optionValue && onChange(d.optionValue)} style={{ minWidth: 0, width: "100%" }}>
        {settings.activities.map((a) => (
          <Option key={a.name} value={a.name} text={a.name}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: a.color, marginRight: 8 }} />
            {a.name}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}

/**
 * Hours typed as "1h30", "1,5", "90m"… Keeps its own text while typing and reports minutes
 * (null when invalid/empty).
 */
export function DurationInput({ label, minutes, onChange, required, hint, disabled }: {
  label: string;
  minutes: number | null;
  onChange: (minutes: number | null) => void;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(minutes === null ? "" : formatMinutes(minutes));
  useEffect(() => {
    // Sync when the value changes from outside (e.g. From/To edited), unless it already matches.
    if (minutes === null ? text !== "" && parseDuration(text) !== null : parseDuration(text) !== minutes) {
      setText(minutes === null ? "" : formatMinutes(minutes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes]);
  const invalid = text.trim() !== "" && parseDuration(text) === null;
  return (
    <Field label={label} required={required} validationState={invalid ? "error" : "none"} validationMessage={invalid ? "Use 1h30, 1,5 ou 90m" : undefined} hint={hint}>
      <Input
        value={text}
        disabled={disabled}
        placeholder="1h30"
        onChange={(_, d) => {
          setText(d.value);
          onChange(d.value.trim() === "" ? null : parseDuration(d.value));
        }}
      />
    </Field>
  );
}

/** "Outro…": no configured reason, only the typed text. */
const OTHER = "__other__";

/** Reason chosen in the dialog: a configured name, OTHER, or "" (none, when optional). */
export interface ReasonValue {
  choice: string;
  detail: string;
}

export const NO_REASON: ReasonValue = { choice: "", detail: "" };

export function reasonResult(v: ReasonValue): { reason?: string; reasonDetail?: string } {
  const detail = v.detail.trim();
  if (!v.choice) return {};
  if (v.choice === OTHER) return detail ? { reasonDetail: detail } : {};
  return detail ? { reason: v.choice, reasonDetail: detail } : { reason: v.choice };
}

export function reasonProblem(v: ReasonValue, required: boolean): string | null {
  if (required && !v.choice) return "Escolha o motivo";
  if (v.choice === OTHER && !v.detail.trim()) return "Descreva o motivo";
  return null;
}

/** Pause reasons ("Aguardando revisão") or next steps when concluding ("Enviado para revisão"), plus a detail. */
export function ReasonField({ settings, kind, label, value, onChange, optional }: {
  settings: Settings;
  kind: ReasonDef["kind"];
  label: string;
  value: ReasonValue;
  onChange: (v: ReasonValue) => void;
  optional?: boolean;
}) {
  const st = useStyles();
  const chosen = settings.states.reasons.find((r) => r.kind === kind && r.name === value.choice);
  return (
    <>
      <Field label={label} required={!optional} hint={chosen?.commentOnParent ? "Também vai para a discussão da US/Bug." : undefined}>
        <RadioGroup className={st.reasons} value={value.choice} onChange={(_, d) => onChange({ ...value, choice: d.value })}>
          {optional && <Radio value="" label="Nenhum" />}
          {reasonsOf(settings, kind).map((r) => (
            <Radio key={r.name} value={r.name} label={r.name} />
          ))}
          <Radio value={OTHER} label="Outro…" />
        </RadioGroup>
      </Field>
      {value.choice && (
        <Field label={value.choice === OTHER ? "Descreva" : "Detalhe"} required={value.choice === OTHER}>
          <Input value={value.detail} onChange={(_, d) => onChange({ ...value, detail: d.value })} placeholder="Ex.: PR !1234 do João" />
        </Field>
      )}
    </>
  );
}
