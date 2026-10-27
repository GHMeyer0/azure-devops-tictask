import { describe, expect, it } from "vitest";
import { combineLocal } from "../src/common/domain/time";
import { parseCsv, parseTimeLogCsv, summarizeTimeLog, timeLogToEntries } from "../src/common/domain/timelogImport";

// Same layout as the CSV of Time Log Admin › "Download all logs as CSV" (names are made up).
const CSV = [
  "id,minutes,user,userId,workItemId,date,dateWeek,type,comment",
  '"a1",300,"Ana Lima",u-ana,5323,"2022-12-22","2022-W51","Desenvolvimento","Dashboard geral"',
  '"a2",90,"Ana Lima",u-ana,5323,"2022-12-22","2022-W51","reunião","Alinhamento, com ""cliente"""',
  '"b1",60,"Rui Costa",u-rui,4024,"2021-07-22","2021-W29","Suporte",""',
  '"b2",2880,"Rui Costa",u-rui,5509,"2023-07-27","2023-W30","Desenvolvimento","2 dias"',
  "",
].join("\r\n");

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, commas inside quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("reads the Time Log export", () => {
    const parsed = parseTimeLogCsv(CSV);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[1]).toEqual({ id: "a2", minutes: 90, user: "Ana Lima", userId: "u-ana", workItemId: 5323, date: "2022-12-22", type: "reunião", comment: 'Alinhamento, com "cliente"' });
  });

  it("refuses other files and bad rows", () => {
    expect(parseTimeLogCsv("Data;Horas\n2026-10-01;2")).toEqual({ ok: false, error: expect.stringContaining("não é o CSV do Time Log") });
    expect(parseTimeLogCsv(CSV.replace('"b1",60', '"b1",abc'))).toEqual({ ok: false, error: expect.stringContaining("Linha 4: minutos inválidos") });
  });
});

describe("Time Log import", () => {
  const rows = (() => {
    const parsed = parseTimeLogCsv(CSV);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.rows;
  })();

  it("summarizes people, period, types and entries longer than a day", () => {
    const s = summarizeTimeLog(rows);
    expect(s).toMatchObject({ rows: 4, minutes: 3330, from: "2021-07-22", to: "2023-07-27", workItems: 3, overADay: 1 });
    expect(s.people.map((p) => [p.name, p.minutes])).toEqual([
      ["Rui Costa", 2940],
      ["Ana Lima", 390],
    ]);
    expect(s.types).toEqual(["Desenvolvimento", "reunião", "Suporte"]);
  });

  it("lays the entries of a person's day one after the other from 08:00, with stable ids", () => {
    const entries = timeLogToEntries(rows, {
      projectId: "p",
      by: { id: "me", displayName: "Eu" },
      at: "2026-10-27T12:00:00.000Z",
      activities: ["Desenvolvimento", "Reunião"],
      workItems: new Map([[5323, { title: "Painel de indicadores", type: "Task", parentId: 5300, parentTitle: "BI" }]]),
      emails: new Map([["u-ana", "ana@x.com"]]),
    });
    const [first, second, other] = entries;
    expect(first).toMatchObject({ id: "timelog-a1", start: combineLocal("2022-12-22", "08:00"), end: combineLocal("2022-12-22", "13:00"), minutes: 300, userEmail: "ana@x.com", workItemTitle: "Painel de indicadores", parentId: 5300 });
    expect(second).toMatchObject({ start: combineLocal("2022-12-22", "13:00"), end: combineLocal("2022-12-22", "14:30"), activity: "Reunião" }); // matched ignoring case
    expect(other).toMatchObject({ activity: "Suporte", userEmail: "", workItemTitle: "Work item #4024", start: combineLocal("2021-07-22", "08:00") });
    expect(other.parentId).toBeUndefined();
    expect(first.history[0]).toMatchObject({ action: "import", by: "Eu" });
  });
});
