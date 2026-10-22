import { Dropdown, Option, makeStyles, tokens } from "@fluentui/react-components";
import { plainOptions, withSavedOptions, type PickOption } from "../common/domain/options";

const useStyles = makeStyles({
  dropdown: { width: "100%", minWidth: 0 },
  missing: { color: tokens.colorPaletteRedForeground1 },
});

const NONE = "__none";

/**
 * Dropdowns fed by Azure DevOps (types, states, picklists, people). `options` null = still loading:
 * the saved values are shown as they are until the list arrives. Saved values that ADO did not
 * return stay listed (marked) so they are never dropped without the user noticing.
 */
export function Picker({ options, value, onChange, allowEmpty, emptyText = "(nenhum)", placeholder, size, ariaLabel }: {
  options: PickOption[] | null;
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyText?: string;
  placeholder?: string;
  size?: "small" | "medium";
  ariaLabel?: string;
}) {
  const st = useStyles();
  const saved = value ? [value] : [];
  const list = options ? withSavedOptions(options, saved) : plainOptions(saved);
  const current = list.find((o) => o.value === value);
  return (
    <Dropdown
      className={st.dropdown}
      size={size}
      aria-label={ariaLabel}
      placeholder={options ? placeholder : "Carregando…"}
      value={current ? (current.short ?? current.label) : value ? value : allowEmpty ? emptyText : ""}
      selectedOptions={[value || NONE]}
      onOptionSelect={(_, d) => onChange(d.optionValue === NONE || !d.optionValue ? "" : d.optionValue)}
    >
      {allowEmpty && (
        <Option value={NONE} text={emptyText}>
          {emptyText}
        </Option>
      )}
      {list.map((o) => (
        <Option key={o.value} value={o.value} text={o.short ?? o.label} className={o.missing ? st.missing : undefined}>
          {o.label}
        </Option>
      ))}
    </Dropdown>
  );
}

export function MultiPicker({ options, values, onChange, keyOf = (v) => v, placeholder = "Nenhum selecionado", ariaLabel }: {
  options: PickOption[] | null;
  values: string[];
  onChange: (v: string[]) => void;
  /** Normalizes values for comparison (e.g. lowercase e-mails). */
  keyOf?: (v: string) => string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const st = useStyles();
  const list = options ? withSavedOptions(options, values, keyOf) : plainOptions(values);
  // Saved values are matched to the option that represents them (case-insensitive e-mails).
  const byKey = new Map(list.map((o) => [keyOf(o.value), o]));
  const selected = values.map((v) => byKey.get(keyOf(v))?.value ?? v);
  const text = selected.map((v) => {
    const o = byKey.get(keyOf(v));
    return o ? (o.short ?? o.label) : v;
  });
  return (
    <Dropdown
      className={st.dropdown}
      multiselect
      aria-label={ariaLabel}
      placeholder={options ? placeholder : "Carregando…"}
      value={text.join(", ")}
      selectedOptions={selected}
      onOptionSelect={(_, d) => onChange(d.selectedOptions)}
    >
      {list.map((o) => (
        <Option key={o.value} value={o.value} text={o.short ?? o.label} className={o.missing ? st.missing : undefined}>
          {o.label}
        </Option>
      ))}
    </Dropdown>
  );
}
