import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";

import { resetWebCompsBootForTests, startWebCompsOnBoot, webCompsBootStarted } from "./boot";
import {
  cleanupQueueStatus,
  isFinalWebCompsNote,
  planResume,
  terminalStatusForEnrich,
} from "./queue-lifecycle";
import {
  cleanupResumableItems,
  listQueueItems,
  loadResumableItems,
  saveQueueItem,
  settleResumeCap,
} from "./queue-store";
import type { WebIdentity } from "./types";

const identity: WebIdentity = { manufacturer: "Henry", model: "H012X", caliber: ".44 Magnum" };

function memory(): Client {
  return createClient({ url: ":memory:" });
}

const clients: Client[] = [];

afterEach(() => {
  for (const client of clients) client.close();
  clients.length = 0;
  resetWebCompsBootForTests();
});

function track(): Client {
  const client = memory();
  clients.push(client);
  return client;
}

describe("terminal queue status", () => {
  it("persists a finished lookup as done and does not reload it", async () => {
    const client = track();
    const terminal = terminalStatusForEnrich({ ok: true, confidence: "high", count: 4 });
    expect(terminal.status).toBe("done");
    await saveQueueItem(client, {
      key: "henry|h012x",
      identity,
      status: terminal.status,
      error: terminal.error,
      finishedAtSec: 1_700_000_000,
    });
    await saveQueueItem(client, {
      key: "still-waiting",
      identity: { ...identity, model: "Golden Boy" },
      status: "queued",
    });
    const resumable = await loadResumableItems(client);
    expect(resumable.map((row) => row.key)).toEqual(["still-waiting"]);
    const all = await listQueueItems(client);
    expect(all.find((row) => row.key === "henry|h012x")?.status).toBe("done");
    expect(all.find((row) => row.key === "henry|h012x")?.finishedAtSec).toBe(1_700_000_000);
  });

  it("records weak and no-comps as terminal, not queued", () => {
    expect(terminalStatusForEnrich({ ok: true, confidence: "medium", count: 2 }).status).toBe("weak");
    expect(terminalStatusForEnrich({ ok: true, confidence: "low", count: 0 }).status).toBe("no-comps");
    expect(terminalStatusForEnrich({ ok: false, error: "Tavily down" })).toEqual({
      status: "failed",
      error: "Tavily down",
    });
  });
});

describe("resume and cleanup", () => {
  it("restarts only queued and running rows", async () => {
    const client = track();
    await saveQueueItem(client, { key: "q", identity, status: "queued" });
    await saveQueueItem(client, {
      key: "run",
      identity: { ...identity, model: "Big Boy" },
      status: "running",
    });
    await saveQueueItem(client, {
      key: "fin",
      identity: { ...identity, model: "Golden Boy" },
      status: "done",
      finishedAtSec: 10,
    });
    const resumable = await loadResumableItems(client);
    expect(resumable.map((row) => row.key).sort()).toEqual(["q", "run"]);
  });

  it("marks a final valuation done and a 24h-old row expired, and leaves a fresh row", async () => {
    const client = track();
    const now = 1_800_000_000;
    await saveQueueItem(client, { key: "final", identity, status: "queued" });
    await saveQueueItem(client, {
      key: "old",
      identity: { ...identity, model: "Old" },
      status: "running",
    });
    await client.execute({
      sql: "UPDATE web_comps_queue SET updated_at = ? WHERE canonical_key = 'old'",
      args: [now - 25 * 60 * 60],
    });
    await saveQueueItem(client, {
      key: "fresh",
      identity: { ...identity, model: "Fresh" },
      status: "queued",
    });
    await client.execute({
      sql: "UPDATE web_comps_queue SET updated_at = ? WHERE canonical_key = 'fresh'",
      args: [now - 60],
    });
    await client.execute({
      sql: "UPDATE web_comps_queue SET updated_at = ? WHERE canonical_key = 'final'",
      args: [now - 60],
    });

    const changed = await cleanupResumableItems(client, {
      nowSec: now,
      maxAgeSec: 24 * 60 * 60,
      hasFinalWebResult: (row) => row.key === "final",
    });
    expect(changed).toBe(2);
    const again = await cleanupResumableItems(client, {
      nowSec: now,
      maxAgeSec: 24 * 60 * 60,
      hasFinalWebResult: (row) => row.key === "final",
    });
    expect(again).toBe(0);

    const rows = await listQueueItems(client);
    expect(rows.find((row) => row.key === "final")?.status).toBe("done");
    expect(rows.find((row) => row.key === "old")?.status).toBe("expired");
    expect(rows.find((row) => row.key === "fresh")?.status).toBe("queued");
    expect((await loadResumableItems(client)).map((row) => row.key)).toEqual(["fresh"]);
  });

  it("uses the pure cleanup rule for final notes and age", () => {
    expect(isFinalWebCompsNote("Street asks only (n=11) — not solds; no OA Max Bid")).toBe(true);
    expect(isFinalWebCompsNote("No OA solds — queued street-ask enrich")).toBe(false);
    const now = 1_000_000;
    expect(
      cleanupQueueStatus(
        { status: "queued", updatedAtSec: now - 10, hasFinalWebResult: true },
        now,
      ),
    ).toBe("done");
    expect(
      cleanupQueueStatus(
        { status: "done", updatedAtSec: now - 100_000, hasFinalWebResult: false },
        now,
      ),
    ).toBeNull();
  });

  it("applies the daily cap to resumed items and labels the overflow", async () => {
    const plan = planResume(["a", "b", "c"], 49, 50);
    expect(plan.resume).toEqual(["a"]);
    expect(plan.overCap).toEqual(["b", "c"]);

    const client = track();
    const now = 1_800_000_000;
    for (const key of ["a", "b", "c"]) {
      await saveQueueItem(client, {
        key,
        identity: { ...identity, model: key },
        status: "queued",
      });
    }
    const rows = (await loadResumableItems(client)).sort((a, b) => a.key.localeCompare(b.key));
    const label = "Web-comps daily limit reached (50/day) — this row was not looked up";
    const resume = await settleResumeCap(client, rows, 49, 50, label, now);
    expect(resume.map((row) => row.key)).toEqual(["a"]);
    const stored = await listQueueItems(client);
    expect(stored.find((row) => row.key === "b")?.status).toBe("budget");
    expect(stored.find((row) => row.key === "b")?.error).toBe(label);
    expect(stored.find((row) => row.key === "c")?.status).toBe("budget");
    expect((await loadResumableItems(client)).map((row) => row.key)).toEqual(["a"]);
  });
});

describe("boot hook", () => {
  it("starts the worker exactly once", async () => {
    let starts = 0;
    const start = async () => {
      starts += 1;
    };
    await Promise.all([startWebCompsOnBoot(start), startWebCompsOnBoot(start)]);
    await startWebCompsOnBoot(start);
    expect(starts).toBe(1);
    expect(webCompsBootStarted()).toBe(true);
  });
});
