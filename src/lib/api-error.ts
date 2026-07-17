/** Map unknown thrown values to a safe client-facing error message + status. */

import { redactSecrets } from "@/lib/vault";

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return redactSecrets(err.message);
  return redactSecrets(String(err));
}

export function jsonError(err: unknown, status = 500): { body: { error: string }; status: number } {
  return { body: { error: errorMessage(err) }, status };
}
