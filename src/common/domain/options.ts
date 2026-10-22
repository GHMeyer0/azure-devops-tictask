export interface PickOption {
  value: string;
  /** Text in the list. */
  label: string;
  /** Text in the closed dropdown (defaults to label). */
  short?: string;
  /** Saved value that Azure DevOps did not return (renamed/removed type or state, person out of the teams). */
  missing?: boolean;
}

/**
 * Picker options: what Azure DevOps returned plus the saved values it did not return, so nothing
 * already configured disappears silently. `key` compares values (e.g. lowercase for e-mails).
 */
export function withSavedOptions(available: PickOption[], saved: string[], key: (v: string) => string = (v) => v): PickOption[] {
  const known = new Set(available.map((o) => key(o.value)));
  const extra: PickOption[] = [];
  for (const v of saved) {
    const k = key(v);
    if (!v.trim() || known.has(k)) continue;
    known.add(k);
    extra.push({ value: v, label: `${v} (não encontrado no Azure DevOps)`, short: v, missing: true });
  }
  return [...available, ...extra];
}

export const plainOptions = (values: string[]): PickOption[] => values.map((v) => ({ value: v, label: v }));
