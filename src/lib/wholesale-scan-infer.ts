/** Infer desk category hint from distributor catalog text. */

export function inferCategoryFromText(
  category: string | null | undefined,
  description: string | null | undefined,
  model: string | null | undefined,
): string {
  const blob = `${category ?? ""} ${description ?? ""} ${model ?? ""}`.toLowerCase();
  if (/\b(shotgun|gauge)\b/.test(blob)) return "shotgun";
  if (/\b(rifle|carbine|ar-?15|bolt action)\b/.test(blob)) return "rifle";
  if (/\b(revolver)\b/.test(blob)) return "revolver";
  return "handgun";
}
