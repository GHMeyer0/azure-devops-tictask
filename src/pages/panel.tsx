import { PanelView, registerBacklogPanel, registerBacklogPanelEarly } from "../backlog/PanelView";
import { renderPage } from "../common/ui/root";

registerBacklogPanelEarly();
renderPage(PanelView, registerBacklogPanel);
