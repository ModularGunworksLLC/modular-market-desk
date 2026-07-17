"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const body = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setError(body.error || "Login failed");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-desk-text">Desk access</h1>
      <p className="mt-2 text-sm text-desk-muted">
        Enter the shared desk secret (<code className="text-desk-text">DESK_AUTH_SECRET</code>) to
        unlock evaluate, vault, and sync.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
          Secret
          <input
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 font-mono text-sm text-desk-text"
            required
          />
        </label>
        {error && <p className="text-sm text-desk-nogo">{error}</p>}
        <button
          type="submit"
          disabled={pending || !secret.trim()}
          className="w-full rounded bg-desk-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Checking…" : "Unlock desk"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8 text-desk-muted">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
