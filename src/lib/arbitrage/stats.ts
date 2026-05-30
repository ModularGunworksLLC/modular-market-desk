/** Percentile statistics over a price set. Pure functions. */

import type { PriceStats } from "./types";

export const EMPTY_STATS: PriceStats = {
  count: 0,
  low: 0,
  p25: 0,
  median: 0,
  p75: 0,
  high: 0,
  avg: 0,
};

/**
 * Linear-interpolation percentile (same method as NumPy's default "linear").
 * `p` is in [0, 100]. `sorted` must be ascending and non-empty.
 */
export function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  const vLo = sorted[lo]!;
  const vHi = sorted[hi]!;
  return vLo + (vHi - vLo) * frac;
}

/** Summarize a set of prices into count/low/p25/median/p75/high/avg. */
export function summarize(prices: number[]): PriceStats {
  const clean = prices.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const count = clean.length;
  if (count === 0) return { ...EMPTY_STATS };
  const sum = clean.reduce((acc, v) => acc + v, 0);
  return {
    count,
    low: clean[0]!,
    p25: percentile(clean, 25),
    median: percentile(clean, 50),
    p75: percentile(clean, 75),
    high: clean[count - 1]!,
    avg: sum / count,
  };
}
