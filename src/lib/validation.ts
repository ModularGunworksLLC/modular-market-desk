/** Request validation for the desk API. */

import { z } from "zod";

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";

export const evaluateSchema = z.object({
  /** @deprecated use workflow + usedSubtype */
  acquisitionMode: z.enum(["auction", "dealer"]).optional(),
  workflow: z.enum(["used", "vendor"]).optional(),
  usedSubtype: z.enum(["auction", "tradein"]).optional().default("auction"),
  /** Vendor ad source — highlights row in wholesale grid. */
  sourceDealer: z.string().optional().default(""),

  // identity
  manufacturer: z.string().min(1, "manufacturer required"),
  model: z.string().min(1, "model required"),
  upc: z.string().optional().default(""),
  mpn: z.string().optional().default(""),
  caliber: z.string().optional().default(""),
  category: z.string().optional().default("handgun"),
  condition: z.enum(["new", "used", "any"]).optional().default("any"),

  // buy-side inputs — optional for comp-only evaluate; live bid check uses this when set
  targetAcquisitionCost: z.number().nonnegative().optional().default(0),
  inboundShip: z.number().nonnegative().default(0),
  buyerPremiumPct: z.number().min(0).max(100).default(0),
  /** Omit to use category default: handgun $45, rifle/shotgun $60. */
  outboundShip: z.number().nonnegative().optional(),
  buyerPaysOutboundShip: z.boolean().optional().default(DEAL_DEFAULTS.buyerPaysOutboundShip),
  buyerPaysCardFee: z.boolean().optional().default(DEAL_DEFAULTS.buyerPaysCardFee),
  listingUpgrades: z.number().min(0).max(5).default(DEAL_DEFAULTS.listingUpgrades),
  targetProfit: z.number().nonnegative().default(DEAL_DEFAULTS.targetProfit),
  minMarginPct: z.number().min(0).optional().default(DEAL_DEFAULTS.minMarginPct),

  gba: z
    .object({
      modelId: z.number().int().positive(),
      caliberId: z.number().int().positive(),
      condition: z.enum(["New", "Used"]),
    })
    .optional(),
  autoComps: z.boolean().optional().default(true),
  soldPrices: z.array(z.number().positive()).optional(),
  askingPrices: z.array(z.number().positive()).optional(),
});

export type EvaluateRequest = z.infer<typeof evaluateSchema>;
