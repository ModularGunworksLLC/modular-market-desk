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
    expect(safeInternalPath(decodeURIComponent("/%09/evil.example"))).toBe("/");
    expect(safeInternalPath(decodeURIComponent("/%0a/evil.example"))).toBe("/");
    expect(safeInternalPath(decodeURIComponent("/%0d/evil.example"))).toBe("/");
    expect(safeInternalPath("/\t/evil.example")).toBe("/");
  });
});
