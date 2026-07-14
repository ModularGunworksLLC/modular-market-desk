import { createClient } from "@libsql/client";

const url = process.argv[2] ?? "file:./data/desk.db";
const c = createClient({ url });
const r = await c.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1",
);
console.log(r.rows.map((x) => x.name).join("\n"));
c.close();
