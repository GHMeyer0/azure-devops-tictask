import { Badge, Button, Caption1, Checkbox, Input, Link, MessageBar, MessageBarBody, MessageBarTitle, SpinButton, Spinner, Switch, Text, makeStyles, tokens } from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import type { Ctx } from "../../common/actions";
import { loadPeople, type Person } from "../../common/data/people";
import type { ChatSettings } from "../../common/domain/types";
import { SettingRow, SettingsCard, TimeSelect } from "./layout";

const useStyles = makeStyles({
  how: { margin: "4px 0 8px" },
  howList: { margin: "4px 0 0", paddingLeft: "18px" },
  toolbar: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", padding: "8px 0" },
  search: { flexGrow: 1, minWidth: "200px", maxWidth: "360px" },
  people: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
    gap: "4px 16px",
    maxHeight: "300px",
    overflowY: "auto",
    padding: "8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  person: { display: "flex", flexDirection: "column", lineHeight: tokens.lineHeightBase200 },
  muted: { color: tokens.colorNeutralForeground3 },
  sep: { color: tokens.colorNeutralForeground3 },
});

/**
 * Settings read by the n8n workflows (TT · LIB · Ler TicTask): the hourly "sem apontamento"
 * reminder in Google Chat and the "O que fiz ontem" section of the morning summary.
 */
