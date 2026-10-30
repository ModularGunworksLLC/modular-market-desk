import { describe, expect, it } from "vitest";

import { localTestPageEnabled } from "@/lib/oa/dev-only";

describe("local OA mock page", () => {
  it("is hidden on the production host and shown in dev or on loopback", () => {
    expect(localTestPageEnabled("desk.modulargunworks.com", "production")).toBe(false);
    expect(localTestPageEnabled("127.0.0.1", "production")).toBe(true);
    expect(localTestPageEnabled("desk.modulargunworks.com", "development")).toBe(true);
  });
});
