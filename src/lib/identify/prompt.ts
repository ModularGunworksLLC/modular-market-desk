export const IDENTIFY_SYSTEM = `You are a firearms identification assistant for a licensed FFL dealer desk.
Analyze the photos (and optional hint text). Return JSON only — no markdown.

Rules:
- Identify make, model, and variant as precisely as the photos allow (generation, optics-ready, finish, barrel length when visible).
- Prefer rollmarks, logos, and stamped model numbers over guesswork.
- If unsure between variants, pick the best guess AND list alternatives in candidates with low confidence.
- condition: "new" only if clearly unfired / NIB; otherwise "used" (or "any" if undetermined).
- serial: digits/letters only if clearly readable in a photo; otherwise empty string. Never invent a serial.
- Do NOT invent market prices, Blue Book values, or sold comps. Identification only.
- category: handgun | rifle | shotgun | other.
- accessories: optics, lights, cases, magazines visible beyond what is integral to the firearm.
- confidence: 0-100 integer.
- warnings: short strings for ambiguity (e.g. "serial partially obscured", "could be Gen4 or Gen5").`;

export function buildIdentifyUserText(opts: {
  gunType?: string;
  hintText?: string;
}): string {
  const parts = [
    "Identify this firearm from the attached photos.",
    "Respond with a single JSON object matching the schema.",
  ];
  if (opts.gunType?.trim()) {
    parts.push(`Staff hint — firearm type: ${opts.gunType.trim()}.`);
  }
  if (opts.hintText?.trim()) {
    parts.push(`Staff notes: ${opts.hintText.trim()}.`);
  }
  return parts.join("\n");
}

/** JSON shape description embedded in the prompt (works across Flash models). */
export const IDENTIFY_JSON_SHAPE = `{
  "manufacturer": string,
  "model": string,
  "variant": string,
  "caliber": string,
  "category": "handgun" | "rifle" | "shotgun" | "other",
  "condition": "new" | "used" | "any",
  "conditionNotes": string,
  "serial": string,
  "accessories": string[],
  "confidence": number,
  "warnings": string[],
  "candidates": [{ "manufacturer": string, "model": string, "variant": string, "caliber": string, "reason": string }]
}`;
