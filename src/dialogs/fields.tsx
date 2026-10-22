import { Dropdown, Field, Input, Option } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { formatMinutes, parseDuration } from "../common/domain/time";
import type { Settings } from "../common/domain/types";

export function ActivityField({ settings, value, onChange, label = "Atividade" }: { settings: Settings; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label} required>
      <Dropdown value={value} selectedOptions={[value]} onOptionSelect={(_, d) => d.optionValue && onChange(d.optionValue)}>
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
