"use client";

import { useActionState } from "react";

import { revokeConnectionAction, saveConnection, type ActionResult } from "@/lib/actions/vault";
import type { ConnectionView } from "@/lib/import/types";
import { timeAgo } from "@/lib/format";

export function ConnectionVault({ connections }: { connections: ConnectionView[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(saveConnection, null);

  return (
    <section className="panel">
      <h2 className="mb-3 text-sm font-semibold text-desk-muted">Session Vault</h2>

      {/* Existing connections (no secrets ever rendered) */}
      {connections.length > 0 && (
        <ul className="mb-4 space-y-2">
          {connections.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-desk-muted">
                  {c.kind} &middot; updated {timeAgo(c.updatedAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    c.status === "active"
                      ? "bg-desk-go/20 text-desk-go"
                      : "bg-desk-nogo/20 text-desk-nogo"
                  }`}
                >
                  {c.status}
                </span>
                {c.status === "active" && (
                  <form action={revokeConnectionAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-desk-muted hover:text-desk-nogo">Revoke</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Paste a new token / session string */}
      <form action={formAction} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Vendor</label>
            <input
              className="field-input"
              name="vendor"
              placeholder="outdoor_analytics"
              list="vault-vendor-options"
              defaultValue="outdoor_analytics"
            />
            <datalist id="vault-vendor-options">
              <option value="outdoor_analytics" />
              <option value="lipseys" />
              <option value="zanders" />
              <option value="davidsons" />
              <option value="chattanooga" />
              <option value="2ndamendmentwholesale" />
              <option value="orion" />
              <option value="rsr" />
              <option value="shootingwarehouse" />
              <option value="pawholesale" />
              <option value="bearcreekarsenal" />
              <option value="palmettostatearmory" />
              <option value="dpms" />
              <option value="lakeline" />
              <option value="righttobear" />
            </datalist>
          </div>
          <div>
            <label className="field-label">Kind</label>
            <select className="field-input" name="kind" defaultValue="market_api">
              <option value="market_api">market_api (bearer / Lipsey Token)</option>
              <option value="vendor_session">vendor_session (cookie string)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Label</label>
          <input className="field-input" name="label" placeholder="Outdoor Analytics" />
        </div>
        <div>
          <label className="field-label">Feed URL (CSV / Lipsey CatalogFeed)</label>
          <input
            className="field-input font-mono text-xs"
            name="feedUrl"
            placeholder="https://... (optional; or TAW_FEED_URL in .env)"
          />
        </div>
        <div>
          <label className="field-label">Catalog / portal URL (Firecrawl)</label>
          <input
            className="field-input font-mono text-xs"
            name="catalogUrl"
            placeholder="https://dealer-portal/.../inventory (optional override)"
          />
        </div>
        <div>
          <label className="field-label">Token / session string (encrypted at rest)</label>
          <textarea
            className="field-input min-h-[80px] font-mono text-xs"
            name="secret"
            placeholder="Paste bearer token or cookie string..."
          />
        </div>
        <div>
          <label className="field-label">Expires (optional)</label>
          <input className="field-input" type="datetime-local" name="expiresAt" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Encrypting & saving..." : "Save to vault"}
        </button>
        {state && <p className={`text-sm ${state.ok ? "text-desk-go" : "text-desk-nogo"}`}>{state.message}</p>}
      </form>

      <p className="mt-3 text-[11px] text-desk-muted">
        Secrets are AES-256-GCM encrypted with <code>SESSION_VAULT_KEY</code> and never returned to the
        browser. Outbound vendor/API lookups ride these session strings to bypass automated-login
        firewalls, age gates, and Cloudflare.
      </p>
    </section>
  );
}
