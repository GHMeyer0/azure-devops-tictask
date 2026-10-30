/** Message of an error from the SDK/REST clients (serverError) or a plain Error. */
export function errorMessage(e: unknown): string {
  if (!e) return "Erro desconhecido";
  const err = e as { message?: string; serverError?: { message?: string } };
  return err.serverError?.message ?? err.message ?? String(e);
}
