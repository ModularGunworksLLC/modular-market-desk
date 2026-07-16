import * as https from "node:https";
import { writeFileSync } from "node:fs";

function get(url) {
  return new Promise((res, rej) => {
    https
      .get(url, { rejectUnauthorized: false, headers: { "User-Agent": "ModularMarketDesk/1.0" } }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(d));
      })
      .on("error", rej);
  });
}

const d = await get("https://www.hotgunz.com/search.php?serial=ZZZZNOPE999");
writeFileSync("tmp-hotgunz.html", d);
const text = d
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
console.log("TEXT:", text);
console.log("tables", (d.match(/<table/gi) || []).length);
console.log("inputs", (d.match(/<input/gi) || []).length);
console.log("has serial in body outside form?", /94114777|ZZZZNOPE999/i.test(d));
