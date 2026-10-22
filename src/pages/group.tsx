import { renderPage } from "../common/ui/root";
import { GroupView } from "../workitem/GroupView";
import { registerFormEvents } from "../workitem/useWorkItemForm";

renderPage(GroupView, registerFormEvents);
