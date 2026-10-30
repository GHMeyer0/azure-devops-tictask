// Writes to the Extension Data Service and to work items fail now and then for reasons that go
// away on their own (network, throttling, a 5xx). Those are tried again a few times; an answer
// that will not change (a process rule, a missing field, no permission) fails at once.

const DELAYS_MS = [500, 1500];

/** A failure that will repeat on a new attempt: rule errors, bad requests, permissions, not found. */
export function isPermanent(e: unknown): boolean {
  const err = e as { status?: number; message?: string; serverError?: { message?: string } };
  if (err?.status && [400, 401, 403, 404, 409].includes(err.status)) return true;
  const text = err?.serverError?.message ?? err?.message ?? "";
  return /TF\d{5,}|Rule Error|inválid|invalid/i.test(text);
}

export async function withRetry<T>(fn: () => Promise<T>, delays: number[] = DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delays.length || isPermanent(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
