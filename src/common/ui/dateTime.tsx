import { DatePicker, defaultDatePickerStrings, type DatePickerProps } from "@fluentui/react-datepicker-compat";
import { TimePicker } from "@fluentui/react-timepicker-compat";
import { useEffect, useState } from "react";
import { formatDateBr, pad2, parseLocalDate, toLocalDate } from "../domain/time";

// Fluent date/time pickers instead of the browser's native inputs, with the values kept as the
// strings the rest of the code uses ("yyyy-MM-dd" and "HH:mm").

const PT_STRINGS: DatePickerProps["strings"] = {
  ...defaultDatePickerStrings,
  months: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
  shortMonths: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  days: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  shortDays: ["D", "S", "T", "Q", "Q", "S", "S"],
  goToToday: "Hoje",
  prevMonthAriaLabel: "Mês anterior",
  nextMonthAriaLabel: "Próximo mês",
  prevYearAriaLabel: "Ano anterior",
  nextYearAriaLabel: "Próximo ano",
  closeButtonAriaLabel: "Fechar",
  isRequiredErrorMessage: "Informe a data",
  invalidInputErrorMessage: "Data inválida (use dd/mm/aaaa)",
} as DatePickerProps["strings"];

const MONDAY = 1 as NonNullable<DatePickerProps["firstDayOfWeek"]>;

/** "23/10/2026", "23/10" (current year) or "23-10-26" → Date; null when it is not a valid day. */
export function parseDateBr(text: string, today = new Date()): Date | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text.trim());
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** "HH:mm" of a Date. */
export const timeOf = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export function DateInput({ value, onChange, ariaLabel, className, minDate }: {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  minDate?: string;
}) {
  return (
    <DatePicker
      className={className}
      aria-label={ariaLabel}
      value={value ? parseLocalDate(value) : null}
      onSelectDate={(d) => d && onChange(toLocalDate(d))}
      formatDate={(d) => (d ? formatDateBr(toLocalDate(d)) : "")}
      parseDateFromString={(s) => parseDateBr(s)}
      allowTextInput
      firstDayOfWeek={MONDAY}
      strings={PT_STRINGS}
      minDate={minDate ? parseLocalDate(minDate) : undefined}
      placeholder="dd/mm/aaaa"
    />
  );
}

/**
 * Time "HH:mm" typed freely or picked from a list every 15 minutes (24h). The text follows
 * `value` when it changes from outside (e.g. the end recalculated from the duration).
 */
export function TimeInput({ date, value, onChange, disabled, ariaLabel }: {
  date: string; // yyyy-MM-dd, anchors the options
  value: string; // HH:mm
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const anchor = parseLocalDate(date || toLocalDate(new Date()));
  const selected = /^\d{2}:\d{2}$/.test(value) ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), Number(value.slice(0, 2)), Number(value.slice(3))) : null;
  return (
    <TimePicker
      freeform
      hourCycle="h23"
      increment={15}
      // Working hours in the list (any time can still be typed), opening right below the field:
      // the dialog is a narrow iframe and the full-day list covered it.
      startHour={6}
      endHour={23}
      positioning="below-start"
      listbox={{ style: { maxHeight: "220px" } }}
      input={{ style: { minWidth: 0, width: "100%" } }}
      dateAnchor={anchor}
      selectedTime={selected}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      formatDateToTimeString={timeOf}
      onInput={(e) => setText((e.target as HTMLInputElement).value)}
      onTimeChange={(_, d) => {
        if (!d.selectedTime) return;
        const t = timeOf(d.selectedTime);
        setText(t);
        onChange(t);
      }}
      style={{ minWidth: 0, width: 120 }}
    />
  );
}
