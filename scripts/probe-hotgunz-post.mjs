import * as https from "node:https";
import { writeFileSync } from "node:fs";

function request(url, opts = {}) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opts.method || "GET",
        rejectUnauthorized: false,
        headers: {
          "User-Agent": "ModularMarketDesk/1.0",
          Accept: "text/html",
          ...(opts.headers || {}),
        },
      },
      (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res({ status: r.statusCode, headers: r.headers, body: d }));
      },
    );
    req.on("error", rej);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const serial = process.argv[2] || "ZZZZNOPE999";
const body = `q=${encodeURIComponent(serial)}`;
const r = await request("https://www.hotgunz.com/search.php", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": String(Buffer.byteLength(body)),
  },
  body,
});
writeFileSync("tmp-hotgunz-post.html", r.body);
const text = r.body
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
console.log("status", r.status, "len", r.body.length);
console.log("TEXT:", text.slice(0, 3000));
console.log("tables", (r.body.match(/<table/gi) || []).length);
console.log("contains serial", r.body.toLowerCase().includes(serial.toLowerCase()));
