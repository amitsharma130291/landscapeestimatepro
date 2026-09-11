import { describe, expect, it } from "vitest";
import { APP_RELEASE_MODE, buildOfferSchema, SALES_CONFIG } from "./salesConfig";

describe("SALES_CONFIG", () => {
  it("sales are disabled and there is no checkout destination configured", () => {
    expect(SALES_CONFIG.salesEnabled).toBe(false);
    expect(SALES_CONFIG.checkoutUrl).toBeNull();
  });
  it("the planned price is still $99, unchanged", () => {
    expect(SALES_CONFIG.plannedLifetimePriceCents).toBe(9900);
  });
});

describe("buildOfferSchema — sales-disabled structured data contains no active Offer", () => {
  it("returns undefined while salesEnabled is false, never a PreOrder or InStock offer", () => {
    const offer = buildOfferSchema("https://example.com/pricing/");
    expect(offer).toBeUndefined();
  });

  it("a page spreading the result in produces an object with NO 'offers' key at all, not offers: undefined", () => {
    const offer = buildOfferSchema();
    const schema = { "@type": "Product", name: "x", ...(offer ? { offers: offer } : {}) };
    expect("offers" in schema).toBe(false);
    expect(JSON.stringify(schema)).not.toContain("offers");
  });
});

describe("APP_RELEASE_MODE", () => {
  it("is one of the two values this architecture actually supports", () => {
    expect(["development", "free-beta"]).toContain(APP_RELEASE_MODE);
  });
  it("is never 'paid-launch' — this architecture has no real access-control strategy to back that claim", () => {
    expect(APP_RELEASE_MODE).not.toBe("paid-launch");
  });
});