export function ChatSettingsSection({ ctx, value, onChange }: { ctx: Ctx; value: ChatSettings; onChange: (v: ChatSettings) => void }) {
  const st = useStyles();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [filter, setFilter] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [extra, setExtra] = useState("");
  const set = (patch: Partial<ChatSettings>) => onChange({ ...value, ...patch });
  const selected = useMemo(() => new Set(value.recipients.map((e) => e.toLowerCase())), [value.recipients]);
  const off = !value.remindersEnabled;

  useEffect(() => {
    loadPeople(ctx.projectId).then(setPeople).catch(() => setPeople([]));
  }, [ctx.projectId]);

  const toggle = (email: string, on: boolean) => set({ recipients: on ? [...value.recipients, email] : value.recipients.filter((e) => e.toLowerCase() !== email) });
  const outside = value.recipients.filter((e) => !people?.some((p) => p.email === e.toLowerCase()));
  const q = filter.trim().toLowerCase();
  const shown = (people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q));

  return (
    <>
      <SettingsCard title="Lembrete de apontamento" description="Mensagem no Google Chat para quem passa uma hora do expediente sem apontar.">
        <SettingRow first label="Enviar lembretes" description="Dias úteis, enviado pelo app do Google Chat por DM.">
          <Switch checked={value.remindersEnabled} onChange={(_, d) => set({ remindersEnabled: d.checked })} label={value.remindersEnabled ? "Ligado" : "Desligado"} />
        </SettingRow>
        <MessageBar intent="info" layout="multiline" className={st.how}>
          <MessageBarBody>
            <MessageBarTitle>Como funciona</MessageBarTitle>
            <ul className={st.howList}>
              <li>A cada hora cheia, olha a hora que acabou (ex.: às 10h, a janela 9h–10h).</li>
              <li>Avisa quem não tem apontamento nessa janela e não está com timer rodando.</li>
              <li>Fora do expediente e em janelas que cruzam o almoço, não há lembrete.</li>
              <li>Cada pessoa recebe no máximo o limite diário; apontar depois não gera novo aviso da mesma hora.</li>
            </ul>
          </MessageBarBody>
        </MessageBar>
        <SettingRow label="Expediente" description="Primeiro lembrete 1h após o início; o último, no fim.">
          <TimeSelect ariaLabel="Início do expediente" disabled={off} value={value.workStart} onChange={(v) => set({ workStart: v })} />
          <span className={st.sep}>até</span>
          <TimeSelect ariaLabel="Fim do expediente" disabled={off} value={value.workEnd} onChange={(v) => set({ workEnd: v })} />
        </SettingRow>
        <SettingRow label="Almoço" description="Janelas que cruzam esse intervalo são ignoradas.">
          <TimeSelect ariaLabel="Início do almoço" disabled={off} value={value.lunchStart} onChange={(v) => set({ lunchStart: v })} />
          <span className={st.sep}>até</span>
          <TimeSelect ariaLabel="Fim do almoço" disabled={off} value={value.lunchEnd} onChange={(v) => set({ lunchEnd: v })} />
        </SettingRow>
        <SettingRow label="Máximo por dia" description="Lembretes por pessoa em um mesmo dia.">
          <SpinButton
            aria-label="Máximo de lembretes por dia"
            disabled={off}
            min={0}
            max={9}
            value={value.maxRemindersPerDay}
            onChange={(_, d) => set({ maxRemindersPerDay: Math.max(0, Math.min(9, d.value ?? (Number(d.displayValue) || 0))) })}
            style={{ width: 90 }}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="Quem recebe os lembretes"
        description="Membros dos times do projeto. Só recebe quem também tem conversa (DM) com o app no Google Chat."
        action={
          <Badge appearance="tint" color={value.recipients.length ? "brand" : "informative"} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {value.recipients.length} selecionado{value.recipients.length === 1 ? "" : "s"}
          </Badge>
        }
      >
        <div className={st.toolbar}>
          <Input className={st.search} contentBefore={<SearchRegular />} placeholder="Buscar por nome ou e-mail" value={filter} onChange={(_, d) => setFilter(d.value)} disabled={off} />
          <Button size="small" appearance="subtle" disabled={off || !people} onClick={() => set({ recipients: [...new Set([...value.recipients, ...shown.map((p) => p.email)])] })}>
            Marcar {q ? "filtrados" : "todos"}
          </Button>
          <Button size="small" appearance="subtle" disabled={off} onClick={() => set({ recipients: q ? value.recipients.filter((e) => !shown.some((p) => p.email === e.toLowerCase())) : outside })}>
            Desmarcar {q ? "filtrados" : "todos"}
          </Button>
        </div>
        {people === null ? (
          <Spinner size="tiny" />
        ) : (
          <div className={st.people}>
            {shown.map((p) => (
              <Checkbox
                key={p.email}
                disabled={off}
                checked={selected.has(p.email)}
                onChange={(_, d) => toggle(p.email, !!d.checked)}
                label={
                  <span className={st.person}>
                    <Text>{p.name}</Text>
                    <Caption1 className={st.muted}>{p.email}</Caption1>
                  </span>
                }
              />
            ))}
            {!shown.length && <Caption1 className={st.muted}>Ninguém encontrado.</Caption1>}
          </div>
        )}
        {outside.length > 0 && (
          <Caption1 style={{ paddingTop: 8 }}>
            Também recebem (fora dos times): {outside.join(", ")} ·{" "}
            <Link onClick={() => set({ recipients: value.recipients.filter((e) => !outside.includes(e)) })}>remover</Link>
          </Caption1>
        )}
        <div className={st.toolbar}>
          {extraOpen ? (
            <>
              <Input size="small" type="email" placeholder="email@empresa.com.br" value={extra} onChange={(_, d) => setExtra(d.value)} />
              <Button
                size="small"
                disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(extra.trim())}
                onClick={() => {
                  set({ recipients: [...new Set([...value.recipients, extra.trim().toLowerCase()])] });
                  setExtra("");
                  setExtraOpen(false);
                }}
              >
                Adicionar
              </Button>
              <Button size="small" appearance="subtle" onClick={() => setExtraOpen(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Link disabled={off} onClick={() => setExtraOpen(true)}>
              Adicionar e-mail de fora dos times
            </Link>
          )}
        </div>
      </SettingsCard>

      <SettingsCard title="Resumo da manhã" description="Enviado às 7h30 dos dias úteis, junto com WIs e PRs.">
        <SettingRow first label='Incluir "O que fiz ontem"' description="Apontamentos do dia útil anterior em árvore (item pai → tasks), para facilitar a daily. Gestores recebem o total por pessoa.">
          <Switch checked={value.yesterdayInDaily} onChange={(_, d) => set({ yesterdayInDaily: d.checked })} label={value.yesterdayInDaily ? "Ligado" : "Desligado"} />
        </SettingRow>
      </SettingsCard>
    </>
  );
}
