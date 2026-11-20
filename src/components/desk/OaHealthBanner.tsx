"use client";

import { useEffect, useState } from "react";

import { formatOaHealthBanner } from "@/lib/oa/health";

type Status = {
  hasToken?: boolean;
  lastRun?: { error?: string | null } | null;
  comps?: { lastSyncedAt?: string | null } | null;
  issues?: string[];
};

export function OaHealthBanner() {
  const [text, setText] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "bad">("warn");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/oa/sync-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: Status | null) => {
        if (cancelled || !json) return;
        const banner = formatOaHealthBanner({
          hasToken: Boolean(json.hasToken),
          lastError: json.lastRun?.error || json.issues?.[0] || null,
          lastSyncedAt: json.comps?.lastSyncedAt ?? null,
        });
        setTone(banner.tone);
        setText(banner.text);
      })
      .catch(() => {
        if (!cancelled) {
          setTone("warn");
          setText("OA health could not be read. Comps may be stale until the token is checked on Import.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!text) return null;
  const toneClass =
    tone === "bad"
      ? "border-desk-nogo/50 bg-desk-nogo/10 text-desk-nogo"
      : tone === "ok"
        ? "border-desk-go/40 bg-desk-go/10 text-desk-go"
        : "border-desk-warn/40 bg-desk-warn/10 text-desk-text";
  return (
    <p className={`rounded-md border px-3 py-2 text-xs ${toneClass}`} role="status">
      {text}
    </p>
  );
}
