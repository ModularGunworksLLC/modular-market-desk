import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "oa-upgrade-"));
const dbFile = join(dir, "desk.db");
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.SESSION_VAULT_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

describe("upgradeAuditSeq", () => {
  it("finishes after an interrupted run that left audit_log_seq behind", async () => {
    const setup = createClient({ url: `file:${dbFile}` });
    await setup.executeMultiple(`
      CREATE TABLE audit_log (
        id text PRIMARY KEY NOT NULL,
        actor text NOT NULL,
        action text NOT NULL,
        target text NOT NULL DEFAULT 'outdoor_analytics',
        detail text NOT NULL DEFAULT '{}',
        created_at integer NOT NULL DEFAULT 1
      );
      INSERT INTO audit_log (id, actor, action, target, detail, created_at)
      VALUES ('row-1', 'desk-session', 'oa_token_set', 'outdoor_analytics', '{}', 1);
      CREATE TABLE audit_log_seq (
        seq integer PRIMARY KEY AUTOINCREMENT,
        actor text NOT NULL,
        action text NOT NULL,
        target text NOT NULL DEFAULT 'outdoor_analytics',
        detail text NOT NULL DEFAULT '{}',
        created_at integer NOT NULL DEFAULT (unixepoch())
      );
    `);
    setup.close();

    const { loadOaVault, latestOaAudit } = await import("@/lib/oa/vault-store");
    await loadOaVault();
    await loadOaVault();
    const rows = await latestOaAudit();
    expect(rows.some((row) => row.action === "oa_token_set" && row.actor === "desk-session")).toBe(true);

    const check = createClient({ url: `file:${dbFile}` });
    const tables = await check.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('audit_log', 'audit_log_seq')",
    );
    const names = tables.rows.map((row) => String(row.name));
    expect(names).toContain("audit_log");
    expect(names).not.toContain("audit_log_seq");
    const cols = await check.execute("PRAGMA table_info(audit_log)");
    expect(cols.rows.some((row) => String(row.name) === "seq")).toBe(true);
    check.close();
  });
});
