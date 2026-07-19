/** Public surface of the arbitrage math engine. */

export * from "./types";
export * from "./constants";
export { round2, finalValueFee, cardProcessingFee } from "./fees";
export { summarize, percentile, EMPTY_STATS } from "./stats";
export { routeGunBroker, routeLocalAlabama } from "./routes";
export { allInCost } from "./acquisition";
export { maxBid } from "./maxBid";
export { decideVerdict } from "./verdict";
export { evaluateDeal } from "./evaluate";
export {
  NEW_FLOOR_BUFFER,
  formatNewDealerWarning,
  violatesNewFloor,
  effectiveHammerCeiling,
} from "./new-floor";
