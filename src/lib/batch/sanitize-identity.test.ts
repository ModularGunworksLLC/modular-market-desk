import { describe, expect, it } from "vitest";

import { sanitizeBatchRowIdentity } from "./sanitize-identity";

describe("sanitizeBatchRowIdentity", () => {
  it("re-parses Pearce TRANS / CAL titles before OA resolve", () => {
    const clean = sanitizeBatchRowIdentity({
      manufacturer: "Ruger",
      model: "10-22 SEMI TRANS 4413",
      caliber: ".22 LR",
      category: "handgun",
      lotTitle: "Ruger 10-22 SEMI TRANS 4413 .22 LR",
    });
    expect(clean.model).toBe("10/22");
    expect(clean.caliber).toBe(".22 LR");
    expect(clean.model).not.toMatch(/TRANS|SEMI/i);

    const american = sanitizeBatchRowIdentity({
      manufacturer: "Ruger",
      model: "AMERICAN 308CAL BOLT TRANS 4415",
      caliber: "",
      category: "handgun",
      lotTitle: "Ruger AMERICAN 308CAL BOLT TRANS 4415",
    });
    expect(american.model.toUpperCase()).toBe("AMERICAN");
    expect(american.caliber).toBe(".308");
    expect(american.category).toBe("rifle");

    const glock = sanitizeBatchRowIdentity({
      manufacturer: "Glock",
      model: "19 SEMI TRANS 4342",
      caliber: "9mm",
      category: "handgun",
      lotTitle: "Glock 19 SEMI TRANS 4342 9mm",
    });
    expect(glock.manufacturer).toBe("Glock");
    expect(glock.model).toMatch(/^19/);
    expect(glock.model).not.toMatch(/TRANS|SEMI/i);
  });

  it("leaves already-clean rows alone", () => {
    const row = {
      manufacturer: "Glock",
      model: "19 Gen5",
      caliber: "9mm",
      category: "handgun",
      lotTitle: "Glock 19 Gen5 9mm",
    };
    expect(sanitizeBatchRowIdentity(row)).toEqual(row);
  });
});
