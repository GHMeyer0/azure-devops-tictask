import { Spinner, Tab, TabList, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { CalendarLtrRegular, PeopleRegular, SettingsRegular, TableRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { pauseTimer, resumeTimer, stopTimer, type Ctx } from "../common/actions";
import { ErrorBar, TimerControls } from "../common/ui/components";
import { useCtx, useRunner, useTimer } from "../common/ui/hooks";
import { TeamNow } from "../common/ui/TeamNow";
import { useIsManager } from "../common/data/roles";
import { CalendarView } from "./CalendarView";
import { SettingsView } from "./SettingsView";
import { TimesheetView } from "./TimesheetView";

const useStyles = makeStyles({
  root: { padding: "16px 24px 32px", display: "flex", flexDirection: "column", gap: "12px", color: tokens.colorNeutralForeground1 },
  header: { display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" },
  timer: { marginLeft: "auto", padding: "6px 12px", borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
});

type TabKey = "timesheet" | "calendar" | "team" | "settings";

function readTab(): TabKey {
  try {
    return (localStorage.getItem("tt-hub-tab") as TabKey) || "timesheet";
  } catch {
    return "timesheet";
  }
}

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
  // Team-wide tabs are for managers (team admins / Settings › Gestores) only.
  const current: TabKey = !manager && (tab === "team" || tab === "settings") ? "timesheet" : tab;

  return (
    <div className={st.root}>
      <div className={st.header}>
        <Title3>TicTask</Title3>
        <TabList selectedValue={current} onTabSelect={(_, d) => setTab(d.value as TabKey)}>
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
        {timer && (
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
      <ErrorBar error={runner.error} />
      {current === "timesheet" && <TimesheetView ctx={ctx} manager={manager} />}
      {current === "calendar" && <CalendarView ctx={ctx} manager={manager} />}
      {current === "team" && (
        <div style={{ maxWidth: 720 }}>
          <TeamNow ctx={ctx} />
        </div>
      )}
      {current === "settings" && <SettingsView ctx={ctx} onSaved={(settings) => setCtx({ ...ctx, settings })} />}
    </div>
  );
}
