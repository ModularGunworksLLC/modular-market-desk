import { describe, expect, it } from "vitest";

import { buildOaBookmarkletHref, buildOaBookmarkletSource } from "@/lib/oa/bookmarklet";

const SAMPLE = "eyJhbGciOiJub25lIn0.eyJleHAiOjE4MDAwMDAwMDB9.fake-signature-not-a-real-token";

describe("Connect OA bookmarklet", () => {
  it("posts the token to the hard-coded Desk origin and never puts it in a URL", () => {
    const source = buildOaBookmarkletSource({
      deskOrigin: "https://desk.modulargunworks.com",
      storageKey: "gb_session_token",
      allowInsecureLoopback: false,
    });
    const href = buildOaBookmarkletHref({
      deskOrigin: "https://desk.modulargunworks.com",
      storageKey: "gb_session_token",
      allowInsecureLoopback: false,
    });
    expect(href.startsWith("javascript:")).toBe(true);
    expect(source).toContain("https://desk.modulargunworks.com");
    expect(source).toContain("gb_session_token");
    expect(source).toContain("postMessage");
    expect(source).toContain("ev.source!==popup");
    expect(source).toContain("Click Save");
    expect(source).toContain('"/oa-connect"');
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("?token");
    expect(source).not.toContain("searchParams");
    expect(source).not.toContain(SAMPLE);
    expect(href).not.toContain(SAMPLE);
  });

  it("allows http only for a loopback Desk and refuses any other http origin", () => {
    expect(() =>
      buildOaBookmarkletSource({
        deskOrigin: "http://127.0.0.1:3000",
        storageKey: "gb_session_token",
        allowInsecureLoopback: true,
      }),
    ).not.toThrow();
    expect(() =>
      buildOaBookmarkletSource({
        deskOrigin: "http://desk.example.com",
        storageKey: "gb_session_token",
        allowInsecureLoopback: false,
      }),
    ).toThrow(/HTTPS/);
  });

  it("tells the OA page to sign in when the storage key is empty", () => {
    const source = buildOaBookmarkletSource({
      deskOrigin: "https://desk.modulargunworks.com",
      storageKey: "gb_session_token",
      allowInsecureLoopback: false,
    });
    expect(source).toContain("Sign in to Outdoor Analytics first");
  });
});
