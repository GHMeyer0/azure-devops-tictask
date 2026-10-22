import { Spinner, Tab, TabList, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { CalendarLtrRegular, PeopleRegular, PersonClockRegular, SettingsRegular, TableRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { pauseTimer, resumeTimer, stopTimer, type Ctx } from "../common/actions";
import { ErrorBar, TimerControls } from "../common/ui/components";
import { useCtx, useRunner, useTimer } from "../common/ui/hooks";
import { PageCard } from "../common/ui/page";
import { TeamNow } from "../common/ui/TeamNow";
import { useIsManager } from "../common/data/roles";
import { CalendarView } from "./CalendarView";
import { MyTimeView } from "./MyTimeView";
import { SettingsView } from "./SettingsView";
import { TimesheetView } from "./TimesheetView";

const useStyles = makeStyles({
  root: { padding: "16px 24px 32px", display: "flex", flexDirection: "column", gap: "16px", minWidth: 0, color: tokens.colorNeutralForeground1, "@media (max-width: 600px)": { padding: "12px 12px 24px" } },
  // ADO hub header: title row (actions on the right), pivot tabs right below it.
  head: { display: "flex", flexDirection: "column", gap: "4px" },
  titleRow: { display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", minHeight: "36px" },
  tabs: { marginLeft: "-10px" },
  team: { maxWidth: "760px" },
  timer: { marginLeft: "auto", padding: "4px 12px", borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
});

type TabKey = "mytime" | "timesheet" | "calendar" | "team" | "settings";

function readTab(): TabKey {
  try {
    return (localStorage.getItem("tt-hub-tab") as TabKey) || "mytime";
  } catch {
    return "mytime";
  }
}

/**
 * Boards › TicTask. Everyone gets "Meu tempo", Timesheet and Calendário with their own hours only;
 * managers (team admins / Settings › Gestores) also see everyone's hours, "Time agora" and settings.
 */
export function HubView() {
  const st = useStyles();
  const { ctx: loaded, error } = useCtx();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [tab, setTab] = useState<TabKey>(readTab);
  const { timer, elapsedMs } = useTimer();
  const runner = useRunner();
  useEffect(() => setCtx(loaded), [loaded]);
  useEffect(() => {
    try {
      localStorage.setItem("tt-hub-tab", tab);
    } catch {
      /* storage unavailable */
    }
  }, [tab]);

  const manager = useIsManager(ctx);

  if (error) return <ErrorBar error={error} />;
  if (!ctx || manager === null) return <Spinner label="Carregando…" style={{ marginTop: 48 }} />;
  const current: TabKey = !manager && (tab === "team" || tab === "settings") ? "mytime" : tab;

  return (
    <div className={st.root}>
      <div className={st.head}>
        <div className={st.titleRow}>
          <Title3>TicTask</Title3>
          {/* "Meu tempo" has its own timer card. */}
          {timer && current !== "mytime" && (
            <div className={st.timer}>
              <TimerControls
                timer={timer}
                elapsedMs={elapsedMs}
                busy={runner.busy}
                showTarget
                onPause={() => runner.run(() => pauseTimer(ctx, timer))}
                onResume={() => runner.run(() => resumeTimer(ctx, timer))}
                onStop={() => runner.run(() => stopTimer(ctx, timer))}
              />
            </div>
          )}
        </div>
        <TabList className={st.tabs} selectedValue={current} onTabSelect={(_, d) => setTab(d.value as TabKey)}>
          <Tab value="mytime" icon={<PersonClockRegular />}>
            Meu tempo
          </Tab>
          <Tab value="timesheet" icon={<TableRegular />}>
            Timesheet
          </Tab>
          <Tab value="calendar" icon={<CalendarLtrRegular />}>
            Calendário
          </Tab>
          {manager && (
            <Tab value="team" icon={<PeopleRegular />}>
              Time agora
            </Tab>
          )}
          {manager && (
            <Tab value="settings" icon={<SettingsRegular />}>
              Configurações
            </Tab>
          )}
        </TabList>
      </div>
      <ErrorBar error={runner.error} />
      {current === "mytime" && <MyTimeView />}
      {current === "timesheet" && <TimesheetView ctx={ctx} manager={manager} />}
      {current === "calendar" && <CalendarView ctx={ctx} manager={manager} />}
      {current === "team" && (
        <PageCard title="Quem está com timer agora" description="Atualiza sozinho a cada 30 segundos. Timer aberto há mais de 10h aparece em vermelho." className={st.team}>
          <TeamNow ctx={ctx} />
        </PageCard>
      )}
      {current === "settings" && <SettingsView ctx={ctx} onSaved={(settings) => setCtx({ ...ctx, settings })} />}
    </div>
  );
}
