import { createClient } from "@libsql/client";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:./data/desk.db" });
const r = await c.execute(
  "select id, kind, status, started_at, finished_at, row_count, error, meta from oa_sync_runs order by started_at desc limit 3",
);
for (const row of r.rows) {
  const meta =
    typeof row.meta === "string"
      ? (() => {
          try {
            return JSON.parse(row.meta);
          } catch {
            return row.meta;
          }
        })()
      : row.meta;
  console.log(
    JSON.stringify(
      {
        id: row.id,
        kind: row.kind,
        status: row.status,
        started_at: row.started_at,
        finished_at: row.finished_at,
        row_count: row.row_count,
        error: row.error,
        phase: meta && typeof meta === "object" ? (meta as { phase?: string }).phase : null,
        compsProgress:
          meta && typeof meta === "object"
            ? (meta as { compsProgress?: unknown }).compsProgress
            : null,
      },
      null,
      2,
    ),
  );
}
await c.close();
