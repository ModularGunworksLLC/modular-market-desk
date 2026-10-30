/** Local mock OA page is served in dev and on loopback only. */

export function localTestPageEnabled(hostname: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv !== "production") return true;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
