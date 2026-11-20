/**
 * Accessories ("w/ ...") and condition flags pulled off a title before the
 * model string is built. They are stored on the lot and shown on the sheet.
 * Comp matching does not read them yet. "parts" is a visible warning.
 */

export const LOT_FLAGS = ["sporter", "drilled", "nsn", "parts"] as const;
export type LotFlag = (typeof LOT_FLAGS)[number];

export interface LotAnnotations {
  accessories: string[];
  flags: LotFlag[];
}

export function partsWarning(flags: readonly string[]): string | null {
  return flags.some((f) => f.toLowerCase() === "parts")
    ? "Title says parts — confirm this is a complete firearm before trusting comps."
    : null;
}

export function extractLotAnnotations(title: string): { text: string; annotations: LotAnnotations } {
  let text = title;
  const accessories: string[] = [];

  const withRe = /\bw\/\s*([\s\S]+)$/i;
  const withMatch = withRe.exec(text);
  if (withMatch?.[1] && withMatch.index != null) {
    const clause = withMatch[1].trim().replace(/[.,;]+$/, "");
    const pieces = clause
      .split(/\s*(?:,|&|\+|\/|\band\b)\s*/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 1);
    if (pieces.length > 0) accessories.push(...pieces);
    else if (clause) accessories.push(clause);
    text = text.slice(0, withMatch.index).trim();
  }

  const flags: LotFlag[] = [];
  const takeFlags = (value: string) =>
    value.replace(/\b(sporter|drilled|nsn|parts)\b/gi, (word) => {
      const flag = word.toLowerCase() as LotFlag;
      if (!flags.includes(flag)) flags.push(flag);
      return " ";
    });
  text = takeFlags(text);
  const cleanedAccessories = accessories
    .map((item) => takeFlags(item).replace(/\s{2,}/g, " ").trim())
    .filter((item) => item.length > 1);

  return {
    text: text.replace(/\s{2,}/g, " ").trim(),
    annotations: { accessories: cleanedAccessories, flags },
  };
}
