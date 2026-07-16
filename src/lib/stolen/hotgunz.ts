/**
 * HotGunz stolen-serial gate (crowdsourced — not NCIC).
 * Site TLS cert is expired; we allow that host only. Search is POST field `q`.
 */

import * as https from "node:https";

export type StolenStatus = "hit" | "clear" | "unavailable" | "skipped";

export interface StolenCheckResult {
  serial: string;
  status: StolenStatus;
  detail: string;
  checkedAt: string;
  sourceUrl: string;
}

export class StolenCheckError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "StolenCheckError";
  }
}

export function normalizeSerial(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function postHotGunz(serial: string): Promise<{ status: number; html: string }> {
  const body = `q=${encodeURIComponent(serial)}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.hotgunz.com",
        path: "/search.php",
        method: "POST",
        rejectUnauthorized: false,
        timeout: 15_000,
        headers: {
          "User-Agent": "ModularMarketDesk/1.0 (FFL due-diligence; +https://modulargunworks.com)",
          Accept: "text/html",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": String(Buffer.byteLength(body)),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            html: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("HotGunz timeout")));
    req.write(body);
    req.end();
  });
}

/**
 * Best-effort check against HotGunz public serial search.
 * Crowdsourced only — clear ≠ NCIC clear.
 */
export async function checkHotGunz(serialRaw: string): Promise<StolenCheckResult> {
  const serial = normalizeSerial(serialRaw);
  const checkedAt = new Date().toISOString();
  const sourceUrl = `https://www.hotgunz.com/search.php`;
  if (!serial) {
    return {
      serial: "",
      status: "skipped",
      detail: "No serial provided.",
      checkedAt,
      sourceUrl: "https://www.hotgunz.com/",
    };
  }

  try {
    const resp = await postHotGunz(serial);
    const html = resp.html;
    const lower = html.toLowerCase();

    const clear =
      lower.includes("firearm not reported stolen") ||
      lower.includes("has not been submitted to the database") ||
      lower.includes("not been submitted");

    const hit =
      !clear &&
      (lower.includes("reported stolen") ||
        lower.includes("this firearm has been reported") ||
        (lower.includes("make:") && lower.includes("model:") && lower.includes(serial.toLowerCase())));

    if (resp.status < 200 || resp.status >= 400) {
      return {
        serial,
        status: "unavailable",
        detail: `HotGunz HTTP ${resp.status} (expired TLS — advisory only)`,
        checkedAt,
        sourceUrl,
      };
    }

    if (clear) {
      return {
        serial,
        status: "clear",
        detail:
          "HotGunz: not reported stolen in their crowd DB. NOT an NCIC clear. Site uses expired TLS — advisory only.",
        checkedAt,
        sourceUrl: `${sourceUrl}?q=${encodeURIComponent(serial)}`,
      };
    }

    if (hit) {
      return {
        serial,
        status: "hit",
        detail:
          "Possible HotGunz match — do not buy; verify with LE / NCIC. (Crowdsourced; expired TLS.)",
        checkedAt,
        sourceUrl: `${sourceUrl}?q=${encodeURIComponent(serial)}`,
      };
    }

    return {
      serial,
      status: "unavailable",
      detail: "Could not interpret HotGunz response — check manually on hotgunz.com.",
      checkedAt,
      sourceUrl,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      serial,
      status: "unavailable",
      detail: `HotGunz unreachable (${errMsg}). Check manually.`,
      checkedAt,
      sourceUrl,
    };
  }
}
