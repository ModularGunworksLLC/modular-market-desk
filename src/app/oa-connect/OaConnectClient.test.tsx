/** @vitest-environment happy-dom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OaConnectClient } from "./OaConnectClient";

function fakeJwt(expSeconds: number): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ exp: expSeconds, sub: "fake-oa-test" })}.fake-signature-not-a-real-token`;
}

function message(source: object, token: string): MessageEvent {
  const event = new MessageEvent("message", {
    origin: "https://hub.outdooranalytics.com",
    data: { type: "desk-oa-token", token },
  });
  Object.defineProperty(event, "source", { value: source });
  return event;
}

describe("OaConnectClient", () => {
  let root: Root | null = null;
  const opener = { id: "oa-opener" };

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "opener");
  });

  it("ignores a forged source, shows the expiry, and does not save until Save is clicked", async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 6 * 3600);
    let release: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "opener", { value: opener, configurable: true });

    const el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => {
      root?.render(
        <OaConnectClient
          allowedOrigins={["https://hub.outdooranalytics.com"]}
          confirmRequired={false}
          confirmLabel=""
        />,
      );
    });
    expect(el.textContent).toContain("Waiting for Outdoor Analytics");
    expect(el.querySelector("button")).toBeNull();

    await act(async () => {
      window.dispatchEvent(message({ id: "forged" }, token));
    });
    expect(el.querySelector("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.textContent?.includes("fake-signature-not-a-real-token")).toBe(false);

    await act(async () => {
      window.dispatchEvent(message(opener, token));
    });
    expect(el.textContent).toContain("Save OA session expiring at");
    expect(el.textContent).toMatch(/CDT|CST/);
    expect(el.querySelector("button")?.textContent).toBe("Save");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.textContent?.includes("fake-signature-not-a-real-token")).toBe(false);

    const button = el.querySelector("button");
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(el.textContent).toContain("Saving to the Session Vault");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(message(opener, token));
    });
    expect(el.textContent).toContain("Saving to the Session Vault");
    expect(el.textContent).not.toContain("Save OA session expiring at");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(new Response(JSON.stringify({ ok: true, message: "OA connected to Desk." }), { status: 200 }));
    });
    expect(el.textContent).toContain("OA connected to Desk.");
  });
});
