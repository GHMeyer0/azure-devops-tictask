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

function DialogPage() {
  useAutoResize();
  const config = SDK.getConfiguration() as DialogConfig;
  const close = (result?: unknown) => config.dialog?.close(result);
  const request = config.request;
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
