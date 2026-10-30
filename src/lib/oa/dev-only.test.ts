import { describe, expect, it } from "vitest";

import { isOaMockPath, localTestPageEnabled } from "@/lib/oa/dev-only";

describe("local OA mock page", () => {
  it("is off in production regardless of host, and on in dev or when OA_MOCK_PAGE=1", () => {
    expect(localTestPageEnabled("production")).toBe(false);
    expect(localTestPageEnabled("production", undefined)).toBe(false);
    expect(localTestPageEnabled("development")).toBe(true);
    expect(localTestPageEnabled("test")).toBe(true);
    expect(localTestPageEnabled("production", "1")).toBe(true);
  });

  it("recognizes percent-encoded mock paths", () => {
    expect(isOaMockPath("/oa-mock.html")).toBe(true);
    expect(isOaMockPath("/oa%2Dmock.html")).toBe(true);
    expect(isOaMockPath("/%6Fa-mock.html")).toBe(true);
    expect(isOaMockPath("/import")).toBe(false);
  });
});
