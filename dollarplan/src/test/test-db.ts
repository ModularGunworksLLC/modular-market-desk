import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { Client } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { vi } from "vitest";

let testDbPath: string;

declare global {
  // eslint-disable-next-line no-var
  var __dollarplanLibsql: Client | undefined;
}

/** Isolated SQLite file + migrations for service integration tests. */
export async function bootstrapTestDb(): Promise<void> {
  const dir = join(process.cwd(), "data", "vitest");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  testDbPath = join(dir, `test-${Date.now()}.db`);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.resetModules();

  const { db } = await import("@/lib/db");
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
}

export async function cleanupTestDb(): Promise<void> {
  if (globalThis.__dollarplanLibsql) {
    await globalThis.__dollarplanLibsql.close();
    globalThis.__dollarplanLibsql = undefined;
  }
  vi.resetModules();
  if (testDbPath && existsSync(testDbPath)) {
    try {
      rmSync(testDbPath, { force: true });
    } catch {
      // Windows may still hold a brief lock — ignore cleanup failure.
    }
  }
  vi.unstubAllEnvs();
}
