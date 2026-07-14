const url = process.argv[2] ?? "https://www.modulargunworks.com/";
const t = await (await fetch(url)).text();
const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
let m;
let c = 0;
while ((m = re.exec(t))) {
  c++;
  console.log(`\n=== JSON-LD block ${c} ===`);
  try {
    console.log(JSON.stringify(JSON.parse(m[1]), null, 2).slice(0, 4000));
  } catch {
    console.log(m[1].slice(0, 2000));
  }
}
console.log("\nTotal blocks:", c);
console.log("Product mentions:", (t.match(/"@type"\s*:\s*"Product"/g) || []).length);
