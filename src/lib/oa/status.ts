/**
 * Outdoor Analytics connection state. Display times are always America/Chicago
 * so a UTC server clock cannot change what Michael reads on the banner.
 */

export const OA_DISPLAY_TIME_ZONE = "America/Chicago";

export const OA_CONNECTION_STATES = [
  "connected",
  "expiring_soon",
  "expired",
  "unauthorized",
  "not_connected",
] as const;

export type OaConnectionState = (typeof OA_CONNECTION_STATES)[number];

export type OaBlockReason = "missing" | "expired" | "unauthorized";

export interface OaStateInput {
  connected: boolean;
  status: string | null;
  expiresAt: Date | null;
  lastProbeOk: boolean | null;
  now: Date;
  warnWithinMs: number;
}

/** Pure state machine. Unauthorized (OA rejected the token) wins over clock expiry. */
export function resolveOaState(input: OaStateInput): OaConnectionState {
  if (!input.connected || input.status === "revoked" || input.status == null) {
    return "not_connected";
  }
  if (input.status === "error" || input.lastProbeOk === false) {
    return "unauthorized";
  }
  if (input.expiresAt && input.expiresAt.getTime() <= input.now.getTime()) {
    return "expired";
  }
  if (
    input.expiresAt &&
    input.expiresAt.getTime() - input.now.getTime() <= input.warnWithinMs
  ) {
    return "expiring_soon";
  }
  return "connected";
}

/** Live calls are allowed while connected or merely expiring soon. */
export function liveTokenBlocked(state: OaConnectionState): OaBlockReason | null {
  if (state === "not_connected") return "missing";
  if (state === "unauthorized") return "unauthorized";
  if (state === "expired") return "expired";
  return null;
}

export function formatChicago(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: OA_DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/** Duration phrase for the banner: always "in X hours", never a server-local clock. */
export function formatHoursUntil(expiresAt: Date, now: Date): string {
  const hours = (expiresAt.getTime() - now.getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 0) return "in 0 hours";
  const rounded = Math.round(hours * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `in ${text} hours`;
}

export function oaStatusMessage(
  state: OaConnectionState,
  expiresAt: Date | null,
  now: Date,
): string {
  const when = expiresAt ? formatChicago(expiresAt) : null;
  const remain = expiresAt ? formatHoursUntil(expiresAt, now) : null;
  switch (state) {
    case "connected":
      return when && remain
        ? `OA connected, expires at ${when} (${remain})`
        : "OA connected (expiry unknown).";
    case "expiring_soon":
      return when && remain
        ? `OA token expiring soon — expires at ${when} (${remain})`
        : "OA token expiring soon.";
    case "expired":
      return when
        ? `OA token expired at ${when}. Connect OA to refresh.`
        : "OA token expired. Connect OA to refresh.";
    case "unauthorized":
      return "OA rejected the token. Live OA data is unavailable until you connect again.";
    case "not_connected":
      return "OA is not connected. Connect OA before relying on live comps.";
  }
}

/** A forged exp decades out must not look like a normal long-lived session. */
export const OA_EXP_FAR_MS = 30 * 24 * 60 * 60 * 1000;

export function expIsFarFuture(expiresAt: Date | null, now: Date): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() > OA_EXP_FAR_MS;
}

export const FAR_EXPIRY_NOTE = " Expiry is more than 30 days out — treat this token as suspicious.";
export const ENV_TOKEN_OVERRIDE_NOTE =
  " GBA_BEARER_TOKEN is set, so sync keeps using that env token. Clearing the vault does not remove it.";

export function oaBannerTone(state: OaConnectionState): "ok" | "warn" | "bad" {
  if (state === "connected") return "ok";
  if (state === "expiring_soon") return "warn";
  return "bad";
}
