/**
 * Login `next` must stay on this origin. Control characters, scheme-relative
 * URLs (`//evil`, `/\evil`), and anything `new URL` resolves off-origin are rejected.
 */
export function safeInternalPath(next: string | null | undefined, origin = "https://desk.modulargunworks.com"): string {
  if (!next) return "/";
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.includes("\\")) return "/";
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return "/";
  }
  let resolved: URL;
  try {
    resolved = new URL(next, base);
  } catch {
    return "/";
  }
  if (resolved.origin !== base.origin) return "/";
  if (!resolved.pathname.startsWith("/") || resolved.pathname.startsWith("//")) return "/";
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
