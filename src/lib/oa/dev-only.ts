/**
 * The mock OA page is on in dev and off in every production build.
 * OA_MOCK_PAGE=1 can turn it back on, including a production build that was
 * compiled with that flag. Do not key this off the request Host.
 */
export function localTestPageEnabled(nodeEnv: string | undefined, mockFlag?: string): boolean {
  if (mockFlag === "1") return true;
  return nodeEnv !== "production";
}
