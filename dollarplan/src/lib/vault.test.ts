import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./vault";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("vault", () => {
  it("round-trips plaintext", () => {
    process.env.SESSION_VAULT_KEY = TEST_KEY;
    const plain = "access-sandbox-abc123";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("rejects malformed payload", () => {
    process.env.SESSION_VAULT_KEY = TEST_KEY;
    expect(() => decryptSecret("not-valid")).toThrow(/malformed/i);
  });

  it("requires SESSION_VAULT_KEY", () => {
    delete process.env.SESSION_VAULT_KEY;
    expect(() => encryptSecret("x")).toThrow(/SESSION_VAULT_KEY/i);
  });
});
