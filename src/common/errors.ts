/** Message of an error from the SDK/REST clients (serverError) or a plain Error. */
export function errorMessage(e: unknown): string {
  if (!e) return "Erro desconhecido";
  const err = e as { message?: string; serverError?: { message?: string } };
  return err.serverError?.message ?? err.message ?? String(e);
}

/**
 * The process refused the Original Estimate (e.g. "TF401320: Rule Error for field Original Estimate.
 * Error code: ReadOnly, InvalidNotOldValue": a rule makes the field read-only). Seen in another
 * organization on 05/11/2026: pausing a forgotten timer on a task without estimate was refused and
 * the timer could not be stopped. The save is then repeated without the field.
 */
/**
 * The state the save asked for does not exist for the work item type ("The field 'State' contains
 * the value 'Closed' that is not in the list of supported values": seen in another organization on
 * 06/11/2026). Returns the refused state, or null for any other error.
 */
export function unsupportedState(e: unknown): string | null {
  const m = /field 'State' contains the value '([^']*)' that is not in the list of supported values/i.exec(errorMessage(e));
  return m ? m[1] : null;
}

/**
 * The field a process rule requires and the save left empty ("TF401320: Rule Error for field
 * Description. Error code: Required, InvalidEmpty": seen in another organization on 06/11/2026), or
 * null for any other error.
 */
export function requiredEmptyField(e: unknown): string | null {
  const m = /Rule Error for field ([^.]+)\. Error code: [^.]*\bRequired\b/i.exec(errorMessage(e));
  return m ? m[1].trim() : null;
}

/** The required empty field is the description (System.Description, "Descrição" in Portuguese). */
export function isDescriptionRequired(e: unknown): boolean {
  return /^(Description|Descrição)$/i.test(requiredEmptyField(e) ?? "");
}

export function isOriginalEstimateLocked(e: unknown): boolean {
  const m = errorMessage(e);
  return /TF401320/.test(m) && /Original Estimate/i.test(m) && /ReadOnly|InvalidNotOldValue/i.test(m);
}
