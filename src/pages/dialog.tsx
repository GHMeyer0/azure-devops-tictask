import type { DialogRequest } from "../common/dialogs";
import { SDK } from "../common/sdk";
import { renderPage } from "../common/ui/root";
import { useAutoResize } from "../common/ui/hooks";
import { LogDialog } from "../dialogs/LogDialog";
import { PauseDialog } from "../dialogs/PauseDialog";
import { StandardDialog } from "../dialogs/StandardDialog";
import { StartDialog } from "../dialogs/StartDialog";

interface DialogConfig {
  request: DialogRequest;
  dialog?: { close: (result?: unknown) => void };
}

// The host dialog has a fixed width (480px, 440px for content after padding, measured in ADO on
// 22/10/2026) and does not grow: asking for more only adds a horizontal scrollbar outside the
// iframe. So keep the width the host gave the iframe when it opened, measured before any resize.
// The content is fluid and fits any width.
const HOST_WIDTH = document.documentElement.clientWidth;
const FALLBACK_WIDTH = 440;
const DIALOG_WIDTH = HOST_WIDTH >= 320 ? HOST_WIDTH : FALLBACK_WIDTH;

function DialogPage() {
  const config = SDK.getConfiguration() as DialogConfig;
  const request = config.request;
  useAutoResize(DIALOG_WIDTH);
  const close = (result?: unknown) => config.dialog?.close(result);
  switch (request.kind) {
    case "log":
      return <LogDialog request={request} onDone={close} />;
    case "start":
      return <StartDialog request={request} onDone={close} />;
    case "standard":
      return <StandardDialog request={request} onDone={close} />;
    case "pause":
      return <PauseDialog request={request} onDone={close} />;
  }
}

renderPage(DialogPage);
