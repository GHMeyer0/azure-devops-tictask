import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { ErrorBar } from "../common/ui/components";

const useStyles = makeStyles({
  // Fluid: the host decides the dialog width, so nothing here may be wider than the iframe.
  root: { display: "flex", flexDirection: "column", gap: "12px", padding: "4px 8px 8px", width: "100%", minWidth: 0 },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    paddingTop: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

export function DialogShell({ children, okText, okIcon, okDisabled, busy, error, onOk, onCancel }: {
  children: React.ReactNode;
  okText: string;
  okIcon?: React.ReactElement;
  okDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  onOk: () => void;
  onCancel: () => void;
}) {
  const st = useStyles();
  return (
    <form
      className={st.root}
      onSubmit={(e) => {
        e.preventDefault();
        if (!okDisabled && !busy) onOk();
      }}
    >
      {children}
      <ErrorBar error={error ?? null} />
      <div className={st.footer}>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button appearance="primary" type="submit" icon={okIcon} disabled={okDisabled || busy}>
          {okText}
        </Button>
      </div>
    </form>
  );
}
