/**
 * Download RSR inventory from FTP and upsert into catalog_items.
 *
 * Credentials (never commit): set in `.env`
 *   RSR_FTP_HOST=ftp.rsrgroup.com
 *   RSR_FTP_USER=...
 *   RSR_FTP_PASSWORD=...
 *   RSR_FTP_SECURE=false   # true for explicit TLS
 *   RSR_FTP_DIR=ftpdownloads   # or keydealer
 *   RSR_FTP_REMOTE_PATH=rsrinventory-new.txt
 *
 * Local file (skip FTP):
 *   npx tsx scripts/pull-rsr-ftp.ts --file path/to/rsrinventory-new.txt
 */
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import * as ftp from "basic-ftp";

import { upsertRsrInventoryText } from "../src/lib/rsr/upsert";

function loadDotEnv(): void {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1]!;
      let val = m[2]!.trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
    }
  } catch {
    // no .env
  }
}

async function downloadViaFtp(localPath: string): Promise<void> {
  const host = (process.env.RSR_FTP_HOST ?? "ftp.rsrgroup.com").trim();
  const user = (process.env.RSR_FTP_USER ?? "").trim();
  const password = (process.env.RSR_FTP_PASSWORD ?? "").trim();
  const remoteName = (process.env.RSR_FTP_REMOTE_PATH ?? "rsrinventory-new.txt").trim();
  const dir = (process.env.RSR_FTP_DIR ?? "ftpdownloads").trim();
  const secure = /^(1|true|yes)$/i.test(process.env.RSR_FTP_SECURE ?? "");

  if (!user || !password) {
    throw new Error(
      "Missing RSR FTP credentials. Add RSR_FTP_USER and RSR_FTP_PASSWORD to .env",
    );
  }

  const client = new ftp.Client(90_000);
  client.ftp.verbose = true;
  try {
    console.log(`> connecting ${host} as ${user} (secure=${secure}) ...`);
    await client.access({
      host,
      user,
      password,
      secure,
      secureOptions: secure ? { rejectUnauthorized: false } : undefined,
    });
    const root = await client.list();
    console.log(
      `> root entries: ${root
        .slice(0, 20)
        .map((f) => f.name)
        .join(", ")}`,
    );

    // Prefer keydealer folder when present (special pricing file name).
    const names = new Set(root.map((f) => f.name.toLowerCase()));
    let useDir = dir;
    let useFile = remoteName;
    if (names.has("keydealer")) {
      useDir = "keydealer";
      useFile =
        process.env.RSR_FTP_REMOTE_PATH?.trim() || "rsrinventory-keydlr-new.txt";
      console.log(`> keydealer folder detected → ${useDir}/${useFile}`);
    } else if (names.has(dir.toLowerCase())) {
      console.log(`> using ${useDir}/${useFile}`);
    } else {
      console.log(`> no ${dir} folder in root; trying remote path as-is`);
      useDir = "";
    }

    if (useDir) await client.cd(useDir);
    console.log(`> downloading ${useFile} → ${localPath}`);
    await client.downloadTo(localPath, useFile);
  } finally {
    client.close();
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const localArg = fileIdx >= 0 ? args[fileIdx + 1] : null;

  mkdirSync(path.join("data", "imports"), { recursive: true });
  const localPath = localArg ?? path.join("data", "imports", "rsrinventory-new.txt");

  if (!localArg) {
    await downloadViaFtp(localPath);
  } else {
    console.log(`> using local file ${localPath}`);
  }

  const text = readFileSync(localPath, "utf8");
  console.log(
    `> file bytes=${Buffer.byteLength(text)} lines≈${text.split(/\r?\n/).length}`,
  );
  const report = await upsertRsrInventoryText(text, path.basename(localPath));
  console.log(
    `> parsed=${report.parsed} upserted=${report.upserted} skipped=${report.skipped}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
