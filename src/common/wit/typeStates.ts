import { adaptStates } from "../domain/state";
import type { StateSettings } from "../domain/types";
import { workItemTypeStates } from "./witService";

/**
 * The configured states as the work item type has them in that project's process (In Progress,
 * Done… in a Scrum or Basic project): what the actions write and what the dialogs show. When the
 * type's states cannot be read, the configuration is used as is.
 */
export async function statesFor(projectName: string, type: string, states: StateSettings): Promise<StateSettings> {
  let existing: string[] = [];
  try {
    existing = await workItemTypeStates(projectName, type);
  } catch {
    /* unknown: the configuration is used as is */
  }
  return adaptStates(states, existing);
}
