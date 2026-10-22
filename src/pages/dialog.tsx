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

/** Fixed dialog widths (px); the content is fluid and must fit them without horizontal scroll. */
const DIALOG_WIDTH = 560;
const DIALOG_WIDTH_WIDE = 640;

function dialogWidth(request: DialogRequest): number {
  // The log dialog without a task shows the task picker, whose rows are long.
  return request.kind === "log" && request.task === null ? DIALOG_WIDTH_WIDE : DIALOG_WIDTH;
}

function DialogPage() {
  const config = SDK.getConfiguration() as DialogConfig;
  const request = config.request;
  useAutoResize(dialogWidth(request));
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
