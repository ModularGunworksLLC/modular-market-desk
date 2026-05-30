/**
 * Default CSV presets for the four tracked distributors. These seed the `csv_presets` table;
 * the importer always reads the mapping from the DB so dealers can be re-mapped without a deploy.
 */

import type { CsvColumnMap, NewCsvPreset } from "@/lib/db/schema";

export const DEFAULT_PRESETS: NewCsvPreset[] = [
  {
    vendorName: "lipseys",
    label: "Lipsey's",
    delimiter: ",",
    encoding: "utf-8",
    columnMap: {
      sku: ["Item #", "ItemNumber", "Item Number", "SKU"],
      upc: ["UPC", "UPC Code"],
      manufacturer: ["Manufacturer", "Mfg", "Brand"],
      model: ["Model", "Model Number"],
      description: ["Description", "Item Description"],
      caliber: ["Caliber", "Gauge", "Caliber/Gauge"],
      category: ["Type", "Category", "ItemType"],
      dealerPrice: ["Dealer Price", "Price", "Your Price"],
      msrp: ["MSRP", "Retail", "Retail Price"],
      qty: ["Quantity", "Qty", "On Hand"],
      onSale: ["Sale", "On Sale"],
      salePrice: ["Sale Price", "Special Price"],
    } satisfies CsvColumnMap,
  },
  {
    vendorName: "zanders",
    label: "Zanders Sporting Goods",
    delimiter: ",",
    encoding: "utf-8",
    columnMap: {
      sku: ["ITEM", "Item No", "SKU"],
      upc: ["UPC", "UPCCODE", "UPC Code"],
      manufacturer: ["MFG", "Manufacturer", "Brand"],
      model: ["MODEL", "Model"],
      description: ["DESCRIPTION", "Description"],
      caliber: ["CALIBER", "Caliber"],
      category: ["CATEGORY", "Type"],
      dealerPrice: ["PRICE", "Dealer", "Cost"],
      msrp: ["MSRP", "MAP"],
      qty: ["QTY", "Quantity", "Available"],
    } satisfies CsvColumnMap,
  },
  {
    vendorName: "davidsons",
    label: "Davidson's",
    delimiter: ",",
    encoding: "utf-8",
    columnMap: {
      sku: ["Item Number", "ItemNumber", "SKU"],
      upc: ["UPC Code", "UPC", "UPCCode"],
      manufacturer: ["Manufacturer", "Brand"],
      model: ["Model", "Model Number"],
      description: ["Description"],
      caliber: ["Caliber", "Gauge"],
      category: ["Category", "Type"],
      dealerPrice: ["Dealer Price", "Cost", "Price"],
      msrp: ["Retail", "MSRP", "MAP Price"],
      qty: ["Quantity Available", "Qty", "Quantity"],
    } satisfies CsvColumnMap,
  },
  {
    vendorName: "chattanooga",
    label: "Chattanooga Shooting Supplies",
    delimiter: ",",
    encoding: "utf-8",
    columnMap: {
      sku: ["CSSI Item Number", "Item Number", "SKU"],
      upc: ["UPC", "UPC Code"],
      manufacturer: ["Manufacturer", "Brand"],
      model: ["Model Number", "Model"],
      description: ["Product Description", "Description"],
      caliber: ["Caliber", "Gauge"],
      category: ["Category", "Product Type"],
      dealerPrice: ["Dealer Price", "Price", "Your Cost"],
      msrp: ["MSRP", "Retail", "MAP"],
      qty: ["Quantity On Hand", "Qty", "Available"],
    } satisfies CsvColumnMap,
  },
];
