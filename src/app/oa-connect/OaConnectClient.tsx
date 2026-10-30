"use client";

import { useEffect, useRef, useState } from "react";

import { acceptHandoffMessage, canSave, previewOaToken, type HandoffPreview } from "@/lib/oa/handoff";

export function OaConnectClient({
  allowedOrigins,
  confirmRequired,
  confirmLabel,
}: {
  allowedOrigins: string[];
  confirmRequired: boolean;
  confirmLabel: string;
}) {
  const tokenRef = useRef<string | null>(null);
  const replyOrigin = useRef<string | null>(null);
  const [phase, setPhase] = useState<"waiting" | "confirm" | "saving" | "done">("waiting");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [preview, setPreview] = useState<HandoffPreview | null>(null);
  const [confirmSecret, setConfirmSecret] = useState("");
  const [message, setMessage] = useState("Waiting for Outdoor Analytics…");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (phaseRef.current === "saving" || phaseRef.current === "done") return;
      const token = acceptHandoffMessage({
        origin: event.origin,
        source: event.source,
        opener: window.opener,
        allowedOrigins,
        data: event.data,
      });
      if (!token) return;
      tokenRef.current = token;
      replyOrigin.current = event.origin;
      const next = previewOaToken(token);
      setPreview(next);
      setPhase("confirm");
      setOk(null);
      setMessage(
        next.malformed
          ? "This does not look like a JWT with an exp claim. Nothing was saved."
          : `Save OA session expiring at ${next.expiresAtChicago} (${next.hoursLabel})?`,
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowedOrigins]);

  async function onSave() {
    if (!canSave(phaseRef.current)) return;
    const token = tokenRef.current;
    if (!token || preview?.malformed) return;
    if (confirmRequired && !confirmSecret.trim()) {
      setMessage(`Enter the ${confirmLabel} before saving. Nothing was saved.`);
      setOk(false);
      return;
    }
    phaseRef.current = "saving";
    setPhase("saving");
    setMessage("Saving to the Session Vault…");
    let result = { ok: false, message: "OA connect failed." };
    try {
      const res = await fetch("/api/vault/oa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, confirmSecret }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      result = {
        ok: Boolean(res.ok && body?.ok),
        message: typeof body?.message === "string" ? body.message : result.message,
      };
    } catch {
      result = { ok: false, message: "OA connect failed. Desk could not be reached." };
    }
    tokenRef.current = null;
    setConfirmSecret("");
    setOk(result.ok);
    setMessage(result.message);
    setPhase("done");
    const opener = window.opener as Window | null;
    const origin = replyOrigin.current;
    if (opener && origin && allowedOrigins.includes(origin) && typeof opener.postMessage === "function") {
      opener.postMessage({ type: "desk-oa-token-result", ok: result.ok, message: result.message }, origin);
    }
  }

  const tone = ok == null ? "text-desk-muted" : ok ? "text-desk-go" : "text-desk-nogo";

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-2 text-lg font-semibold">Connect Outdoor Analytics</h1>
      <p className={`text-sm ${tone}`}>{message}</p>
      {preview && !preview.malformed && (
        <p className="mt-2 text-xs text-desk-muted">
          {preview.suspicious ? "Expiry is more than 30 days out. " : ""}
          {preview.iss ? `iss ${preview.iss} (display only). ` : ""}
          {preview.aud ? `aud ${preview.aud} (display only). ` : ""}
          Claims are not verified.
        </p>
      )}
      {phase === "confirm" && preview && !preview.malformed && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          {confirmRequired && (
            <label className="block text-xs text-desk-muted">
              {confirmLabel}
              <input
                type="password"
                autoComplete="current-password"
                value={confirmSecret}
                onChange={(e) => setConfirmSecret(e.target.value)}
                className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 font-mono text-sm text-desk-text"
              />
            </label>
          )}
          <button
            type="submit"
            className="rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Save
          </button>
        </form>
      )}
      <p className="mt-4 text-xs text-desk-muted">
        Nothing is stored until you click Save. If this window shows the Desk login, sign in and click
        the bookmark again. The token is not shown here and is not put in the address bar.
      </p>
    </main>
  );
}
