import { describe, expect, it } from "vitest";

process.env.DESK_AUTH_SECRET = "login-rate-test-secret";

const { POST } = await import("@/app/api/auth/login/route");

describe("POST /api/auth/login", () => {
  it("rate-limits repeated failures from one IP", async () => {
    const headers = {
      "content-type": "application/json",
      "x-real-ip": "198.51.100.44",
    };
    for (let i = 0; i < 10; i++) {
      const res = await POST(
        new Request("http://127.0.0.1:3000/api/auth/login", {
          method: "POST",
          headers,
          body: JSON.stringify({ secret: "wrong-login-secret" }),
        }),
      );
      expect(res.status).toBe(401);
    }
    const blocked = await POST(
      new Request("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ secret: "wrong-login-secret" }),
      }),
    );
    expect(blocked.status).toBe(429);
    const text = await blocked.text();
    expect(text).not.toContain("login-rate-test-secret");
    expect(text).not.toContain("wrong-login-secret");
  });
});
