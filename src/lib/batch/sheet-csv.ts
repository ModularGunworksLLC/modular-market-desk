/**
 * Quote-aware batch sheet reader used in the browser.
 *
 * The catalog importer already streams with csv-parse on the server. This
 * reader stays dependency-free so the Batch page can parse a pasted sheet
 * without pulling Node streams into the client bundle. It honors quotes,
 * escaped quotes (""), commas, and newlines inside a field.
 */

const DELIMITERS = [",", "\t", ";", "|"] as const;

function sniffDelimiter(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    if (!inQuotes && counts[ch] != null) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  let best: (typeof DELIMITERS)[number] = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    if ((counts[d] ?? 0) > bestCount) {
      best = d;
      bestCount = counts[d] ?? 0;
    }
  }
  return best;
}

export function parseCsvMatrix(text: string): { rows: string[][]; delimiter: string } {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = sniffDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c.length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      pushRow();
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) pushRow();
  return { rows, delimiter };
}

/** Headers that must never be read as the live bid. */
export function headerLooksLikeCompColumn(header: string): boolean {
  const n = header.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!n) return false;
  return (
    n.includes("p25") ||
    n.includes("median") ||
    n.includes("oasold") ||
    n.includes("decisionp") ||
    n.includes("maxhammer") ||
    n.includes("walkaway") ||
    n.includes("dealerfloor") ||
    n === "soldcomps" ||
    n === "marketmedian"
  );
}

export function bidColumnWarnings(args: {
  headers: string[];
  mappedCurrentBid: boolean;
  bids: Array<number | null>;
}): string[] {
  const warnings: string[] = [];
  const compHeaders = args.headers.filter((h) => headerLooksLikeCompColumn(h));
  if (!args.mappedCurrentBid) {
    warnings.push(
      compHeaders.length > 0
        ? `No Current Bid column. "${compHeaders[0]}" looks like a comp (P25 / median), not the live bid, and was not used as Current.`
        : "No Current Bid column. Every lot will score with an empty hammer until you add Current Bid.",
    );
    return warnings;
  }
  const anyBid = args.bids.some((b) => b != null && b > 0);
  if (!anyBid && args.bids.length > 0) {
    warnings.push(
      compHeaders.length > 0
        ? `Current Bid is empty on every lot. "${compHeaders[0]}" sits beside it and is a comp price, not the hammer.`
        : "Current Bid is empty on every lot. Max hammer will be scored with no live bid.",
    );
  }
  return warnings;
}
