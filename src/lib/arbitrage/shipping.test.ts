import { describe, expect, it } from "vitest";

import { defaultOutboundShip, defaultOutboundShipFromLabel } from "./shipping";

describe("defaultOutboundShip", () => {
  it("handgun is 45", () => {
    expect(defaultOutboundShip("handgun")).toBe(45);
  });
  it("rifle and shotgun are 60", () => {
    expect(defaultOutboundShip("rifle")).toBe(60);
    expect(defaultOutboundShip("shotgun")).toBe(60);
  });
});

describe("defaultOutboundShipFromLabel", () => {
  it("maps spreadsheet categories", () => {
    expect(defaultOutboundShipFromLabel("Handguns")).toBe(45);
    expect(defaultOutboundShipFromLabel("Shotguns")).toBe(60);
    expect(defaultOutboundShipFromLabel("Semi-Automatic Rifles")).toBe(60);
  });
});
