import { Avatar, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { useEffect, useState, type CSSProperties } from "react";
import { DIMS, type Dim, type Summary, type SummaryCell } from "../common/domain/summary";
import { formatMinutes } from "../common/domain/time";
import { WorkItemLink } from "../common/ui/components";

// Widths of the dimension columns: fixed, so they can stay pinned on the left (sticky) while the
// period columns scroll sideways. Narrower on HD screens, where the hub is ~1100px wide.
const WIDE: Record<Dim, number> = { user: 170, parent: 240, task: 240, activity: 150 };
const NARROW: Record<Dim, number> = { user: 140, parent: 190, task: 190, activity: 120 };
const NARROW_QUERY = "(max-width: 1400px)";

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}
const COL = 68;
const TOTAL = 76;

const useStyles = makeStyles({
  table: { width: "auto", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 },
  // Explicit backgrounds: sticky cells must hide the columns scrolling under them.
  cell: { backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  row: {
    borderBottom: "none",
    ":hover": { backgroundColor: "transparent" },
    ":hover > td": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  head: { backgroundColor: tokens.colorNeutralBackground2, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  groupHead: { textAlign: "center", color: tokens.colorNeutralForeground2, fontWeight: tokens.fontWeightRegular, fontSize: tokens.fontSizeBase200 },
  groupLabel: { width: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sticky: { position: "sticky", zIndex: 1 },
  lastDim: { borderRight: `1px solid ${tokens.colorNeutralStroke1}` },
  dim: { verticalAlign: "top", paddingTop: "7px", paddingBottom: "7px" },
  trunc: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  truncText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  muted: { color: tokens.colorNeutralForeground3 },
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingLeft: "4px", paddingRight: "10px" },
  headNum: { justifyContent: "flex-end" },
  weekend: { color: tokens.colorNeutralForeground4 },
  weekendCell: { backgroundColor: tokens.colorNeutralBackground1Hover },
  weekStart: { borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  totalCol: { fontWeight: tokens.fontWeightSemibold, borderLeft: `1px solid ${tokens.colorNeutralStroke1}` },
  subtotal: { backgroundColor: tokens.colorNeutralBackground2, fontWeight: tokens.fontWeightSemibold },
  total: { backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold, borderBottom: "none" },
});

/**
 * The "Resumo" grid: dimension columns (merged when repeated) pinned on the left, then one column per
 * day/week/month and the row total. `colorOf` gives the activity color (dot before its name).
 */
export function SummaryTable({ summary, dims, colorOf }: { summary: Summary; dims: Dim[]; colorOf?: (activity: string) => string | undefined }) {
  const st = useStyles();
  const WIDTH = useNarrow() ? NARROW : WIDE;
  const { columns, groups } = summary;
  const left = dims.map((_, i) => dims.slice(0, i).reduce((a, d) => a + WIDTH[d], 0));
  const dimsWidth = dims.reduce((a, d) => a + WIDTH[d], 0);
  // Auto table layout grows a column to fit its content: the widths are enforced on the cells.
  const pin = (i: number): CSSProperties => ({ left: left[i], width: WIDTH[dims[i]], minWidth: WIDTH[dims[i]], maxWidth: WIDTH[dims[i]] });
  const weekStarts = new Set(columns.map((c, i) => (i > 0 && c.group && c.group !== columns[i - 1].group ? i : -1)));
  const colClass = (i: number) => mergeClasses(st.num, weekStarts.has(i) && st.weekStart);
  const headRows = groups.length ? 2 : 1;

  const fixed = (w: number): CSSProperties => ({ width: w, minWidth: w, maxWidth: w });

  // The cell content has an explicit width too: overflow alone does not stop a column from growing.
  const inner = (w: number): CSSProperties => ({ width: w - 16 });

  const dimCell = (dim: Dim, cell: SummaryCell) => {
    if (dim === "user")
      return (
        <div className={st.trunc} style={inner(WIDTH[dim])} title={cell.label}>
          <Avatar name={cell.label} size={20} />
          <span className={st.truncText}>{cell.label}</span>
        </div>
      );
    if (cell.workItemId)
      return (
        <div className={st.trunc} style={inner(WIDTH[dim])}>
          <WorkItemLink id={cell.workItemId} title={cell.title} />
        </div>
      );
    const color = dim === "activity" ? colorOf?.(cell.key) : undefined;
    return (
      <div className={mergeClasses(st.trunc, !cell.key && st.muted)} style={inner(WIDTH[dim])} title={cell.label}>
        {color && <span className={st.dot} style={{ backgroundColor: color }} />}
        <span className={st.truncText}>{cell.label}</span>
      </div>
    );
  };

  const hours = (m: number) => (m ? formatMinutes(m) : "");

  return (
    <Table size="small" aria-label="Resumo de horas" className={st.table}>
      <colgroup>
        {dims.map((d) => (
          <col key={d} style={{ width: WIDTH[d] }} />
        ))}
        {columns.map((c) => (
          <col key={c.from} style={{ width: COL }} />
        ))}
        <col style={{ width: TOTAL }} />
      </colgroup>
      <TableHeader>
        <TableRow className={st.row}>
          {dims.map((d, i) => (
            <TableHeaderCell key={d} rowSpan={headRows} className={mergeClasses(st.cell, st.head, st.sticky, i === dims.length - 1 && st.lastDim)} style={pin(i)}>
              {DIMS.find((x) => x.value === d)!.label}
            </TableHeaderCell>
          ))}
          {groups.length
            ? groups.map((g, i) => (
                <TableHeaderCell key={g.label} colSpan={g.span} className={mergeClasses(st.cell, st.head, st.groupHead, i > 0 && st.weekStart)}>
                  <span className={st.groupLabel} title={g.label}>
                    {g.label}
                  </span>
                </TableHeaderCell>
              ))
            : columns.map((c, i) => (
                <TableHeaderCell key={c.from} className={mergeClasses(st.cell, st.head, colClass(i), c.weekend && st.weekend)} button={{ className: st.headNum }}>
                  {c.label}
                </TableHeaderCell>
              ))}
          <TableHeaderCell rowSpan={headRows} className={mergeClasses(st.cell, st.head, st.num, st.totalCol)} button={{ className: st.headNum }}>
            Total
          </TableHeaderCell>
        </TableRow>
        {groups.length > 0 && (
          <TableRow className={st.row}>
            {columns.map((c, i) => (
              <TableHeaderCell key={c.from} className={mergeClasses(st.cell, st.head, colClass(i), c.weekend && st.weekend)} button={{ className: st.headNum }}>
                {c.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        )}
      </TableHeader>
      <TableBody>
        {summary.rows.map((r) =>
          r.kind === "subtotal" ? (
            <TableRow key={r.key} className={st.row}>
              <TableCell colSpan={dims.length} className={mergeClasses(st.cell, st.subtotal, st.sticky, st.lastDim)} style={{ left: 0, ...fixed(dimsWidth) }}>
                <div className={st.trunc} style={inner(dimsWidth)} title={r.label}>
                  {r.label}
                </div>
              </TableCell>
              {r.perCol.map((m, i) => (
                <TableCell key={i} className={mergeClasses(st.cell, st.subtotal, colClass(i))}>
                  {hours(m)}
                </TableCell>
              ))}
              <TableCell className={mergeClasses(st.cell, st.subtotal, st.num, st.totalCol)}>{formatMinutes(r.total)}</TableCell>
            </TableRow>
          ) : (
            <TableRow key={r.key} className={st.row}>
              {dims.map((d, i) =>
                r.spans[d] ? (
                  <TableCell key={d} rowSpan={r.spans[d]} className={mergeClasses(st.cell, st.dim, st.sticky, i === dims.length - 1 && st.lastDim)} style={pin(i)}>
                    {dimCell(d, r.cells[d]!)}
                  </TableCell>
                ) : null,
              )}
              {r.perCol.map((m, i) => (
                <TableCell key={i} className={mergeClasses(st.cell, colClass(i), columns[i].weekend && st.weekendCell)} style={fixed(COL)}>
                  {hours(m)}
                </TableCell>
              ))}
              <TableCell className={mergeClasses(st.cell, st.num, st.totalCol)}>{formatMinutes(r.total)}</TableCell>
            </TableRow>
          ),
        )}
        <TableRow className={st.row}>
          <TableCell colSpan={dims.length} className={mergeClasses(st.cell, st.total, st.sticky, st.lastDim)} style={{ left: 0, ...fixed(dimsWidth) }}>
            Total
          </TableCell>
          {summary.colTotals.map((m, i) => (
            <TableCell key={i} className={mergeClasses(st.cell, st.total, colClass(i))}>
              {hours(m)}
            </TableCell>
          ))}
          <TableCell className={mergeClasses(st.cell, st.total, st.num, st.totalCol)}>{formatMinutes(summary.total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
