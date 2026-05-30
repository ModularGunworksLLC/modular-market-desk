/** Request validation for the desk API. */

import { z } from "zod";

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";

export const evaluateSchema = z.object({
  // identity
  manufacturer: z.string().min(1, "manufacturer required"),
  model: z.string().min(1, "model required"),
  upc: z.string().optional().default(""),
  mpn: z.string().optional().default(""),
  caliber: z.string().optional().default(""),
  category: z.string().optional().default("handgun"),
  condition: z.enum(["new", "used", "any"]).optional().default("any"),

  // buy-side inputs
  targetAcquisitionCost: z.number().nonnegative(),
  inboundShip: z.number().nonnegative().default(0),
  buyerPremiumPct: z.number().min(0).max(100).default(0),
  outboundShip: z.number().nonnegative().default(DEAL_DEFAULTS.outboundShip),
  listingUpgrades: z.number().min(0).max(5).default(DEAL_DEFAULTS.listingUpgrades),
  targetProfit: z.number().nonnegative().default(DEAL_DEFAULTS.targetProfit),
  minMarginPct: z.number().min(0).default(DEAL_DEFAULTS.minMarginPct),

  // market source precedence:
  //   1. explicit `gba` ids (manual override of the resolver)
  //   2. auto comps: resolve catalog ids from identity text + saved token (default)
  //   3. manual sold/asking price arrays
  gba: z
    .object({
      modelId: z.number().int().positive(),
      caliberId: z.number().int().positive(),
      condition: z.enum(["New", "Used"]),
    })
    .optional(),
  // When true (default), the server resolves GBA model/caliber ids from the
  // manufacturer/model/caliber text and pulls live comps automatically.
  autoComps: z.boolean().optional().default(true),
  soldPrices: z.array(z.number().positive()).optional(),
  askingPrices: z.array(z.number().positive()).optional(),
});

export type EvaluateRequest = z.infer<typeof evaluateSchema>;
