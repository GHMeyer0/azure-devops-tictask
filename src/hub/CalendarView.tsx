import { Button, Caption1, Dropdown, Field, Option, Spinner, Text, makeStyles, tokens } from "@fluentui/react-components";
import { CopyRegular, DeleteRegular, DismissRegular, EditRegular, OpenRegular } from "@fluentui/react-icons";
import type { DateSelectArg, EventChangeArg, EventClickArg, EventInput } from "@fullcalendar/core";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useMemo, useState } from "react";
import { canEdit, deleteEntry, draftOf, editEntry, logTime, updateEntry, type Ctx } from "../common/actions";
import { listByRange } from "../common/data/entriesRepo";
import { sum } from "../common/domain/aggregate";
import { findActivity } from "../common/domain/settings";
import { addDays, formatMinutes, toLocalDate, toLocalTime } from "../common/domain/time";
import type { TimeEntry } from "../common/domain/types";
import { ErrorBar, openWorkItem } from "../common/ui/components";
import { errorMessage, useRunner, useTimer, useTrackerEvents } from "../common/ui/hooks";
import { getWorkItem } from "../common/wit/witService";

const useStyles = makeStyles({
  toolbar: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "8px" },
  selected: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
    padding: "6px 12px",
    marginBottom: "8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  calendar: {
    "--fc-border-color": tokens.colorNeutralStroke2,
    "--fc-page-bg-color": "transparent",
    "--fc-neutral-bg-color": tokens.colorNeutralBackground3,
    "--fc-today-bg-color": tokens.colorBrandBackground2,
    "--fc-now-indicator-color": tokens.colorPaletteRedBorder2,
    color: tokens.colorNeutralForeground1,
    "& .fc-event": { cursor: "pointer", fontSize: tokens.fontSizeBase200 },
    "& .tt-selected": { boxShadow: `0 0 0 2px ${tokens.colorNeutralForeground1}` },
    "& .tt-timer": { opacity: 0.75, backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,.25) 6px, rgba(255,255,255,.25) 12px)" },
  } as never,
});

