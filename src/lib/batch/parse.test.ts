import { describe, expect, it } from "vitest";

import { normalizeCategory, parseBatchSheet, parseTitleBlob } from "./parse";

describe("parseTitleBlob", () => {
  it("splits a typical pistol title into brand, model, caliber", () => {
    const p = parseTitleBlob("Glock 19 Gen5 9mm");
    expect(p.manufacturer).toBe("Glock");
    expect(p.caliber).toBe("9mm");
    expect(p.model.toLowerCase()).toContain("19");
    expect(p.category).toBe("handgun");
  });

  it("handles multi-word brands and normalizes aliases", () => {
    const p = parseTitleBlob("Smith & Wesson M&P Shield 9mm");
    expect(p.manufacturer).toBe("Smith & Wesson");
    expect(p.caliber).toBe("9mm");
  });

  it("classifies rifles and rimfire", () => {
    const p = parseTitleBlob("Ruger 10/22 Carbine .22 LR");
    expect(p.manufacturer).toBe("Ruger");
    expect(p.caliber).toBe(".22 LR");
    expect(p.category).toBe("rifle");
  });

  it("classifies shotguns by gauge", () => {
    const p = parseTitleBlob("Mossberg 500 12ga pump shotgun");
    expect(p.manufacturer).toBe("Mossberg");
    expect(p.caliber).toBe("12ga");
    expect(p.category).toBe("shotgun");
  });
});

describe("parseBatchSheet", () => {
  it("parses a title-blob sheet with current bid", () => {
    const csv = [
      "Lot,Title,Current Bid,Buyer Premium",
      "101,Glock 19 Gen5 9mm,420,18",
      "102,Sig Sauer P320 Compact 9mm,365,15",
    ].join("\n");
    const res = parseBatchSheet(csv);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]!.lot).toBe("101");
    expect(res.rows[0]!.manufacturer).toBe("Glock");
    expect(res.rows[0]!.currentBid).toBe(420);
    expect(res.rows[0]!.buyerPremiumPct).toBe(18);
    expect(res.rows[1]!.buyerPremiumPct).toBe(15);
  });

  it("parses discrete make/model/caliber columns", () => {
    const csv = ["Make,Model,Caliber,Price", "Ruger,10/22,.22 LR,$199.99"].join("\n");
    const res = parseBatchSheet(csv);
    expect(res.rows[0]!.manufacturer).toBe("Ruger");
    expect(res.rows[0]!.model).toBe("10/22");
    expect(res.rows[0]!.currentBid).toBe(199.99);
    expect(res.rows[0]!.unresolved).toBe(false);
  });

  it("flags rows it cannot resolve and warns", () => {
    const csv = ["Lot,Title,Bid", "9,,50"].join("\n");
    const res = parseBatchSheet(csv);
    expect(res.rows[0]!.unresolved).toBe(true);
    expect(res.warnings.some((w) => w.includes("skipped"))).toBe(true);
  });

  it("warns when no identity column is present", () => {
    const csv = ["Color,Weight", "black,3"].join("\n");
    const res = parseBatchSheet(csv);
    expect(res.rows).toHaveLength(0);
    expect(res.warnings[0]).toMatch(/title column|Make \+ Model/i);
  });

  it("handles tab-delimited sheets", () => {
    const csv = ["Lot\tTitle\tCurrent Bid", "1\tBeretta 92FS 9mm\t500"].join("\n");
    const res = parseBatchSheet(csv);
    expect(res.rows[0]!.manufacturer).toBe("Beretta");
    expect(res.rows[0]!.currentBid).toBe(500);
  });
});

// Built from a real auction manifest: Lot, Category, Item Description, Serial, Current Bid.
const REAL_SHEET = [
  "Lot,Category,Item Description,Serial Number,Current Bid",
  "2,Shotguns,Remington Model 1108 12 Gauge Shotgun,1864I,$1.00",
  "3,Shotguns,Browning Auto-5 Semi-Automatic Shotgun,221013,$221.00",
  "5,Shotguns,1962 Colt Woodsman .22LR Pistol,X8888,$1.00",
  "6,Handguns,High Standard M-101 22LR Pistol,NSN,$1.00",
  "7,Handguns,Smith & Wesson Model 25-2 44 Magnum Revolver,N44494,$1.00",
  "8,Handguns,Smith & Wesson Model 13-2 357 Magnum Revolver in Box,63166,$55.00",
  "9,Semi-Automatic Rifles,Sharps Bros Hellbreaker 5.56 NATO Rifle,HS-13674,$1.00",
  "10,Handguns,Spikes Tactical Spartan 223 Wylde Rifle,SH82679,$1.00",
  "11,Handguns,Ruger Super Wrangler 22 Cal Single-Action Revolver,RSW-1,$125.00",
  "16,Handguns,HK USP 45 Auto Pistol w/ Additional Barrel,25-115946,$1.00",
  "17,Handguns,Bond Arms Defender 45 Colt/410 Gauge Double-Barrel,99999,$1.00",
  "19,Handguns,Glock 19 Gen 4 9x19 Pistol,X4444,$1.00",
  "20,Handguns,Kel-Tec P17 22LR Pistol,NSN,$1.00",
  "21,Handguns,Thompson Center Contender 22 Hornet Rifle,558736,$700.00",
  "22,Handguns,Thompson Center Contender 44 REM Mag Pistol,60232,$275.00",
  "27,Handguns,Colt Single Action Frontier Scout 22 Cal Revolver,F12345,$1.00",
  "92,Shotguns,Mossberg 835 12Ga Pump Action Shotgun,UM55826,$1.00",
  "93,Handguns,Walther P22 22LR Pistol,N12345,$1.00",
  "105,Handguns,Springfield Armory 1911-A1 45 Cal Pistol,NA52664,$400.00",
  "110,Handguns,Auto-Ordnance 1911 A1 US ARMY Series 80,AOAC2007,$1.00",
  "118,Shotguns,Maverick by Mossberg Model 88 12-Gauge Shotgun,MV56267P,$1.00",
  "119,Shotguns,Stevens 5100 12-Gauge Double Barrel Shotgun,Blank,$1.00",
].join("\n");

