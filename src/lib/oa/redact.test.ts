import { describe, expect, it } from "vitest";

import { redactLiteral, redactSecrets } from "@/lib/vault";

const FAKE =
  "eyJhbGciOiJub25lIn0.eyJleHAiOjE4MDAwMDAwMDAsInN1YiI6ImZha2Utb2EtdGVzdCJ9.fake-signature-not-a-real-token";

describe("token redaction", () => {
  it("strips a JWT and an arbitrary secret from text that might be logged", () => {
    const line = `probe failed Authorization: Bearer ${FAKE} raw=${FAKE}`;
    const redacted = redactSecrets(line);
    expect(redacted).not.toContain(FAKE);
    expect(redacted).not.toContain("eyJhbGci");
    expect(redacted).toContain("[redacted");

    const odd = "session-token-value-that-is-not-a-jwt";
    expect(redactLiteral(`save failed: ${odd}`, odd)).not.toContain(odd);
  });
});
