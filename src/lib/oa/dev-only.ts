/**
 * The mock OA page is on in dev and off in every production build.
 * OA_MOCK_PAGE=1 can turn it back on, including a production build that was
 * compiled with that flag. Do not key this off the request Host.
 */
export function localTestPageEnabled(nodeEnv: string | undefined, mockFlag?: string): boolean {
  if (mockFlag === "1") return true;
  return nodeEnv !== "production";
}

/** Encoded forms such as /oa%2Dmock.html and /%6Fa-mock.html decode to the mock page. */
export function isOaMockPath(pathname: string): boolean {
  let decoded = pathname;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  const path = decoded.toLowerCase().replace(/\/+$/, "") || "/";
  return path === "/oa-mock.html" || path === "/oa-mock";
}
