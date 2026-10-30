"use client";

import { useState } from "react";

export function ConnectOaCard({
  bookmarkletHref,
  storageKey,
  deskOrigin,
  keyVerifiedInBundle,
}: {
  bookmarkletHref: string;
  storageKey: string;
  deskOrigin: string;
  keyVerifiedInBundle: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"clear" | "probe" | null>(null);

  async function clearToken() {
    setPending("clear");
    setNotice(null);
    try {
      const res = await fetch("/api/vault/oa", { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setNotice(body?.message || (res.ok ? "OA token cleared." : "Could not clear the OA token."));
      window.dispatchEvent(new Event("desk-oa-status-changed"));
    } catch {
      setNotice("Could not clear the OA token.");
    } finally {
      setPending(null);
    }
  }

  async function recheck() {
    setPending("probe");
    setNotice(null);
    try {
      const res = await fetch("/api/vault/status?probe=1", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setNotice(body?.message || "OA status updated.");
      window.dispatchEvent(new Event("desk-oa-status-changed"));
    } catch {
      setNotice("Could not re-check OA.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section id="connect-oa" className="panel scroll-mt-24">
      <h2 className="mb-1 text-sm font-semibold text-desk-text">Connect OA</h2>
      <p className="mb-3 text-xs text-desk-muted">
        Drag <span className="text-desk-text">Connect OA</span> to the bookmarks bar once. Sign in at
        hub.outdooranalytics.com, then click the bookmark. Desk stores the session encrypted and reads
        the expiry from the token. This link is locked to <span className="font-mono">{deskOrigin}</span>.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="#connect-oa"
          draggable
          ref={(node) => {
            // React 19 replaces javascript: hrefs with a throw. Set the bookmarklet
            // on the DOM node after commit so the dragged link is the real script.
            if (node) node.setAttribute("href", bookmarkletHref);
          }}
          onClick={(e) => {
            e.preventDefault();
            setNotice("Drag Connect OA to the bookmarks bar. Click it on Outdoor Analytics, not on this page.");
          }}
          className="inline-flex cursor-grab rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white active:cursor-grabbing"
        >
          Connect OA
        </a>
        <button
          type="button"
          onClick={() => void recheck()}
          disabled={pending != null}
          className="rounded-md border border-desk-border px-3 py-2 text-xs text-desk-muted hover:text-desk-text disabled:opacity-50"
        >
          {pending === "probe" ? "Checking…" : "Re-check token"}
        </button>
        <button
          type="button"
          onClick={() => void clearToken()}
          disabled={pending != null}
          className="rounded-md border border-desk-border px-3 py-2 text-xs text-desk-muted hover:text-desk-nogo disabled:opacity-50"
        >
          {pending === "clear" ? "Clearing…" : "Clear OA token"}
        </button>
        <a href="/oa-mock.html" className="text-xs text-desk-accent hover:underline">
          Local test page
        </a>
      </div>
      <p className="mt-3 text-[11px] text-desk-muted">
        Session key <code>{storageKey}</code>
        {keyVerifiedInBundle
          ? " — found in the public Outdoor Analytics app (sessionStorage.getItem). Not confirmed by signing in."
          : " — override via OA_SESSION_STORAGE_KEY. The default key was not confirmed in this build."}
        {" "}
        The token is posted into a Desk window and is never put in the bookmark URL.
      </p>
      {notice && <p className="mt-2 text-sm text-desk-text">{notice}</p>}
    </section>
  );
}
