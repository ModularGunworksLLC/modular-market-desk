/** Client hints for the OA audit row. IP is the proxy's X-Real-IP, not X-Forwarded-For. */

export interface OaClientMeta {
  ip: string | null;
  ua: string | null;
}

export function oaClientMeta(headers: { get(name: string): string | null }): OaClientMeta {
  const ip = headers.get("x-real-ip")?.trim() || null;
  const ua = headers.get("user-agent")?.replace(/\s+/g, " ").trim() || null;
  return {
    ip: ip ? ip.slice(0, 64) : null,
    ua: ua ? ua.slice(0, 160) : null,
  };
}
