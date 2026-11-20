import { AuctionIngestError } from "@/lib/auctions/types";

/** Browser UA — hibid.com / Proxibid Cloudflare 403 the desk bot string. */
export const AUCTION_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const AUCTION_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": AUCTION_BROWSER_UA,
};

export function isCloudflareBlock(status: number, body: string): boolean {
  if (status === 403 || status === 429) return true;
  return (
    /Just a moment\.\.\./i.test(body) ||
    /Attention Required!\s*\|\s*Cloudflare/i.test(body) ||
    /cf-browser-verification/i.test(body) ||
    /challenges\.cloudflare\.com/i.test(body)
  );
}

async function fetchDirect(url: string): Promise<{
  finalUrl: string;
  status: number;
  html: string;
}> {
  const res = await fetch(url, {
    headers: AUCTION_HEADERS,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  return { finalUrl: res.url, status: res.status, html: await res.text() };
}

/** Cloudflare blocks Lightsail; Jina reader fetches from a non-AWS edge. */
async function fetchViaJina(url: string): Promise<{
  finalUrl: string;
  status: number;
  html: string;
} | null> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "text/markdown, text/plain, */*",
        "X-Timeout": "45",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const html = await res.text();
    if (!res.ok || html.length < 400) return null;
    if (isCloudflareBlock(res.status, html)) return null;
    return { finalUrl: url, status: 200, html };
  } catch {
    return null;
  }
}

export async function fetchAuctionPage(url: string): Promise<{
  finalUrl: string;
  status: number;
  html: string;
  via: "direct" | "jina";
}> {
  const direct = await fetchDirect(url);
  if (!isCloudflareBlock(direct.status, direct.html) && direct.status >= 200 && direct.status < 300) {
    return { ...direct, via: "direct" };
  }
  const jina = await fetchViaJina(url);
  if (jina) return { ...jina, via: "jina" };
  return { ...direct, via: "direct" };
}

export function assertAuctionHttpOk(status: number, page: number, label: string): void {
  if (status >= 200 && status < 300) return;
  if (status === 403) {
    throw new AuctionIngestError(
      `${label} blocked the Lightsail IP (Cloudflare 403). Retry, or paste a CSV on /batch.`,
      502,
    );
  }
  if (page === 1) {
    throw new AuctionIngestError(`${label} returned HTTP ${status}`, status === 404 ? 404 : 502);
  }
}
