import { afterEach, describe, expect, it, vi } from "vitest";

import { assertPlaidConfigured, isPlaidEnabled, plaidEnv } from "./config";

describe("isPlaidEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when credentials missing", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "");
    vi.stubEnv("PLAID_SECRET", "");
    expect(isPlaidEnabled()).toBe(false);
  });

  it("is true when both credentials set", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    expect(isPlaidEnabled()).toBe(true);
  });
});

describe("plaidEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to sandbox", () => {
    vi.stubEnv("PLAID_ENV", undefined);
    expect(plaidEnv()).toBe("sandbox");
  });

  it("returns production when set", () => {
    vi.stubEnv("PLAID_ENV", "production");
    expect(plaidEnv()).toBe("production");
  });

  it("falls back to sandbox for unknown value", () => {
    vi.stubEnv("PLAID_ENV", "invalid");
    expect(plaidEnv()).toBe("sandbox");
  });
});

describe("assertPlaidConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when not configured", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "");
    expect(() => assertPlaidConfigured()).toThrow(/not configured/i);
  });
});
