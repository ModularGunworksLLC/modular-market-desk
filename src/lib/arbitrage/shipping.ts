/**
 * Category-based outbound shipping defaults for GunBroker listings.
 * Handguns/pistols: $45. Rifles/shotguns: $60.
 */

export const OUTBOUND_SHIP_HANDGUN = 45;
export const OUTBOUND_SHIP_RIFLE_SHOTGUN = 60;

export function defaultOutboundShip(category: string): number {
  const c = category.trim().toLowerCase();
  if (c === "rifle" || c === "shotgun") return OUTBOUND_SHIP_RIFLE_SHOTGUN;
  return OUTBOUND_SHIP_HANDGUN;
}

/** Spreadsheet / auction category labels (e.g. "Handguns", "Semi-Automatic Rifles"). */
export function defaultOutboundShipFromLabel(category: string): number {
  const c = category.toLowerCase();
  if (/rifle|shotgun/.test(c)) return OUTBOUND_SHIP_RIFLE_SHOTGUN;
  if (/handgun|pistol|revolver/.test(c)) return OUTBOUND_SHIP_HANDGUN;
  return OUTBOUND_SHIP_HANDGUN;
}
