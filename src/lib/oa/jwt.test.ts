import { describe, expect, it } from "vitest";

import { decodeJwtExp, jwtShapeOk } from "@/lib/oa/jwt";

function fakeJwt(payload: unknown, header: unknown = { alg: "none", typ: "JWT" }): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc(header)}.${enc(payload)}.fake-signature-not-a-real-token`;
}

describe("decodeJwtExp", () => {
  it("reads a numeric exp claim without verifying the signature", () => {
    const exp = 1_800_000_000;
    const date = decodeJwtExp(fakeJwt({ exp, sub: "fake-oa-test" }));
    expect(date?.toISOString()).toBe(new Date(exp * 1000).toISOString());
  });

  it("rejects a token that is not three bounded base64url segments", () => {
    expect(jwtShapeOk(fakeJwt({ exp: 1_800_000_000 }))).toBe(true);
    expect(jwtShapeOk("not-a-jwt")).toBe(false);
    expect(jwtShapeOk(`${"a".repeat(9000)}.bbb.ccc`)).toBe(false);
  });

  it("returns null for malformed tokens and does not throw", () => {
    expect(decodeJwtExp("")).toBeNull();
    expect(decodeJwtExp("not-a-jwt")).toBeNull();
    expect(decodeJwtExp("a.b")).toBeNull();
    expect(decodeJwtExp("aaa.!!!.ccc")).toBeNull();
    expect(decodeJwtExp(fakeJwt({ exp: "1800000000" }))).toBeNull();
    expect(decodeJwtExp(fakeJwt({ sub: "no-exp" }))).toBeNull();
    expect(decodeJwtExp(fakeJwt({ exp: -1 }))).toBeNull();
    expect(decodeJwtExp(fakeJwt({ exp: Number.NaN }))).toBeNull();
    expect(decodeJwtExp(fakeJwt({ exp: 1_800_000_000_000 }))).toBeNull();
  });
});
