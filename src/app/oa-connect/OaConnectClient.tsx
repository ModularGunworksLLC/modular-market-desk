"use client";

import { useEffect, useState } from "react";

export function OaConnectClient({ allowedOrigins }: { allowedOrigins: string[] }) {
  const [message, setMessage] = useState("Waiting for Outdoor Analytics…");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let finished = false;

    function onMessage(event: MessageEvent) {
      if (finished) return;
      if (!allowedOrigins.includes(event.origin)) return;
      const data = event.data as { type?: unknown; token?: unknown } | null;
      if (!data || data.type !== "desk-oa-token" || typeof data.token !== "string" || !data.token) return;
      finished = true;
      const token = data.token;
      setMessage("Saving to the Session Vault…");
      void (async () => {
        let result = { ok: false, message: "OA connect failed." };
        try {
          const res = await fetch("/api/vault/oa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ token }),
          });
          const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
          result = {
            ok: Boolean(res.ok && body?.ok),
            message: typeof body?.message === "string" ? body.message : result.message,
          };
        } catch {
          result = { ok: false, message: "OA connect failed. Desk could not be reached." };
        }
        setOk(result.ok);
        setMessage(result.message);
        const source = event.source;
        if (source && typeof (source as Window).postMessage === "function") {
          (source as Window).postMessage(
            { type: "desk-oa-token-result", ok: result.ok, message: result.message },
            event.origin,
          );
        }
      })();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowedOrigins]);

  const tone =
    ok == null ? "text-desk-muted" : ok ? "text-desk-go" : "text-desk-nogo";

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-2 text-lg font-semibold">Connect Outdoor Analytics</h1>
      <p className={`text-sm ${tone}`}>{message}</p>
      <p className="mt-4 text-xs text-desk-muted">
        If this window shows the Desk login, sign in. The bookmark keeps trying for about a minute.
        The token is not shown here and is not put in the address bar.
      </p>
    </main>
  );
}
