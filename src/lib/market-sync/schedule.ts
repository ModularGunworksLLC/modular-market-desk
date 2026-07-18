/**
 * Opportunistic weekly kick: when Import/status is polled and last run is >6.5 days old,
 * start a background weekly sync (Lightsail long-running Node).
 */

import "server-only";

import {
  getMarketSyncStatus,
  isWeeklyMarketSyncRunning,
  startWeeklyMarketSync,
} from "@/lib/market-sync/weekly";

const WEEK_MS = 6.5 * 24 * 60 * 60 * 1000;

export async function maybeKickWeeklyMarketSync(): Promise<{
  kicked: boolean;
  reason: string;
}> {
  if (isWeeklyMarketSyncRunning()) {
    return { kicked: false, reason: "already_running" };
  }
  if (process.env.MARKET_SYNC_AUTO_WEEKLY === "0") {
    return { kicked: false, reason: "disabled" };
  }

  const status = await getMarketSyncStatus();
  const finished = status.lastRun?.finishedAt ?? status.lastRun?.startedAt;
  if (finished) {
    const age = Date.now() - new Date(finished).getTime();
    if (Number.isFinite(age) && age < WEEK_MS) {
      return { kicked: false, reason: "fresh" };
    }
  }

  const started = startWeeklyMarketSync({});
  return {
    kicked: started.started,
    reason: started.alreadyRunning ? "already_running" : "started",
  };
}
