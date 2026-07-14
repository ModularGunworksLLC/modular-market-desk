const t = await (await fetch("https://www.modulargunworks.com/shop/")).text();
const urls = [...t.matchAll(/href="(\/product\/[^"]+|https:\/\/www\.modulargunworks\.com\/product\/[^"]+)"/g)].map(
  (m) => m[1],
);
const unique = [...new Set(urls)].slice(0, 5);
console.log("sample products:", unique);
if (unique[0]) {
  const url = unique[0].startsWith("http") ? unique[0] : `https://www.modulargunworks.com${unique[0]}`;
  console.log("\nProbing:", url);
  await import("./probe-mgw-schema.mjs").catch(() => {});
  const { spawnSync } = await import("node:child_process");
  spawnSync("node", ["scripts/probe-mgw-schema.mjs", url], { stdio: "inherit", shell: true });
}
