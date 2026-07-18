import { describe, expect, it } from "vitest";

import { classifyLotTitle, isFirearmPricingLot } from "./lot-kind";

describe("classifyLotTitle — ammo", () => {
  it("excludes Winchester / Remington ammo boxes even with brand hints", () => {
    expect(
      classifyLotTitle(
        "Remington Golden Bullet Value Pack Brass Plated Hollow Points, Qty: 525 .22 LR",
      ),
    ).toBe("ammo");
    expect(
      classifyLotTitle("Winchester Dynapoint 22 WIN 45 Grain Hollow Point Copper Plated, Qty: 50"),
    ).toBe("ammo");
    expect(
      classifyLotTitle(
        "Winchester Super X High Brass Game Loads , 2-3/4in, 1-1/4oz, 8 Lead Shot 12ga",
      ),
    ).toBe("ammo");
    expect(classifyLotTitle("IMR 7828 SSC Smokeless Powder, Super Short Cut, 8 lbs")).toBe("ammo");
    expect(classifyLotTitle("Remington Express Buckshot 3in 00BK, Qty: 5/ 12ga")).toBe("ammo");
    expect(classifyLotTitle("American Eagle Automatic 124 Grain Metal Case Bullet 9mm")).toBe(
      "ammo",
    );
  });
});

describe("classifyLotTitle — accessories", () => {
  it("excludes magazines and optic-only lots", () => {
    expect(classifyLotTitle("Glock 19 Magazines 15rd — Lot of 3")).toBe("accessory");
    expect(classifyLotTitle("AR-15 Mag Pack 30rd")).toBe("accessory");
    expect(classifyLotTitle("Vortex Red Dot Scope Only")).toBe("accessory");
  });
});

describe("classifyLotTitle — firearms", () => {
  it("keeps complete guns", () => {
    expect(classifyLotTitle("Glock 19 Gen5 9mm Pistol")).toBe("firearm");
    expect(classifyLotTitle("Springfield Saint AR-15 5.56 Rifle SN 12345")).toBe("firearm");
    expect(classifyLotTitle("Remington 870 Express 12ga Pump Shotgun")).toBe("firearm");
    expect(classifyLotTitle("Winchester Model 70 Bolt Action .30-06")).toBe("firearm");
  });

  it("isFirearmPricingLot matches classifier", () => {
    expect(isFirearmPricingLot("Glock 19 Gen5")).toBe(true);
    expect(isFirearmPricingLot("Winchester Super X Game Loads 12ga")).toBe(false);
  });
});
