import { describe, expect, it } from "vitest";

import { acceptHandoffMessage, canSave, previewOaToken } from "@/lib/oa/handoff";

function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.fake-signature-not-a-real-token`;
}

describe("OA popup handoff", () => {
  const opener = { id: "oa-window" };
  const allowed = ["https://hub.outdooranalytics.com"];
  const token = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600, iss: "outdoor", aud: "desk" });

  it("ignores a forged event.source", () => {
    const accepted = acceptHandoffMessage({
      origin: allowed[0]!,
      source: { id: "other-window" },
      opener,
      allowedOrigins: allowed,
      data: { type: "desk-oa-token", token },
    });
    expect(accepted).toBeNull();
  });

  it("ignores a message when there is no opener", () => {
    expect(
      acceptHandoffMessage({
        origin: allowed[0]!,
        source: opener,
        opener: null,
        allowedOrigins: allowed,
        data: { type: "desk-oa-token", token },
      }),
    ).toBeNull();
  });

  it("accepts the opener and still does not save until confirm", () => {
    const accepted = acceptHandoffMessage({
      origin: allowed[0]!,
      source: opener,
      opener,
      allowedOrigins: allowed,
      data: { type: "desk-oa-token", token },
    });
    expect(accepted).toBe(token);
    expect(canSave("waiting")).toBe(false);
    expect(canSave("confirm")).toBe(true);
    expect(canSave("saving")).toBe(false);
    const preview = previewOaToken(token);
    expect(preview.malformed).toBe(false);
    expect(preview.expiresAtChicago).toBeTruthy();
    expect(preview.iss).toBe("outdoor");
    expect(preview.aud).toBe("desk");
    expect(JSON.stringify({ chicago: preview.expiresAtChicago, iss: preview.iss })).not.toContain(token);
  });

  it("flags an expiry more than 30 days out", () => {
    const far = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 40 * 24 * 3600 });
    const preview = previewOaToken(far);
    expect(preview.suspicious).toBe(true);
  });
});
