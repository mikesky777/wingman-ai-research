/**
 * SETUP and PRICE STRUCTURE are independent display concepts.
 * These are presentation-only helpers: they can never affect Survivor selection.
 */
import { describe, expect, it } from "vitest";
import { PRICE_STRUCTURE_LABEL, priceStructureOf, setupOf } from "./shared";

const base = { priceIntegrityStatus: null as string | null, priceIntegrityPolicyVersion: null as string | null };

describe("setupOf", () => {
  it("uses the primary setup", () => {
    expect(setupOf({ lanes: ["BASE", "MOMENTUM"] })).toBe("BASE");
  });

  it("keeps NONE as a valid setup state", () => {
    expect(setupOf({ lanes: [] })).toBe("NONE");
  });
});

describe("priceStructureOf", () => {
  it("returns NOT_EVALUATED when Price Integrity never ran", () => {
    expect(priceStructureOf(base)).toBe("NOT_EVALUATED");
    expect(PRICE_STRUCTURE_LABEL[priceStructureOf(base)]).toBe("—");
  });

  it("returns UNKNOWN only when an evaluation actually ran", () => {
    expect(
      priceStructureOf({ priceIntegrityStatus: null, priceIntegrityPolicyVersion: "price_integrity/v1.1" }),
    ).toBe("UNKNOWN");
    expect(
      priceStructureOf({ priceIntegrityStatus: "UNKNOWN", priceIntegrityPolicyVersion: "price_integrity/v1.1" }),
    ).toBe("UNKNOWN");
  });

  it("never shows an unevaluated REACCEL candidate as UNKNOWN", () => {
    const reaccel = { lanes: ["REACCEL"], ...base };
    expect(setupOf(reaccel)).toBe("REACCEL");
    expect(priceStructureOf(reaccel)).toBe("NOT_EVALUATED");
  });

  it("passes through evaluated statuses", () => {
    for (const status of ["HEALTHY", "CONCERN", "DAMAGED"]) {
      expect(
        priceStructureOf({ priceIntegrityStatus: status, priceIntegrityPolicyVersion: "price_integrity/v1.1" }),
      ).toBe(status);
    }
  });

  it("renders setup and price structure independently", () => {
    const none = { lanes: [], ...base };
    expect(setupOf(none)).toBe("NONE");
    expect(priceStructureOf(none)).toBe("NOT_EVALUATED");
    const damagedBase = {
      lanes: ["BASE"],
      priceIntegrityStatus: "DAMAGED",
      priceIntegrityPolicyVersion: "price_integrity/v1.1",
    };
    expect(setupOf(damagedBase)).toBe("BASE");
    expect(priceStructureOf(damagedBase)).toBe("DAMAGED");
  });
});
