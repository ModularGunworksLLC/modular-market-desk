/**
 * Dealer-friendly Pearce buy sheet (standalone HTML).
 * Open tmp-pearce-buy-sheet.html in a browser (phone-friendly at the auction).
 */
import { readFileSync, writeFileSync } from "node:fs";

const PEARCE_BP_CARD = 1.1845; // 15% BP then 3% CC

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function parseOaFromNote(note) {
  if (!note) return null;
  const m = String(note).match(/^auto:\s*(.+?)\s*\((Used|New)/i);
  if (!m) return null;
  return { catalog: m[1].trim(), condition: m[2] };
}

function gbSearchUrl(keywords) {
  const q = encodeURIComponent(String(keywords || "").trim());
  if (!q) return null;
  // Keywords search — verify sold/asking yourself on GunBroker
  return `https://www.gunbroker.com/All/search?Keywords=${q}`;
}

/** Title chambering vs OA catalog chambering — catches deadly false comps. */
function catalogConflict(title, catalog) {
  const t = String(title || "").toLowerCase();
  const c = String(catalog || "").toLowerCase();
  if (!t || !c) return null;
  const checks = [
    { title: /\b7\s*mm\b|\.284\b/, badCat: /\.338|lapua|\.308|\.30-06|5\.56|\.223/, why: "Title looks 7mm; OA match is a different chambering" },
    { title: /\b(?:\.?22\s*lr|22lr|22\s*s,?l,?lr)\b/, badCat: /\.22\s*hornet|5\.56|ar-?15|\.223|saint/, why: "Title looks .22 LR; OA matched a different platform/caliber" },
    { title: /\bultralite\b/, badCat: /\bfcp\b|hs\s*precision/, why: "Ultralite vs precision chassis match — verify" },
    { title: /\bcharger\b/, badCat: /hornet/, why: "Charger .22 LR vs Hornet catalog — verify" },
    { title: /\bmodel\s*15\b/, badCat: /saint|ar-?15|5\.56/, why: "Springfield 15 rimfire vs Saint AR — verify" },
    { title: /\btrooper\b/, badCat: /\.22\s*lr/, why: "Colt Trooper often .357/.38 — confirm OA .22 LR match" },
    { title: /\.22-250\b/, badCat: /\.257|wby\.?\s*mag/, why: "Title .22-250 vs Weatherby magnum catalog — verify" },
    { title: /\bauto-?5\b.*12/, badCat: /light\s*twenty|20\s*gauge/, why: "Auto-5 12ga title vs 20ga catalog wording — verify" },
  ];
  for (const ch of checks) {
    if (ch.title.test(t) && ch.badCat.test(c)) return ch.why;
  }
  return null;
}

const live = JSON.parse(readFileSync("tmp-pearce-sheet-lots.json", "utf8"));
const liveBy = new Map(live.map((l) => [String(l.lot), l]));
const prior = JSON.parse(readFileSync("tmp-pearce-lots-10-231-results.json", "utf8"));
const bidPass = JSON.parse(readFileSync("tmp-pearce-bid-pass.json", "utf8"));
const livePulledAt = bidPass.livePulledAt || bidPass.generatedAt;

const rows = (prior.results || [])
  .map((r) => {
    const lot = String(r.lot);
    const lotN = Number(lot.replace(/\D/g, "")) || 0;
    if (lotN < 10 || lotN > 231) return null;
    const L = liveBy.get(lot);
    const liveBid = L?.currentBid != null ? Number(L.currentBid) : r.currentBid ?? null;
    const maxBid = r.maxBid == null ? null : Number(r.maxBid);
    const sold = r.soldCount ?? 0;
    let action = "RESEARCH";
    let head = null;
    if (sold > 0 && maxBid != null && liveBid != null) {
      head = Math.round((maxBid - liveBid) * 100) / 100;
      action = liveBid <= maxBid ? "BID" : "PASS";
    }
    const oa = r.oaCatalog
      ? {
          catalog: `${r.oaCatalog.manufacturer} ${r.oaCatalog.model}${r.oaCatalog.caliber ? ` ${r.oaCatalog.caliber}` : ""}`.trim(),
          condition: r.oaCatalog.condition,
          score: r.oaCatalog.score,
        }
      : parseOaFromNote(r.matchNote);
    const score = r.matchScore ?? oa?.score ?? null;
    const catalogLabel = oa?.catalog || "";
    const title = L?.title || r.label || "";
    const conflict = catalogConflict(title, catalogLabel);
    const verifyRisk =
      action !== "RESEARCH" &&
      (Boolean(conflict) ||
        score == null ||
        score < 70 ||
        /bisley|wrong|score 5\d/i.test(r.matchNote || ""));
    const allIn = liveBid != null ? Math.round(liveBid * PEARCE_BP_CARD * 100) / 100 : null;
    // Soften action: conflict + big spend → force RESEARCH so you don't auto-bid bad comps
    let finalAction = action;
    if (conflict && action === "BID") finalAction = "RESEARCH";
    return {
      lot,
      lotN,
      action: finalAction,
      title,
      liveBid,
      maxBid,
      head,
      allIn,
      sold,
      p25: r.soldP25,
      med: r.soldMedian,
      score,
      matchNote: r.matchNote || "",
      catalogLabel,
      condition: oa?.condition || "",
      detailUrl: L?.detailUrl || "",
      thumb: L?.imageUrls?.[0] || "",
      bidCount: L?.bidCount ?? null,
      gbUrl: gbSearchUrl(catalogLabel || r.label),
      gbTitleUrl: gbSearchUrl(title.replace(/\bSN\b.*$/i, "").slice(0, 80)),
      verifyRisk,
      conflict,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.lotN - b.lotN);

const tallies = {
  bid: rows.filter((r) => r.action === "BID").length,
  pass: rows.filter((r) => r.action === "PASS").length,
  research: rows.filter((r) => r.action === "RESEARCH").length,
  total: rows.length,
};

function card(r) {
  const tone = r.action === "BID" ? "bid" : r.action === "PASS" ? "pass" : "research";
  const thumb = r.thumb
    ? `<img class="thumb" src="${esc(r.thumb)}" alt="" loading="lazy" />`
    : `<div class="thumb placeholder">No photo</div>`;
  const lotLink = r.detailUrl
    ? `<a class="lot-link" href="${esc(r.detailUrl)}" target="_blank" rel="noopener">Lot ${esc(r.lot)} ↗</a>`
    : `<span class="lot-link">Lot ${esc(r.lot)}</span>`;
  const verify = [];
  if (r.detailUrl) {
    verify.push(`<a href="${esc(r.detailUrl)}" target="_blank" rel="noopener">Pearce lot</a>`);
  }
  if (r.gbUrl) {
    verify.push(
      `<a href="${esc(r.gbUrl)}" target="_blank" rel="noopener" title="Search GunBroker for the OA catalog name">GB comps (OA match)</a>`,
    );
  }
  if (r.gbTitleUrl && r.gbTitleUrl !== r.gbUrl) {
    verify.push(
      `<a href="${esc(r.gbTitleUrl)}" target="_blank" rel="noopener" title="Search GunBroker using auction title">GB search (title)</a>`,
    );
  }
  const risk = r.conflict
    ? `<span class="badge danger">STOP — ${esc(r.conflict)}</span>`
    : r.verifyRisk
      ? `<span class="badge warn">Verify match — score ${r.score != null ? Math.round(r.score) : "?"}</span>`
      : r.score != null
        ? `<span class="badge ok">Match ${Math.round(r.score)}</span>`
        : `<span class="badge muted">No OA match</span>`;

  return `
<article class="card ${tone}" data-action="${r.action}" data-lot="${esc(r.lot)}" data-title="${esc(r.title.toLowerCase())}">
  <div class="media">${thumb}</div>
  <div class="body">
    <header class="row">
      ${lotLink}
      <span class="pill ${tone}">${r.action}</span>
      ${risk}
    </header>
    <h2 class="title">${esc(r.title)}</h2>
    ${r.conflict ? `<div class="conflict">${esc(r.conflict)}. Do not use Max bid until you fix the comp match.</div>` : ""}
    <div class="metrics">
      <div><span class="k">Live bid</span><span class="v">${money(r.liveBid)}</span></div>
      <div><span class="k">Max bid</span><span class="v emphasize">${money(r.maxBid)}</span></div>
      <div><span class="k">Headroom</span><span class="v ${r.head != null && r.head >= 0 ? "pos" : "neg"}">${money(r.head)}</span></div>
      <div><span class="k">Your all-in @ live</span><span class="v">${money(r.allIn)}</span></div>
    </div>
    <div class="comps">
      <div class="k">Sold comps (Outdoor Analytics → GunBroker history)</div>
      <div class="comp-line">
        ${r.sold ? `<strong>${r.sold}</strong> sold · P25 ${money(r.p25)} · median ${money(r.med)}` : "No usable sold comps"}
        ${r.condition ? ` · ${esc(r.condition)}` : ""}
        ${r.bidCount != null ? ` · ${r.bidCount} bids on lot` : ""}
      </div>
      ${
        r.catalogLabel
          ? `<div class="oa">OA matched: <code>${esc(r.catalogLabel)}</code></div>`
          : `<div class="oa muted">No catalog match — do not bid for flip unless you know the gun</div>`
      }
    </div>
    <nav class="verify">Verify: ${verify.join(" · ") || "—"}</nav>
  </div>
</article>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pearce 47513 buy sheet — Modular Gunworks</title>
<style>
  :root {
    --bg: #12141a;
    --panel: #1a1d26;
    --line: #2a3040;
    --text: #e8e6df;
    --muted: #9a958a;
    --bid: #3d8b6e;
    --bid-bg: #1a2e26;
    --pass: #a65d4a;
    --pass-bg: #2a1c18;
    --research: #8a7a4a;
    --research-bg: #262218;
    --warn: #c9a227;
    --accent: #c4a574;
    --num: #f2efe6;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.35;
  }
  header.top {
    position: sticky; top: 0; z-index: 20;
    background: rgba(18,20,26,.96);
    border-bottom: 1px solid var(--line);
    padding: 12px 16px 10px;
    backdrop-filter: blur(8px);
  }
  h1 { font-size: 1.15rem; margin: 0 0 4px; font-weight: 650; letter-spacing: .02em; }
  .sub { color: var(--muted); font-size: .78rem; margin-bottom: 10px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .stat {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 6px; padding: 6px 10px; min-width: 72px;
  }
  .stat b { display: block; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
  .stat span { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .stat.bid b { color: #6fc4a0; }
  .stat.pass b { color: #e08972; }
  .stat.research b { color: #d4c07a; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .tabs button, .sort select {
    background: var(--panel); color: var(--text); border: 1px solid var(--line);
    border-radius: 999px; padding: 6px 12px; font-size: .8rem; cursor: pointer;
  }
  .tabs button.active { border-color: var(--accent); color: var(--accent); }
  input[type="search"] {
    flex: 1; min-width: 160px; background: var(--panel); border: 1px solid var(--line);
    color: var(--text); border-radius: 8px; padding: 7px 10px; font-size: .85rem;
  }
  main { padding: 12px 16px 48px; max-width: 1100px; margin: 0 auto; }
  .howto {
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 12px 14px; margin-bottom: 14px; font-size: .82rem; color: var(--muted);
  }
  .howto strong { color: var(--text); }
  .howto ol { margin: 6px 0 0; padding-left: 18px; }
  .card {
    display: grid; grid-template-columns: 96px 1fr; gap: 12px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px; margin-bottom: 10px;
  }
  .card.bid { border-left: 4px solid var(--bid); background: var(--bid-bg); }
  .card.pass { border-left: 4px solid var(--pass); background: var(--pass-bg); opacity: .92; }
  .card.research { border-left: 4px solid var(--research); background: var(--research-bg); }
  .thumb {
    width: 96px; height: 96px; object-fit: cover; border-radius: 6px;
    background: #0d0f14; border: 1px solid var(--line);
  }
  .thumb.placeholder {
    display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: .7rem; text-align: center; padding: 6px;
  }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 4px; }
  .lot-link { color: var(--accent); font-weight: 650; text-decoration: none; font-size: .9rem; }
  .lot-link:hover { text-decoration: underline; }
  .pill {
    font-size: .65rem; font-weight: 700; letter-spacing: .06em;
    padding: 2px 7px; border-radius: 4px; text-transform: uppercase;
  }
  .pill.bid { background: var(--bid); color: #04150e; }
  .pill.pass { background: var(--pass); color: #1a0805; }
  .pill.research { background: var(--research); color: #1a1608; }
  .badge { font-size: .65rem; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--line); color: var(--muted); }
  .badge.warn { border-color: var(--warn); color: var(--warn); }
  .badge.danger { border-color: #e05555; color: #ff8a8a; background: #2a1212; }
  .badge.ok { border-color: var(--bid); color: #6fc4a0; }
  .conflict {
    background: #2a1212; border: 1px solid #e05555; color: #ffc9c9;
    border-radius: 6px; padding: 6px 8px; font-size: .78rem; margin-bottom: 8px;
  }
  .title { font-size: .95rem; margin: 0 0 8px; font-weight: 600; }
  .metrics {
    display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px;
    margin-bottom: 8px;
  }
  @media (max-width: 700px) {
    .card { grid-template-columns: 72px 1fr; }
    .thumb { width: 72px; height: 72px; }
    .metrics { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
  .k { display: block; font-size: .65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .v { display: block; font-size: 1.05rem; font-variant-numeric: tabular-nums; font-weight: 650; color: var(--num); }
  .v.emphasize { color: var(--accent); font-size: 1.15rem; }
  .v.pos { color: #6fc4a0; }
  .v.neg { color: #e08972; }
  .comps { font-size: .78rem; margin-bottom: 6px; }
  .comp-line { margin-top: 2px; }
  .oa { margin-top: 4px; color: var(--muted); }
  .oa code { color: var(--text); font-size: .75rem; word-break: break-word; }
  .oa.muted { font-style: italic; }
  .verify { font-size: .75rem; }
  .verify a { color: var(--accent); }
  .hidden { display: none !important; }
  footer { color: var(--muted); font-size: .7rem; padding: 8px 16px 24px; max-width: 1100px; margin: 0 auto; }
</style>
</head>
<body>
<header class="top">
  <h1>Pearce July Guns — buy sheet</h1>
  <div class="sub">Live bids ${esc(livePulledAt)} · Fees: 15% BP + 3% CC · pickup · $3 GB list · $50 profit target · Max bid from Outdoor Analytics sold comps</div>
  <div class="stats">
    <div class="stat bid"><b id="n-bid">${tallies.bid}</b><span>Bid</span></div>
    <div class="stat pass"><b id="n-pass">${tallies.pass}</b><span>Pass</span></div>
    <div class="stat research"><b id="n-research">${tallies.research}</b><span>Research</span></div>
    <div class="stat"><b>${tallies.total}</b><span>Lots</span></div>
  </div>
  <div class="controls">
    <div class="tabs" id="tabs">
      <button type="button" data-filter="BID" class="active">Bid</button>
      <button type="button" data-filter="PASS">Pass</button>
      <button type="button" data-filter="RESEARCH">Research</button>
      <button type="button" data-filter="ALL">All lots</button>
    </div>
    <label class="sort">Sort
      <select id="sort">
        <option value="lot">Lot #</option>
        <option value="head">Headroom</option>
        <option value="max">Max bid</option>
        <option value="live">Live bid</option>
      </select>
    </label>
    <input type="search" id="q" placeholder="Filter lot # or gun…" />
  </div>
</header>
<main>
  <div class="howto">
    <strong>How to use this like money depends on it</strong>
    <ol>
      <li><strong>Bid only the green BID list</strong> — never exceed <em>Max bid</em>. Headroom is Max − live.</li>
      <li><strong>Click “GB comps (OA match)”</strong> — confirm recent solds look like that specific gun (caliber, variant). If OA matched “Bisley” and the lot isn’t, walk away.</li>
      <li><strong>Open Pearce lot</strong> — photos, SN, condition. Your all-in ≈ live × 1.1845 (15% + 3% card).</li>
      <li><strong>Yellow “Verify match”</strong> = low confidence or sketchy auto-match. Treat as research.</li>
      <li><strong>Research</strong> = no OA comps. Pass unless you already know the resale.</li>
    </ol>
  </div>
  <div id="list">
    ${rows.map(card).join("\n")}
  </div>
</main>
<footer>
  Comp source: Outdoor Analytics catalog match → GunBroker sold history (Desk). Auction source: bids.auctionbypearce.com. Not NCIC / not advice — your capital, your call.
</footer>
<script>
const list = document.getElementById('list');
const cards = [...list.querySelectorAll('.card')];
let filter = 'BID';
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  filter = btn.dataset.filter;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
  apply();
});
document.getElementById('q').addEventListener('input', apply);
document.getElementById('sort').addEventListener('change', apply);
function apply() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const sort = document.getElementById('sort').value;
  const visible = cards.filter(c => {
    const okF = filter === 'ALL' || c.dataset.action === filter;
    const okQ = !q || c.dataset.lot.includes(q) || (c.dataset.title || '').includes(q);
    c.classList.toggle('hidden', !(okF && okQ));
    return okF && okQ;
  });
  const num = (c, key) => {
    const el = c.querySelector('.metrics');
    // order: live, max, head, allin
    const vs = [...c.querySelectorAll('.metrics .v')].map(v => {
      const t = v.textContent.replace(/[^0-9.-]/g,'');
      return t === '' || t === '—' ? -1e12 : Number(t);
    });
    if (key === 'live') return vs[0];
    if (key === 'max') return vs[1];
    if (key === 'head') return vs[2];
    return Number(c.dataset.lot);
  };
  visible.sort((a,b) => {
    if (sort === 'lot') return Number(a.dataset.lot) - Number(b.dataset.lot);
    return num(b, sort) - num(a, sort);
  }).forEach(c => list.appendChild(c));
}
apply();
</script>
</body>
</html>
`;

writeFileSync("tmp-pearce-buy-sheet.html", html);

// Compact JSON for canvas
writeFileSync(
  "tmp-pearce-buy-sheet-data.json",
  JSON.stringify(
    {
      livePulledAt,
      tallies,
      bid: rows
        .filter((r) => r.action === "BID")
        .sort((a, b) => (b.head ?? -1e9) - (a.head ?? -1e9))
        .map((r) => ({
          lot: r.lot,
          title: r.title.slice(0, 80),
          liveBid: r.liveBid,
          maxBid: r.maxBid,
          head: r.head,
          allIn: r.allIn,
          sold: r.sold,
          med: r.med,
          p25: r.p25,
          score: r.score,
          catalog: r.catalogLabel,
          detailUrl: r.detailUrl,
          gbUrl: r.gbUrl,
          verifyRisk: r.verifyRisk,
          conflict: r.conflict,
        })),
      pulledFromBid: rows.filter((r) => r.conflict).map((r) => ({
        lot: r.lot,
        title: r.title.slice(0, 60),
        catalog: r.catalogLabel,
        conflict: r.conflict,
      })),
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      file: "tmp-pearce-buy-sheet.html",
      tallies,
      path: "C:\\\\Users\\\\micha\\\\Projects\\\\modular-market-desk\\\\tmp-pearce-buy-sheet.html",
    },
    null,
    2,
  ),
);
