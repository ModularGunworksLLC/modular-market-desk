import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL ?? "file:./data/desk.db";
const client = createClient({ url });

const r = await client.execute("SELECT vendor, kind, status, label, meta FROM connections");
console.log(JSON.stringify(r.rows, null, 2));
