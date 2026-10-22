import { Button, Caption1, Checkbox, Field, Input, Spinner, Switch, makeStyles, tokens } from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import type { Ctx } from "../common/actions";
import { loadPeople, type Person } from "../common/data/people";
import type { ChatSettings } from "../common/domain/types";
import { Section } from "../common/ui/components";

const useStyles = makeStyles({
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px 24px" },
  people: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "0 16px",
    maxHeight: "260px",
    overflowY: "auto",
    padding: "4px 8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
});

/**
 * Settings read by the n8n workflows (TT · LIB · Ler TicTask): who gets the hourly "sem apontamento"
 * reminder in Google Chat, working hours and the "O que fiz ontem" section of the morning summary.
 */
export function ChatSection({ ctx, value, onChange }: { ctx: Ctx; value: ChatSettings; onChange: (v: ChatSettings) => void }) {
  const st = useStyles();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [extra, setExtra] = useState("");
  const set = (patch: Partial<ChatSettings>) => onChange({ ...value, ...patch });
  const selected = useMemo(() => new Set(value.recipients.map((e) => e.toLowerCase())), [value.recipients]);

  useEffect(() => {
    loadPeople(ctx.projectId).then(setPeople).catch(() => setPeople([]));
  }, [ctx.projectId]);

  const toggle = (email: string, on: boolean) => set({ recipients: on ? [...value.recipients, email] : value.recipients.filter((e) => e.toLowerCase() !== email) });
  const outside = value.recipients.filter((e) => !people?.some((p) => p.email === e.toLowerCase()));

  return (
    <Section title="Google Chat">
      <Caption1 className={st.muted}>
        Lidas pelos workflows do n8n que enviam mensagens pelo app do Google Chat. Só recebe quem também tem conversa (DM) com o app.
      </Caption1>

      <Switch label="Lembrar quem ficou 1h sem apontamento (dias úteis)" checked={value.remindersEnabled} onChange={(_, d) => set({ remindersEnabled: d.checked })} />
      <div className={st.grid}>
        <Field label="Início do expediente">
          <Input type="time" value={value.workStart} onChange={(_, d) => set({ workStart: d.value })} />
        </Field>
        <Field label="Fim do expediente">
          <Input type="time" value={value.workEnd} onChange={(_, d) => set({ workEnd: d.value })} />
        </Field>
        <Field label="Almoço de">
          <Input type="time" value={value.lunchStart} onChange={(_, d) => set({ lunchStart: d.value })} />
        </Field>
        <Field label="Almoço até">
          <Input type="time" value={value.lunchEnd} onChange={(_, d) => set({ lunchEnd: d.value })} />
        </Field>
        <Field label="Lembretes por dia (máx.)" hint="O total do fim do dia sai sempre">
          <Input type="number" min={0} max={9} value={String(value.maxRemindersPerDay)} onChange={(_, d) => set({ maxRemindersPerDay: Math.max(0, Number(d.value) || 0) })} />
        </Field>
      </div>

      <Field label={`Quem recebe os lembretes (${value.recipients.length})`}>
        {people === null ? (
          <Spinner size="tiny" />
        ) : (
          <>
            <div className={st.row} style={{ marginBottom: 4 }}>
              <Button size="small" appearance="subtle" onClick={() => set({ recipients: [...new Set([...value.recipients, ...people.map((p) => p.email)])] })}>
                Marcar todos
              </Button>
              <Button size="small" appearance="subtle" onClick={() => set({ recipients: outside })}>
                Desmarcar todos
              </Button>
            </div>
            <div className={st.people}>
              {people.map((p) => (
                <Checkbox key={p.email} checked={selected.has(p.email)} onChange={(_, d) => toggle(p.email, !!d.checked)} label={`${p.name} (${p.email})`} />
              ))}
            </div>
          </>
        )}
      </Field>
      {outside.length > 0 && (
        <Caption1>
          Fora dos times: {outside.join(", ")}{" "}
          <Button size="small" appearance="transparent" onClick={() => set({ recipients: value.recipients.filter((e) => !outside.includes(e)) })}>
            remover
          </Button>
        </Caption1>
      )}
      <div className={st.row}>
        <Input size="small" placeholder="outro e-mail" value={extra} onChange={(_, d) => setExtra(d.value)} />
        <Button
          size="small"
          disabled={!extra.includes("@")}
          onClick={() => {
            set({ recipients: [...new Set([...value.recipients, extra.trim().toLowerCase()])] });
            setExtra("");
          }}
        >
          Adicionar
        </Button>
      </div>

      <Switch label='Incluir "O que fiz ontem" (apontamentos do dia útil anterior) no resumo da manhã' checked={value.yesterdayInDaily} onChange={(_, d) => set({ yesterdayInDaily: d.checked })} />
    </Section>
  );
}
