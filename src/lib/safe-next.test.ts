import { describe, expect, it } from "vitest";

import { safeInternalPath } from "@/lib/safe-next";

describe("safeInternalPath", () => {
  it("allows desk paths and rejects scheme-relative redirects", () => {
    expect(safeInternalPath("/import")).toBe("/import");
    expect(safeInternalPath("/oa-connect")).toBe("/oa-connect");
    expect(safeInternalPath("//evil.example")).toBe("/");
    expect(safeInternalPath("/\\evil.example")).toBe("/");
    expect(safeInternalPath("https://evil.example")).toBe("/");
    expect(safeInternalPath("")).toBe("/");
    expect(safeInternalPath(null)).toBe("/");
  });
});
