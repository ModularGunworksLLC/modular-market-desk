"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { OaConnectionState } from "@/lib/oa/status";

interface StatusPayload {
  ok?: boolean;
  state?: OaConnectionState;
  message?: string;
  connectHref?: string;
}

const TONE: Record<OaConnectionState, string> = {
  connected: "border-desk-border bg-desk-panel text-desk-text",
  expiring_soon: "border-desk-warn/60 bg-desk-warn/15 text-desk-text",
  expired: "border-desk-nogo/70 bg-desk-nogo/15 text-desk-text",
  unauthorized: "border-desk-nogo/70 bg-desk-nogo/15 text-desk-text",
  not_connected: "border-desk-nogo/50 bg-desk-nogo/10 text-desk-text",
};

export function OaStatusBanner() {
  const [status, setStatus] = useState<StatusPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/vault/status", { cache: "no-store" });
        const body = (await res.json()) as StatusPayload;
        if (!cancelled) setStatus(body);
      } catch {
        if (!cancelled) {
          setStatus({ state: "not_connected", message: "Could not read OA status." });
        }
      }
    }
    void load();
    const onChange = () => void load();
    window.addEventListener("desk-oa-status-changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("desk-oa-status-changed", onChange);
    };
  }, []);

  if (!status?.message || !status.state) return null;
  const tone = TONE[status.state] ?? TONE.not_connected;
  const href = status.connectHref || "/import#connect-oa";

  return (
    <div className={`border-b px-4 py-2 text-sm ${tone}`}>
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-2">
        <p>{status.message}</p>
        {status.state !== "connected" && (
          <Link href={href} className="text-xs font-semibold text-desk-accent hover:underline">
            Connect OA
          </Link>
        )}
      </div>
    </div>
  );
}