/** Week calendar (like the 7pace calendar): select a range to log, drag/resize to edit, duplicate. */
export function CalendarView({ ctx, manager }: { ctx: Ctx; manager: boolean }) {
  const st = useStyles();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [userId, setUserId] = useState(ctx.user.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { timer, elapsedMs } = useTimer();
  const { busy, error, run } = useRunner();

  useEffect(() => {
    if (!range) return;
    listByRange(ctx.projectId, range.from, range.to)
      .then(setEntries)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [ctx.projectId, range, version]);
  useTrackerEvents(null, () => setVersion((v) => v + 1));

  const users = useMemo(() => {
    const map = new Map<string, string>([[ctx.user.id, `${ctx.user.displayName} (eu)`]]);
    (entries ?? []).forEach((e) => map.has(e.userId) || map.set(e.userId, e.userName));
    return [...map.entries()];
  }, [entries, ctx.user]);

  const mine = userId === ctx.user.id;
  const visible = useMemo(() => (entries ?? []).filter((e) => e.userId === userId), [entries, userId]);
  const selected = visible.find((e) => e.id === selectedId) ?? null;

  const events: EventInput[] = useMemo(() => {
    const list: EventInput[] = visible.flatMap((e) => {
      const color = findActivity(ctx.settings, e.activity)?.color ?? tokens.colorBrandBackground;
      const single = e.segments.length <= 1;
      const segments = e.segments.length ? e.segments : [{ start: e.start, end: e.end }];
      return segments.map((s, i) => ({
        id: `${e.id}#${i}`,
        title: `#${e.workItemId} ${e.workItemTitle} · ${e.activity}${single ? "" : ` (${i + 1}/${segments.length})`}`,
        start: s.start,
        end: s.end,
        backgroundColor: color,
        borderColor: color,
        // Entries with pauses are edited in the dialog, not by dragging one of their pieces.
        editable: mine && single && canEdit(ctx, e),
        classNames: e.id === selectedId ? ["tt-selected"] : [],
        extendedProps: { entryId: e.id },
      }));
    });
    if (mine && timer) {
      const now = new Date().toISOString();
      timer.segments.forEach((s, i) =>
        list.push({
          id: `timer#${i}`,
          title: `⏱ #${timer.workItem.id} ${timer.workItem.title} · ${formatMinutes(Math.round(elapsedMs / 60000))}`,
          start: s.start,
          end: s.end ?? now,
          editable: false,
          classNames: ["tt-timer"],
          backgroundColor: tokens.colorNeutralForeground3,
          borderColor: tokens.colorNeutralForeground3,
        }),
      );
    }
    return list;
    // elapsedMs is rounded to minutes so the calendar does not re-render every second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedId, mine, timer, Math.round(elapsedMs / 60000), ctx]);

  const onSelect = (arg: DateSelectArg) => {
    arg.view.calendar.unselect();
    if (!mine) return;
    const minutes = Math.round((arg.end.getTime() - arg.start.getTime()) / 60000);
    if (toLocalDate(arg.start) !== toLocalDate(new Date(arg.end.getTime() - 1))) return;
    void run(() => logTime(ctx, null, { date: toLocalDate(arg.start), startTime: toLocalTime(arg.start.toISOString()), endTime: toLocalTime(arg.end.toISOString()), minutes, segments: [] }, "calendar"));
  };

  const onChange = (arg: EventChangeArg) => {
    const entry = visible.find((e) => e.id === arg.event.extendedProps.entryId);
    const start = arg.event.start;
    const end = arg.event.end;
    if (!entry || !start || !end || toLocalDate(start) !== toLocalDate(new Date(end.getTime() - 1))) return arg.revert();
    const draft = {
      ...draftOf(entry),
      date: toLocalDate(start),
      startTime: toLocalTime(start.toISOString()),
      endTime: toLocalTime(end.toISOString()),
      minutes: Math.round((end.getTime() - start.getTime()) / 60000),
      segments: [],
    };
    void run(async () => {
      try {
        await updateEntry(ctx, entry, draft);
      } catch (e) {
        arg.revert();
        throw e;
      }
    });
  };

  const onClick = (arg: EventClickArg) => {
    const id = arg.event.extendedProps.entryId as string | undefined;
    setSelectedId(id && id !== selectedId ? id : null);
  };

  const duplicate = (e: TimeEntry) =>
    run(async () => {
      const task = await getWorkItem(e.workItemId);
      await logTime(ctx, task, { ...draftOf(e), segments: [], date: e.date }, "calendar");
    });

  const weekTotal = sum(visible.map((e) => e.minutes));

  return (
    <div>
      <div className={st.toolbar}>
        {manager && (
          <Field label="Calendário de">
            <Dropdown value={users.find(([id]) => id === userId)?.[1] ?? ""} selectedOptions={[userId]} onOptionSelect={(_, d) => d.optionValue && (setUserId(d.optionValue), setSelectedId(null))}>
              {users.map(([id, name]) => (
                <Option key={id} value={id}>
                  {name}
                </Option>
              ))}
            </Dropdown>
          </Field>
        )}
        <Text>
          Total no período: <b>{formatMinutes(weekTotal)}</b>
        </Text>
        <Caption1 className={st.muted}>{mine ? "Arraste no calendário para apontar; arraste/redimensione um bloco para corrigir; clique para editar, duplicar ou excluir." : "Somente leitura."}</Caption1>
        {(busy || (range && entries === null)) && <Spinner size="tiny" />}
      </div>

      {selected && (
        <div className={st.selected}>
          <Text weight="semibold">
            #{selected.workItemId} {selected.workItemTitle}
          </Text>
          <Text size={200}>
            {selected.date.split("-").reverse().join("/")} · {toLocalTime(selected.start)}–{toLocalTime(selected.end)} · {formatMinutes(selected.minutes)} · {selected.activity}
            {selected.comment ? ` · ${selected.comment}` : ""}
          </Text>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <Button size="small" icon={<OpenRegular />} onClick={() => openWorkItem(selected.workItemId)}>
              Abrir task
            </Button>
            {mine && canEdit(ctx, selected) && (
              <>
                <Button size="small" icon={<EditRegular />} onClick={() => run(() => editEntry(ctx, selected))}>
                  Editar
                </Button>
                <Button size="small" icon={<DeleteRegular />} onClick={() => run(async () => (await deleteEntry(ctx, selected)) && setSelectedId(null))}>
                  Excluir
                </Button>
              </>
            )}
            {mine && (
              <Button size="small" icon={<CopyRegular />} onClick={() => duplicate(selected)}>
                Duplicar
              </Button>
            )}
            <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => setSelectedId(null)} aria-label="Fechar" />
          </div>
        </div>
      )}

      <ErrorBar error={loadError ?? error} />
      <div className={st.calendar}>
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale={ptBrLocale}
          firstDay={1}
          headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,timeGridDay" }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          scrollTime="08:00:00"
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          snapDuration="00:05:00"
          allDaySlot={false}
          nowIndicator
          height="auto"
          selectable={mine}
          selectMirror
          editable={mine}
          eventOverlap
          events={events}
          datesSet={(arg) => setRange({ from: toLocalDate(arg.start), to: addDays(toLocalDate(arg.end), -1) })}
          select={onSelect}
          eventDrop={onChange}
          eventResize={onChange}
          eventClick={onClick}
        />
      </div>
    </div>
  );
}