describe("real auction manifest", () => {
  const res = parseBatchSheet(REAL_SHEET);
  const byLot = (lot: string) => res.rows.find((r) => r.lot === lot)!;

  it("resolves every row to a known make/model", () => {
    const unresolved = res.rows.filter((r) => r.unresolved);
    expect(unresolved).toHaveLength(0);
  });

  it("maps the Item Description column as the title blob", () => {
    expect(res.mapping["Item Description"]).toBe("title");
    expect(res.mapping["Current Bid"]).toBe("currentBid");
  });

  it("normalizes plural / variant category buckets", () => {
    expect(byLot("2").category).toBe("shotgun");
    expect(byLot("7").category).toBe("handgun");
    expect(byLot("9").category).toBe("rifle");
  });

  it("extracts tricky calibers (9x19, .45 Colt, 22 Hornet, 12-Gauge, 22 Cal)", () => {
    expect(byLot("19").caliber).toBe("9mm");
    expect(byLot("17").caliber).toBe(".45 Colt");
    expect(byLot("21").caliber).toBe(".22 Hornet");
    expect(byLot("118").caliber).toBe("12ga");
    expect(byLot("11").caliber).toBe(".22 LR");
  });

  it("normalizes multi-word brands", () => {
    expect(byLot("7").manufacturer).toBe("Smith & Wesson");
    expect(byLot("16").manufacturer).toBe("Heckler & Koch");
    expect(byLot("21").manufacturer).toBe("Thompson/Center");
    expect(byLot("110").manufacturer).toBe("Auto-Ordnance");
  });

  it("strips dollar signs from current bid", () => {
    expect(byLot("8").currentBid).toBe(55);
    expect(byLot("105").currentBid).toBe(400);
  });
});

describe("make + model export (Manufacture typo header)", () => {
  const csv = [
    "Lot#, Manufacture, Model, Caliber, Current Bid",
    "21, Glock, 19 Gen 4, 9x19mm, $375.00",
    "8, Smith & Wesson, Model 23-2, .44 Magnum, $1.00",
    "1, Tippmann Ordnance, Gatling Hand-Crank Gun, 9mm, $1.00",
  ].join("\n");

  it("maps Manufacture → manufacturer and parses all rows", () => {
    const res = parseBatchSheet(csv);
    expect(res.mapping["Manufacture"] ?? res.mapping[" Manufacture"]?.trim()).toBeDefined();
    const mfgKey = Object.keys(res.mapping).find((k) => res.mapping[k] === "manufacturer");
    expect(mfgKey).toBeTruthy();
    expect(res.rows).toHaveLength(3);
    expect(res.rows.every((r) => !r.unresolved)).toBe(true);
    expect(res.rows.find((r) => r.lot === "21")!.manufacturer).toBe("Glock");
    expect(res.rows.find((r) => r.lot === "21")!.model).toBe("19 Gen 4");
    expect(res.rows.find((r) => r.lot === "21")!.currentBid).toBe(375);
  });
});

describe("model-only auction export (Lot# + Model + Caliber + Bid)", () => {
  const csv = [
    "Lot#,Model,Caliber,Current Bid",
    "7,Smith & Wesson Model 25-2 44 Magnum Revolver,44 Magnum,$55.00",
    "19,Glock 19 Gen 4 9x19 Pistol,9mm,$1.00",
  ].join("\n");

  it("parses rows without a separate Title or Make column", () => {
    const res = parseBatchSheet(csv);
    expect(res.rows).toHaveLength(2);
    expect(res.warnings.some((w) => w.includes("Model"))).toBe(true);
    expect(res.rows.every((r) => !r.unresolved)).toBe(true);
    expect(res.rows[0]!.manufacturer).toBe("Smith & Wesson");
    expect(res.rows[1]!.manufacturer).toBe("Glock");
  });
});
