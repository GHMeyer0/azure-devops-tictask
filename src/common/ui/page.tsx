import { Body1, Caption1, Card, CardHeader, Subtitle2, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";

// Building blocks shared by the hub tabs, the work item tab and the backlog panel, following the
// same pattern as the Settings page: content grouped in cards with a title and a short
// description, a filter/command toolbar like the ADO backlog's, and a standard empty state.

const useStyles = makeStyles({
  card: { padding: "16px 20px", gap: "8px", minWidth: 0 },
  compact: { padding: "12px 14px", gap: "6px" },
  muted: { color: tokens.colorNeutralForeground3 },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    padding: "8px 12px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  spacer: { flexGrow: 1 },
  // The right-hand group wraps as a unit, never splitting e.g. "Detalhado" from "Exportar".
  end: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "6px", padding: "24px 12px", color: tokens.colorNeutralForeground3 },
  emptyIcon: { fontSize: "32px", color: tokens.colorNeutralForeground4, display: "flex" },
  emptyTitle: { color: tokens.colorNeutralForeground2 },
});

export function PageCard({ title, description, action, compact, className, children }: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const st = useStyles();
  return (
    <Card className={mergeClasses(st.card, compact && st.compact, className)}>
      {(title || action) && (
        <CardHeader
          header={<Subtitle2>{title}</Subtitle2>}
          description={description ? <Caption1 className={st.muted}>{description}</Caption1> : undefined}
          action={action as React.ReactElement | undefined}
        />
      )}
      {children}
    </Card>
  );
}

/** Filter/command bar (like the backlog filter bar): controls on the left, `end` on the right. */
export function Toolbar({ children, end }: { children: React.ReactNode; end?: React.ReactNode }) {
  const st = useStyles();
  return (
    <div className={st.toolbar} role="toolbar">
      {children}
      {end && <div className={st.spacer} />}
      {end && <div className={st.end}>{end}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactElement; title: string; children?: React.ReactNode }) {
  const st = useStyles();
  return (
    <div className={st.empty}>
      {icon && <span className={st.emptyIcon}>{icon}</span>}
      <Body1 className={st.emptyTitle}>{title}</Body1>
      {children && <Caption1>{children}</Caption1>}
    </div>
  );
}
