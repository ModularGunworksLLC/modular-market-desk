/**
 * Pure decisions for the persisted web-comps queue.
 * A finished row must never be searched again after a restart.
 */

export const QUEUE_RESUME_STATUSES = ["queued", "running"] as const;

export const QUEUE_MAX_AGE_SEC = 24 * 60 * 60;

export type QueueTerminalStatus = "done" | "failed" | "weak" | "no-comps" | "budget" | "expired";

export function isResumableQueueStatus(status: string): boolean {
  return status === "queued" || status === "running";
}

/** Map one enrich attempt onto a terminal row. Finished rows are not reloaded. */
export function terminalStatusForEnrich(result: {
  ok: boolean;
  error?: string | null;
  confidence?: string | null;
  count?: number;
}): { status: Exclude<QueueTerminalStatus, "budget" | "expired">; error: string | null } {
  if (!result.ok) {
    return { status: "failed", error: (result.error ?? "enrich failed").slice(0, 300) };
  }
  const count = result.count ?? 0;
  if (count <= 0) return { status: "no-comps", error: null };
  const confidence = (result.confidence ?? "").toLowerCase();
  if (confidence === "high") return { status: "done", error: null };
  return { status: "weak", error: null };
}

/**
 * A valuation/web-stats note that means the lookup already finished.
 * A still-queued drip is not final.
 */
export function isFinalWebCompsNote(note: string | null | undefined): boolean {
  const text = (note ?? "").trim();
  if (!text) return false;
  if (/not looked up|daily limit/i.test(text)) return true;
  if (/\bqueued\b/i.test(text)) return false;
  return /weak|no oa comps|street asks|not solds|enrich failed|tavily/i.test(text);
}

export function cleanupQueueStatus(row: {
  status: string;
  updatedAtSec: number;
  hasFinalWebResult: boolean;
}, nowSec: number, maxAgeSec = QUEUE_MAX_AGE_SEC): "done" | "expired" | null {
  if (!isResumableQueueStatus(row.status)) return null;
  if (row.hasFinalWebResult) return "done";
  if (nowSec - row.updatedAtSec >= maxAgeSec) return "expired";
  return null;
}

/** Resumed work uses the same daily budget. Overflow is labeled, not queued again. */
export function planResume<T>(items: T[], processedToday: number, maxPerDay: number): {
  resume: T[];
  overCap: T[];
} {
  const room = Math.max(0, Math.floor(maxPerDay) - Math.max(0, processedToday));
  return { resume: items.slice(0, room), overCap: items.slice(room) };
}
