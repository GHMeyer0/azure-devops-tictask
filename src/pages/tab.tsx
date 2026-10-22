import { renderPage } from "../common/ui/root";
import { TabView } from "../workitem/TabView";
import { registerFormEvents } from "../workitem/useWorkItemForm";

renderPage(TabView, registerFormEvents);
