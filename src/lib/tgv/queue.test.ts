import { describe, expect, it } from "vitest";

import {
  isCompleteFirearmForTgvQueue,
  preferFirearmManufacturer,
} from "@/lib/tgv/queue";

describe("isCompleteFirearmForTgvQueue", () => {
  it("keeps complete firearms", () => {
    expect(isCompleteFirearmForTgvQueue("Savage Arms", "Axis 2 XP")).toBe(true);
    expect(isCompleteFirearmForTgvQueue("Glock", "19")).toBe(true);
    expect(isCompleteFirearmForTgvQueue("Browning", "X-Bolt 2", "Rifles")).toBe(true);
    expect(isCompleteFirearmForTgvQueue("North American Arms", "Mini-Revolver")).toBe(true);
    expect(isCompleteFirearmForTgvQueue("Beretta|Tikka", "Tikka T3x", "rifle")).toBe(true);
  });

  it("rejects optics, adapters, barrels, and accessory brands", () => {
    expect(isCompleteFirearmForTgvQueue("SIG SAUER", "Romeo-X")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Christensen Arms", "Rings")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Barrett", "MRAD Conversion Kit")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("SilencerCo", "Adapter")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Leupold", "BackCountry")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Burris", "Fullfield")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Magpul", "PMAG 30")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Streamlight", "TLR-1")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Thompson/Center", "Prohunter Rifle Barrel")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Winchester Ammunition", "Super X")).toBe(false);
    expect(isCompleteFirearmForTgvQueue("Random Co", "Widget 12")).toBe(false);
  });

  it("prefers firearm brand from piped importer strings", () => {
    expect(preferFirearmManufacturer("Beretta|Tikka")).toBe("Tikka");
  });
});
