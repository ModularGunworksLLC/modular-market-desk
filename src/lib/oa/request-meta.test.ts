import { describe, expect, it } from "vitest";

import { oaClientMeta } from "@/lib/oa/request-meta";

function headers(map: Record<string, string>): { get(name: string): string | null } {
  return { get: (name) => map[name.toLowerCase()] ?? null };
}

describe("oaClientMeta", () => {
  it("keeps a real IP and drops garbage or control characters", () => {
    expect(oaClientMeta(headers({ "x-real-ip": "203.0.113.10", "user-agent": "Desk/1" }))).toEqual({
      ip: "203.0.113.10",
      ua: "Desk/1",
    });
    expect(oaClientMeta(headers({ "x-real-ip": "2001:db8::1" })).ip).toBe("2001:db8::1");
    expect(oaClientMeta(headers({ "x-real-ip": "not-an-ip" })).ip).toBeNull();
    expect(oaClientMeta(headers({ "x-real-ip": "203.0.113.10\n1.2.3.4" })).ip).toBeNull();
    expect(oaClientMeta(headers({ "user-agent": "Bad\u0007Agent" })).ua).toBe("BadAgent");
  });
});
