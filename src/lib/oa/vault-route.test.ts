import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, describe, expect, it } from "vitest";

import { formatChicago } from "@/lib/oa/status";

const dir = mkdtempSync(join(tmpdir(), "oa-vault-"));
const dbFile = join(dir, "desk.db");
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.SESSION_VAULT_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
process.env.DESK_AUTH_SECRET = "test-desk-secret";
process.env.DESK_PUBLIC_ORIGIN = "http://127.0.0.1:3010";
process.env.OA_EXPIRY_WARN_HOURS = "2";
delete process.env.GBA_BEARER_TOKEN;

const DESK = "http://127.0.0.1:3010";
const SECRET = "test-desk-secret";

function fakeJwt(expSeconds: number): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ exp: expSeconds, sub: "fake-oa-test" })}.fake-signature-not-a-real-token`;
}

function leaked(blob: string, secret: string): boolean {
  return secret.length > 0 && blob.includes(secret);
}

const { POST, DELETE } = await import("@/app/api/vault/oa/route");
const { GET } = await import("@/app/api/vault/status/route");
const { mintDeskSessionToken } = await import("@/lib/desk-auth");
const { latestOaAudit, markOaUnauthorized } = await import("@/lib/oa/vault-store");

const logs: string[] = [];
const originals = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};
for (const key of ["log", "error", "warn", "info"] as const) {
  console[key] = (...args: unknown[]) => {
    logs.push(args.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" "));
  };
}

afterAll(() => {
  console.log = originals.log;
  console.error = originals.error;
  console.warn = originals.warn;
  console.info = originals.info;
});

function authed(origin: string | null, extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  headers.set("authorization", `Bearer ${SECRET}`);
  headers.set("content-type", "application/json");
  if (origin) headers.set("origin", origin);
  return headers;
}

describe("OA token save endpoint", () => {
  it("rejects unauthenticated and wrong-origin writes", async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const anon = await POST(
      new Request(`${DESK}/api/vault/oa`, {
        method: "POST",
        headers: { origin: DESK, "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(anon.status).toBe(401);
    expect(leaked(await anon.clone().text(), token)).toBe(false);

    const evil = await POST(
      new Request(`${DESK}/api/vault/oa`, {
        method: "POST",
        headers: authed("https://evil.example"),
        body: JSON.stringify({ token }),
      }),
    );
    expect(evil.status).toBe(403);

    const fromOa = await POST(
      new Request(`${DESK}/api/vault/oa`, {
        method: "POST",
        headers: authed("https://hub.outdooranalytics.com"),
        body: JSON.stringify({ token }),
      }),
    );
    expect(fromOa.status).toBe(403);
    expect(leaked(await fromOa.text(), token)).toBe(false);

    const audits = await latestOaAudit();
    const blob = audits.map((row) => `${row.action} ${row.detail}`).join("\n");
    expect(blob).toContain("oa_token_failed_attempt");
    expect(leaked(blob, token)).toBe(false);
    expect(leaked(logs.join("\n"), token)).toBe(false);
  });

  it("rejects a malformed token without echoing it", async () => {
    const token = `not-a-jwt-${"z".repeat(48)}`;
    const res = await POST(
      new Request(`${DESK}/api/vault/oa`, {
        method: "POST",
        headers: authed(DESK),
        body: JSON.stringify({ token }),
      }),
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(leaked(text, token)).toBe(false);
    const audits = await latestOaAudit();
    expect(audits[0]?.action).toBe("oa_token_failed_attempt");
    expect(leaked(audits.map((row) => row.detail).join("\n"), token)).toBe(false);
  });

  it("saves with the desk session cookie, records exp, and audits without the token", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10 * 3600;
    const token = fakeJwt(exp);
    const cookie = await mintDeskSessionToken(SECRET);
    const res = await POST(
      new Request(`${DESK}/api/vault/oa`, {
        method: "POST",
        headers: {
          origin: DESK,
          "content-type": "application/json",
          cookie: `desk_session=${cookie}`,
        },
        body: JSON.stringify({ token }),
      }),
    );
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(leaked(text, token)).toBe(false);
    const body = JSON.parse(text) as { ok: boolean; message: string; expiresAt: string };
    expect(body.ok).toBe(true);
    expect(body.message).toContain("OA connected to Desk");
    expect(body.expiresAt).toBe(new Date(exp * 1000).toISOString());
    expect(body.message).toContain(formatChicago(new Date(exp * 1000)));

    const audits = await latestOaAudit();
    const setRow = audits.find((row) => row.action === "oa_token_set");
    expect(setRow?.actor).toBe("desk-session");
    expect(leaked(setRow?.detail ?? "", token)).toBe(false);

    const client = createClient({ url: `file:${dbFile}` });
    const stored = await client.execute(
      "select secret, status from connections where vendor = 'outdoor_analytics'",
    );
    const secret = String(stored.rows[0]?.secret ?? "");
    expect(secret.length).toBeGreaterThan(0);
    expect(leaked(secret, token)).toBe(false);
    expect(String(stored.rows[0]?.status)).toBe("active");
    client.close();
  });

  it("reports expiring_soon, expired, and unauthorized without the token", async () => {
    const soon = Math.floor(Date.now() / 1000) + 3600;
    const soonToken = fakeJwt(soon);
    const saved = await POST(
      new Request(`${DESK}/api/vault/oa`, {
        method: "POST",
        headers: authed(DESK),
        body: JSON.stringify({ token: soonToken }),
      }),
    );
    expect(saved.status).toBe(200);

    const soonStatus = await GET(
      new Request(`${DESK}/api/vault/status`, { headers: authed(null) }),
    );
    const soonBody = (await soonStatus.json()) as {
      state: string;
      message: string;
      expiresAt: string;
      lastSetAt: string | null;
      lastProbeOk: boolean | null;
    };
    expect(soonBody.state).toBe("expiring_soon");
    expect(soonBody.message).toContain("expiring soon");
    expect(soonBody.message).toContain(formatChicago(new Date(soon * 1000)));
    expect(soonBody.message).toMatch(/in \d+(\.\d)? hours/);
    expect(soonBody.lastSetAt).toBeTruthy();
    expect(soonBody.lastProbeOk).toBeNull();
    expect(leaked(JSON.stringify(soonBody), soonToken)).toBe(false);

    const past = Math.floor(Date.now() / 1000) - 3600;
    const pastToken = fakeJwt(past);
    const expiredSave = await POST(
      new Request(`${DESK}/api/vault/oa`, {
        method: "POST",
        headers: authed(DESK),
        body: JSON.stringify({ token: pastToken }),
      }),
    );
    expect(expiredSave.status).toBe(200);
    const expired = await GET(new Request(`${DESK}/api/vault/status`, { headers: authed(null) }));
    const expiredBody = (await expired.json()) as { state: string; message: string };
    expect(expiredBody.state).toBe("expired");
    expect(expiredBody.message).toContain(formatChicago(new Date(past * 1000)));
    expect(leaked(JSON.stringify(expiredBody), pastToken)).toBe(false);

    await markOaUnauthorized();
    const rejected = await GET(new Request(`${DESK}/api/vault/status`, { headers: authed(null) }));
    const rejectedBody = (await rejected.json()) as { state: string; lastProbeOk: boolean | null; message: string };
    expect(rejectedBody.state).toBe("unauthorized");
    expect(rejectedBody.lastProbeOk).toBe(false);
    expect(rejectedBody.message.toLowerCase()).toContain("rejected");
    expect(leaked(JSON.stringify(rejectedBody), pastToken)).toBe(false);
  });

  it("returns the bookmarklet to a signed-in caller and not to an anonymous one", async () => {
    const anon = await (await import("@/app/api/vault/oa/route")).GET(
      new Request(`${DESK}/api/vault/oa`),
    );
    expect(anon.status).toBe(401);

    const res = await (await import("@/app/api/vault/oa/route")).GET(
      new Request(`${DESK}/api/vault/oa`, { headers: authed(null) }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { href?: string; storageKey?: string };
    expect(body.storageKey).toBe("gb_session_token");
    expect(body.href?.startsWith("javascript:")).toBe(true);
    expect(body.href?.includes("postMessage")).toBe(true);
    expect(body.href?.includes(DESK)).toBe(true);
  });

  it("clears the token and writes a clear audit row", async () => {
    const res = await DELETE(
      new Request(`${DESK}/api/vault/oa`, { method: "DELETE", headers: authed(DESK) }),
    );
    expect(res.status).toBe(200);
    const status = await GET(new Request(`${DESK}/api/vault/status`, { headers: authed(null) }));
    const body = (await status.json()) as { state: string };
    expect(body.state).toBe("not_connected");
    const audits = await latestOaAudit();
    expect(audits[0]?.action).toBe("oa_token_clear");
    expect(leaked(logs.join("\n"), "fake-signature-not-a-real-token")).toBe(false);
  });
});
