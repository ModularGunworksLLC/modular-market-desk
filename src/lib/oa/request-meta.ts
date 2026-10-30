/** Client hints for the OA audit row. IP is the proxy's X-Real-IP, not X-Forwarded-For. */

import { isIP } from "node:net";

export interface OaClientMeta {
  ip: string | null;
  ua: string | null;
}

export function oaClientMeta(headers: { get(name: string): string | null }): OaClientMeta {
  const rawIp = stripControls(headers.get("x-real-ip") ?? "").trim();
  const ip = rawIp && isIP(rawIp) !== 0 ? rawIp.slice(0, 64) : null;
  const ua = stripControls(headers.get("user-agent") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return { ip, ua: ua || null };
}

function stripControls(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}
