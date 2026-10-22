import { Caption1, Checkbox, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { useState } from "react";
import type { StandardRequest, StandardResult } from "../common/dialogs";
import { guessActivity } from "../common/domain/settings";
import { formatMinutes, minutesToHours, parseDuration } from "../common/domain/time";
import { DialogShell } from "./DialogShell";

const useStyles = makeStyles({ muted: { color: tokens.colorNeutralForeground3 } });

interface Row {
  activity: string;
  checked: boolean;
  exists: boolean;
  title: string;
  estimate: string;
}

/** Creates the standard tasks (Investigação, Desenvolvimento/Correção, Revisão, Testes) under a US/Bug. */
export function StandardDialog({ request, onDone }: { request: StandardRequest; onDone: (r?: StandardResult) => void }) {
  const st = useStyles();
  const { settings, children } = request;
  const present = new Set(children.map((c) => guessActivity(settings, c.title, c.activity)));
  const [rows, setRows] = useState<Row[]>(() =>
    settings.activities
      .filter((a) => a.standard)
      .map((a) => ({ activity: a.name, checked: !present.has(a.name), exists: present.has(a.name), title: a.defaultTitle || a.name, estimate: formatMinutes(a.defaultEstimate * 60) })),
  );
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.checked);
  const invalid = chosen.some((r) => !r.title.trim() || (r.estimate.trim() !== "" && parseDuration(r.estimate) === null));

  const submit = () =>
    onDone({
      items: chosen.map((r) => {
        const m = parseDuration(r.estimate);
        return { activity: r.activity, description: r.title.trim(), estimate: m ? minutesToHours(m) : undefined };
      }),
    });

  return (
    <DialogShell okText={`Criar ${chosen.length} task${chosen.length === 1 ? "" : "s"}`} okIcon={<AddRegular />} okDisabled={!chosen.length || invalid} onOk={submit} onCancel={() => onDone()}>
      <Caption1 className={st.muted}>
        As tasks são criadas como filhas de #{request.parent.id}, na mesma área e iteração, atribuídas a você. Atividades que já têm task estão desmarcadas.
      </Caption1>
      <Table size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell style={{ width: 36 }} />
            <TableHeaderCell style={{ width: 170 }}>Atividade</TableHeaderCell>
            <TableHeaderCell>Título</TableHeaderCell>
            <TableHeaderCell style={{ width: 90 }}>Estimativa</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.activity}>
              <TableCell>
                <Checkbox checked={r.checked} onChange={(_, d) => update(i, { checked: !!d.checked })} />
              </TableCell>
              <TableCell>
                {r.activity}
                {r.exists && <Caption1 className={st.muted}> (já existe)</Caption1>}
              </TableCell>
              <TableCell>
                <Input size="small" value={r.title} disabled={!r.checked} onChange={(_, d) => update(i, { title: d.value })} style={{ width: "100%" }} />
              </TableCell>
              <TableCell>
                <Input size="small" value={r.estimate} disabled={!r.checked} onChange={(_, d) => update(i, { estimate: d.value })} style={{ width: 80 }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DialogShell>
  );
}
