/** Pick the most likely field separator from a CSV/TSV header line. */

export function detectDelimiter(line: string): string {
  const sample = line.replace(/^\uFEFF/, "");
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const semicolons = (sample.match(/;/g) ?? []).length;

  if (tabs >= 3 && tabs > commas && tabs >= semicolons) return "\t";
  if (semicolons >= 3 && semicolons > commas && semicolons >= tabs) return ";";
  return ",";
}
