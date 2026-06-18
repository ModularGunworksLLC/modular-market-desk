/** Desk workflow modes — used (auction / trade-in) vs new vendor. */

export type Workflow = "used" | "vendor";
export type UsedSubtype = "auction" | "tradein";

/** Unified mode id for API responses and insights. */
export type DeskModeId = "used-auction" | "used-tradein" | "vendor";

export interface DeskMode {
  workflow: Workflow;
  usedSubtype: UsedSubtype;
}

export function deskModeId(mode: DeskMode): DeskModeId {
  if (mode.workflow === "vendor") return "vendor";
  return mode.usedSubtype === "tradein" ? "used-tradein" : "used-auction";
}

export function resolveDeskMode(body: {
  workflow?: Workflow;
  usedSubtype?: UsedSubtype;
  acquisitionMode?: "auction" | "dealer";
}): DeskMode {
  if (body.workflow === "used" || body.workflow === "vendor") {
    return {
      workflow: body.workflow,
      usedSubtype: body.workflow === "used" ? (body.usedSubtype ?? "auction") : "auction",
    };
  }
  if (body.acquisitionMode === "dealer") {
    return { workflow: "vendor", usedSubtype: "auction" };
  }
  return { workflow: "used", usedSubtype: "auction" };
}

export function isUsedAuction(mode: DeskMode): boolean {
  return mode.workflow === "used" && mode.usedSubtype === "auction";
}

export function isUsedTradeIn(mode: DeskMode): boolean {
  return mode.workflow === "used" && mode.usedSubtype === "tradein";
}
