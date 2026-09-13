import { afterEach, describe, expect, it } from "vitest";
import { APP_RELEASE_MODE, buildOfferSchema, getValidPriceValidUntil, SALES_CONFIG } from "./salesConfig";

// SALES_CONFIG is typed readonly (`as const`) so nothing in the app can
// accidentally mutate it, but these tests need to exercise states other
// than today's real config — cast past the readonly type and always
// restore the original values afterward so no other test file/case sees a
// mutated singleton.
const mutableSalesConfig = SALES_CONFIG as {
  salesEnabled: boolean;
  priceValidUntil: string | null;
};
const originalSalesConfig = { ...SALES_CONFIG };

describe("SALES_CONFIG", () => {
  it("sales are enabled — Dodo Payments checkout is live", () => {
    expect(SALES_CONFIG.salesEnabled).toBe(true);
  });
  it("the price is $99", () => {
    expect(SALES_CONFIG.plannedLifetimePriceCents).toBe(9900);
  });
});

describe("buildOfferSchema — sales-disabled structured data contains no active Offer", () => {
  afterEach(() => {
    mutableSalesConfig.salesEnabled = originalSalesConfig.salesEnabled;
  });

  it("returns undefined while salesEnabled is false, never a PreOrder or InStock offer", () => {
    mutableSalesConfig.salesEnabled = false;
    const offer = buildOfferSchema("https://example.com/pricing/");
    expect(offer).toBeUndefined();
  });

  it("a page spreading the result in produces an object with NO 'offers' key at all, not offers: undefined", () => {
    mutableSalesConfig.salesEnabled = false;
    const offer = buildOfferSchema();
    const schema = { "@type": "Product", name: "x", ...(offer ? { offers: offer } : {}) };
    expect("offers" in schema).toBe(false);
    expect(JSON.stringify(schema)).not.toContain("offers");
  });
});

describe("buildOfferSchema — sales enabled (the real, current state)", () => {
  afterEach(() => {
    mutableSalesConfig.salesEnabled = originalSalesConfig.salesEnabled;
    mutableSalesConfig.priceValidUntil = originalSalesConfig.priceValidUntil;
  });

  it("includes priceValidUntil only when a real, valid future date is configured", () => {
    mutableSalesConfig.salesEnabled = true;
    mutableSalesConfig.priceValidUntil = null;
    expect(buildOfferSchema()).not.toHaveProperty("priceValidUntil");

    mutableSalesConfig.priceValidUntil = "2099-12-31";
    expect(buildOfferSchema()).toHaveProperty("priceValidUntil", "2099-12-31");
  });

  it("never includes priceValidUntil for an invalid or past configured date", () => {
    mutableSalesConfig.salesEnabled = true;

    mutableSalesConfig.priceValidUntil = "2020-01-01"; // past
    expect(buildOfferSchema()).not.toHaveProperty("priceValidUntil");

    mutableSalesConfig.priceValidUntil = "2026-02-30"; // calendar-invalid
    expect(buildOfferSchema()).not.toHaveProperty("priceValidUntil");
  });

  it("returns a real InStock offer at the configured price", () => {
    mutableSalesConfig.salesEnabled = true;
    const offer = buildOfferSchema("https://example.com/pricing/");
    expect(offer).toMatchObject({ "@type": "Offer", price: "99", priceCurrency: "USD", availability: "https://schema.org/InStock" });
  });
});

describe("getValidPriceValidUntil", () => {
  afterEach(() => {
    mutableSalesConfig.priceValidUntil = originalSalesConfig.priceValidUntil;
  });

  it("returns null when no price expiration is configured (the default, permanent-price state)", () => {
    mutableSalesConfig.priceValidUntil = null;
    expect(getValidPriceValidUntil()).toBeNull();
  });

  it("returns null for a malformed (non YYYY-MM-DD) date string", () => {
    mutableSalesConfig.priceValidUntil = "12/31/2027";
    expect(getValidPriceValidUntil()).toBeNull();
  });

  it("returns null for a calendar-invalid date (Feb 30) rather than trusting Date's silent roll-forward", () => {
    mutableSalesConfig.priceValidUntil = "2026-02-30";
    expect(getValidPriceValidUntil(new Date("2026-01-01T00:00:00Z"))).toBeNull();
  });

  it("returns null for a date that is today or already in the past relative to referenceDate", () => {
    mutableSalesConfig.priceValidUntil = "2026-01-01";
    expect(getValidPriceValidUntil(new Date("2026-06-01T00:00:00Z"))).toBeNull(); // past
    expect(getValidPriceValidUntil(new Date("2026-01-01T00:00:00Z"))).toBeNull(); // same day, not strictly future
  });

  it("returns the raw ISO string for a valid, strictly-future date", () => {
    mutableSalesConfig.priceValidUntil = "2027-12-31";
    expect(getValidPriceValidUntil(new Date("2026-01-01T00:00:00Z"))).toBe("2027-12-31");
  });
});

describe("APP_RELEASE_MODE", () => {
  it("is one of the two values this architecture actually supports", () => {
    expect(["development", "licensed"]).toContain(APP_RELEASE_MODE);
  });
  it("is the real, current state — /app is license-gated, not an open free beta", () => {
    expect(APP_RELEASE_MODE).toBe("licensed");
  });
});
