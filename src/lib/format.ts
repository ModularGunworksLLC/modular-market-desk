/** Shared display formatters (safe in client and server components). */

export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function intFmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US");
}

/**
 * Parse a money/number form field. Returns null for empty or non-finite input
 * (fail closed — callers should reject rather than coerce to 0).
 */
export function parseMoneyField(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a required money field; empty becomes 0 only when allowEmptyAsZero is true.
 */
export function parseMoneyFieldOrZero(raw: string | number | null | undefined): number {
  const n = parseMoneyField(raw);
  return n == null ? 0 : n;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
