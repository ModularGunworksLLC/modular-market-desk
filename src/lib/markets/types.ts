/** Shared Markets dashboard types (safe for client + server). */

export type MarketsConditionFilter = "ANY" | "USED" | "NEW";
export type MarketsFirearmCategory = "handgun" | "rifle" | "shotgun";
export type MarketsCategoryFilter = "all" | MarketsFirearmCategory;

export type NameCount = { name: string; count: number };

export type MarketsSummary = {
  generatedAt: string;
  cacheTtlSec: number;
  condition: MarketsConditionFilter;
  category: MarketsCategoryFilter;
  coverage: {
    leafCount: number;
    leavesWithSolds: number;
    leavesWith30d: number;
    leavesWith90d: number;
    pctWith90d: number;
    soldCompRows: number;
    lastSyncAt: string | null;
    lastSyncKind: string | null;
    lastSyncStatus: string | null;
  };
  seasonality: Array<{ month: number; label: string; count: number }>;
  topManufacturers90d: NameCount[];
  topManufacturersAll: NameCount[];
  topCalibers90d: NameCount[];
  topCalibersAll: NameCount[];
};
