import { Body1Strong, Caption1, Card, CardHeader, Dropdown, Option, Subtitle2, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";

// Settings layout following the Fluent "settings page" pattern: cards that group related options,
// one row per option with the label and an explanation on the left and the control on the right.

const useStyles = makeStyles({
  card: { padding: "16px 20px", gap: "4px" },
  rows: { display: "flex", flexDirection: "column" },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 360px)",
    gap: "8px 32px",
    alignItems: "center",
    padding: "12px 0",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    "@media (max-width: 760px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  rowFirst: { borderTop: "none" },
  wide: { gridTemplateColumns: "minmax(0, 1fr)" },
  text: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 },
  muted: { color: tokens.colorNeutralForeground3 },
  control: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", minWidth: 0, "& > *": { minWidth: 0 } },
  time: { minWidth: 0, width: "110px" },
});

export function SettingsCard({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  const st = useStyles();
  return (
    <Card className={st.card}>
      <CardHeader header={<Subtitle2>{title}</Subtitle2>} description={description ? <Caption1 className={st.muted}>{description}</Caption1> : undefined} action={action as React.ReactElement | undefined} />
      <div className={st.rows}>{children}</div>
    </Card>
  );
}

/** One option: label + explanation, control on the right (stacked on narrow screens or when `wide`). */
export function SettingRow({ label, description, children, first, wide }: { label: string; description?: React.ReactNode; children: React.ReactNode; first?: boolean; wide?: boolean }) {
  const st = useStyles();
  return (
    <div className={mergeClasses(st.row, first && st.rowFirst, wide && st.wide)}>
      <div className={st.text}>
        <Body1Strong>{label}</Body1Strong>
        {description && <Caption1 className={st.muted}>{description}</Caption1>}
      </div>
      <div className={st.control}>{children}</div>
    </div>
  );
}

const TIMES = Array.from({ length: (22 - 6) * 2 + 1 }, (_, i) => {
  const m = 6 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

/** 24h time in 30-minute steps (the native time input follows the browser locale and shows AM/PM). */
export function TimeSelect({ value, onChange, disabled, ariaLabel }: { value: string; onChange: (v: string) => void; disabled?: boolean; ariaLabel: string }) {
  const st = useStyles();
  const list = TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <Dropdown className={st.time} aria-label={ariaLabel} disabled={disabled} value={value} selectedOptions={[value]} onOptionSelect={(_, d) => d.optionValue && onChange(d.optionValue)}>
      {list.map((t) => (
        <Option key={t} value={t}>
          {t}
        </Option>
      ))}
    </Dropdown>
  );
}
