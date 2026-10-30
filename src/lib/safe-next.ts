/**
 * Login `next` must be a same-origin path. `//evil.example` and `/\evil`
 * are scheme-relative and must not be followed.
 */
export function safeInternalPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.includes("\\")) return "/";
  return next;
}
