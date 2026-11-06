/**
 * Project name shown with an entry on screens that mix projects (Calendário): always for an entry of
 * another project than the page's, and for every entry when the list has more than one project.
 * Empty when only the page's project is shown.
 */
export function projectLabel(projectId: string, here: string, mixed: boolean, names: Map<string, string>): string {
  if (projectId !== here || mixed) return names.get(projectId) ?? "";
  return "";
}
