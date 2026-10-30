import { describe, expect, it } from "vitest";

import {
  expIsFarFuture,
  formatChicago,
  formatHoursUntil,
  liveTokenBlocked,
  oaBannerTone,
  oaStatusMessage,
  resolveOaState,
  type OaStateInput,
} from "@/lib/oa/status";

const WARN = 2 * 3_600_000;

function input(partial: Partial<OaStateInput> & Pick<OaStateInput, "now">): OaStateInput {
  return {
    connected: true,
    status: "active",
    expiresAt: new Date(partial.now.getTime() + 10 * 3_600_000),
    lastProbeOk: null,
    warnWithinMs: WARN,
    ...partial,
  };
}

describe("OA connection state", () => {
  const now = new Date("2026-10-30T18:00:00.000Z");

  it("walks not_connected → connected → expiring_soon → expired, and unauthorized wins", () => {
    expect(resolveOaState(input({ now, connected: false, status: null, expiresAt: null }))).toBe("not_connected");
    expect(resolveOaState(input({ now, status: "revoked" }))).toBe("not_connected");
    expect(resolveOaState(input({ now }))).toBe("connected");
    expect(
      resolveOaState(input({ now, expiresAt: new Date(now.getTime() + 60 * 60 * 1000) })),
    ).toBe("expiring_soon");
    expect(
      resolveOaState(input({ now, expiresAt: new Date(now.getTime() - 1000) })),
    ).toBe("expired");
    expect(
      resolveOaState(
        input({
          now,
          status: "error",
          lastProbeOk: false,
          expiresAt: new Date(now.getTime() + 10 * 3_600_000),
        }),
      ),
    ).toBe("unauthorized");
    expect(
      resolveOaState(
        input({
          now,
          status: "active",
          lastProbeOk: false,
          expiresAt: new Date(now.getTime() - 1000),
        }),
      ),
    ).toBe("unauthorized");
  });

  it("blocks live calls for missing, expired, and unauthorized only", () => {
    expect(liveTokenBlocked("connected")).toBeNull();
    expect(liveTokenBlocked("expiring_soon")).toBeNull();
    expect(liveTokenBlocked("not_connected")).toBe("missing");
    expect(liveTokenBlocked("expired")).toBe("expired");
    expect(liveTokenBlocked("unauthorized")).toBe("unauthorized");
  });

  it("formats expiry in America/Chicago, not the UTC clock", () => {
    const summer = new Date("2026-10-30T18:00:00.000Z");
    const formatted = formatChicago(summer);
    expect(formatted).toContain("1:00");
    expect(formatted).toContain("CDT");
    expect(formatted).not.toContain("6:00");

    const winter = new Date("2026-01-15T18:00:00.000Z");
    const winterText = formatChicago(winter);
    expect(winterText).toContain("12:00");
    expect(winterText).toContain("CST");
  });

  it("states hours remaining and banner tone without a server-local clock", () => {
    const expiresAt = new Date(now.getTime() + 5 * 3_600_000);
    expect(formatHoursUntil(expiresAt, now)).toBe("in 5 hours");
    expect(formatHoursUntil(new Date(now.getTime() + 1.5 * 3_600_000), now)).toBe("in 1.5 hours");
    const connected = oaStatusMessage("connected", expiresAt, now);
    expect(connected).toBe(`OA connected, expires at ${formatChicago(expiresAt)} (in 5 hours)`);
    expect(oaStatusMessage("expiring_soon", new Date(now.getTime() + 3_600_000), now)).toContain(
      "expiring soon",
    );
    expect(oaBannerTone("connected")).toBe("ok");
    expect(oaBannerTone("expiring_soon")).toBe("warn");
    expect(oaBannerTone("expired")).toBe("bad");
    expect(oaBannerTone("unauthorized")).toBe("bad");
    expect(expIsFarFuture(new Date(now.getTime() + 40 * 24 * 3600 * 1000), now)).toBe(true);
    expect(expIsFarFuture(new Date(now.getTime() + 2 * 24 * 3600 * 1000), now)).toBe(false);
  });
});
