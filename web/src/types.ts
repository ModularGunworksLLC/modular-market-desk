export interface CatalogItem {
  id: string;
  source: string;
  manufacturer: string;
  model: string;
  upc?: string;
  category: string;
  action: string;
  caliber: string;
  dealer_price: number;
  in_stock: boolean;
  on_sale: boolean;
  scraped_at: string;
}

export interface CompItem {
  id: string;
  catalog_id: string;
  source: string;
  asking_price?: number;
  completed_price?: number;
  url?: string;
  scraped_at: string;
}

export interface DataBundle {
  catalog: CatalogItem[];
  comps: CompItem[];
  generated_at: string;
}

export interface ResultRow {
  item: CatalogItem;
  market_median: number;
  spread: number;
  margin_pct: number;
}
