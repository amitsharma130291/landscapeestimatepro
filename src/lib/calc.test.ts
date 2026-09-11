import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateExactPricingChainCents,
  calculateExactRequiredPriceCentsDecimal,
  calculateLabor,
  calculateMargin,
  calculateMarkup,
  calculatePriceFromMarkupCents,
  calculateProjectCostCents,
  calculateQuotePricingCents,
  calculateRequiredPriceCents,
  formatCurrency,
  formatPercent,
  fractionToPercent,
  marginFromMarkup,
  markupFromMargin,
  percentToFraction,
  ROUNDING_INCREMENTS,
  safe,
} from "./calc";
import type { MoneyCents } from "./money";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

describe("safe", () => {
  it("clamps NaN to 0", () => {
    expect(safe(NaN)).toBe(0);
  });
  it("clamps negative to 0", () => {
    expect(safe(-50)).toBe(0);
  });
  it("clamps Infinity to 0", () => {
    expect(safe(Infinity)).toBe(0);
  });
  it("passes through a normal positive number", () => {
    expect(safe(42.5)).toBe(42.5);
  });
});

describe("percentToFraction / fractionToPercent — the ONLY centralized percent<->decimal conversion", () => {
  it("35 (whole-number percent) becomes the decimal fraction 0.35, never 35", () => {
    expect(percentToFraction(35).toNumber()).toBeCloseTo(0.35, 10);
  });

  it("REGRESSION: a whole percent is never confused with an already-decimal fraction — 35 must not become 3500% or stay 35 when used as a fraction", () => {
    // If 35 were misinterpreted as already being a 0-1 fraction, multiplying
    // a cost by it would produce a wildly wrong (35x) result instead of the
    // correct 0.35x. percentToFraction(35) must divide by 100 exactly once.
    const directCost = cents(10000); // $100.00
    const overheadAtWhole35 = new Decimal(directCost).times(percentToFraction(35));
    expect(overheadAtWhole35.toNumber()).toBeCloseTo(3500, 10); // $35.00 overhead, not $3,500 or $35
  });

  it("0.35 fed directly to fractionToPercent becomes 35, never re-divided as if it were already a percent (0.35%)", () => {
    expect(fractionToPercent(0.35)).toBeCloseTo(35, 10);
    expect(fractionToPercent(0.35)).not.toBeCloseTo(0.35, 10);
  });

  it("percentToFraction / fractionToPercent round-trip exactly", () => {
    expect(fractionToPercent(percentToFraction(35))).toBeCloseTo(35, 10);
    expect(fractionToPercent(percentToFraction(0))).toBeCloseTo(0, 10);
    expect(fractionToPercent(percentToFraction(99.5))).toBeCloseTo(99.5, 10);
  });

  it("clamps out-of-range and non-finite percents to 0 rather than producing a negative or explosive fraction", () => {
    expect(percentToFraction(NaN).toNumber()).toBe(0);
    expect(percentToFraction(Infinity).toNumber()).toBe(0);
    expect(percentToFraction(-10).toNumber()).toBe(0);
    expect(percentToFraction(500).toNumber()).toBe(1); // clamped to 100%
  });
});

describe("calculateLabor — direct mode", () => {
  it("matches the brief's 3-person, 8-hour crew example: 24 person-hours, $768", () => {
    const result = calculateLabor({ mode: "direct", crewSize: 3, hours: 8, loadedRateCents: cents(3200) });
    expect(result.personHours).toBe(24);
    expect(result.laborCostCents).toBe(76800);
  });

  it("crew example from the corrected-logic spec: 3 workers x 8 elapsed hours = 24 person-hours -> $720 at $30/hr", () => {
    const result = calculateLabor({ mode: "direct", crewSize: 3, hours: 8, loadedRateCents: cents(3000) });
    expect(result.personHours).toBe(24);
    expect(result.laborCostCents).toBe(72000);
  });
});

describe("calculateLabor — production-rate mode (quantity ÷ rate, NEVER quantity × rate)", () => {
  it("matches the brief's mulch example: 8 yd3 at 2.5 yd3/person-hour = 3.2 person-hours", () => {
    const result = calculateLabor({
      mode: "production",
      quantity: 8,
      productionRate: 2.5,
      loadedRateCents: cents(3200),
    });
    expect(result.personHours).toBeCloseTo(3.2, 10);
    expect(result.laborCostCents).toBe(10240);
  });

  it("REGRESSION: 1,000 sq ft at 100 sq ft/person-hour is 10 person-hours, NOT 100,000", () => {
    const result = calculateLabor({ mode: "production", quantity: 1000, productionRate: 100, loadedRateCents: cents(3000) });
    expect(result.personHours).toBe(10);
    expect(result.personHours).not.toBe(100000);
    expect(result.laborCostCents).toBe(30000);
  });

  it("returns zero (not Infinity/NaN) when production rate is 0", () => {
    const result = calculateLabor({ mode: "production", quantity: 8, productionRate: 0, loadedRateCents: cents(3200) });
    expect(result.personHours).toBe(0);
    expect(result.laborCostCents).toBe(0);
  });
});

describe("calculateProjectCostCents — Smith Residence reference example", () => {
  // Materials $1,250 + Labor $768 + Equipment $180 + Delivery $180 + Other $100
  const inputs = {
    materialsCostCents: cents(125000),
    laborCostCents: cents(76800),
    equipmentCostCents: cents(18000),
    deliveryCostCents: cents(18000),
    otherCostCents: cents(10000),
    overheadPercent: 15,
  };

  it("direct cost is $2,478.00", () => {
    expect(calculateProjectCostCents(inputs).directCostCents).toBe(247800);
  });

  it("overhead allocation is $371.70 (~$372 as shown, rounded, in the brief)", () => {
    expect(calculateProjectCostCents(inputs).overheadAmountCents).toBe(37170);
  });

  it("exact true cost is $2,849.70 before display rounding", () => {
    expect(calculateProjectCostCents(inputs).trueCostCents).toBe(284970);
  });

  it("overhead is applied exactly once, equivalent to directCost x (1 + overheadRate)", () => {
    const result = calculateProjectCostCents(inputs);
    expect(result.trueCostCents).toBeCloseTo(result.directCostCents * 1.15, 0);
  });
});

describe("assembly-level overhead (spec example): direct 100, overhead 15%, target margin 35%", () => {
  it("true cost is 115.00, required rate is 176.923076...", () => {
    const trueCostCents = calculateProjectCostCents({
      materialsCostCents: cents(10000),
      laborCostCents: cents(0),
      equipmentCostCents: cents(0),
      deliveryCostCents: cents(0),
      otherCostCents: cents(0),
      overheadPercent: 15,
    }).trueCostCents;
    expect(trueCostCents).toBe(11500);
    const requiredRateCents = calculateRequiredPriceCents(trueCostCents, 35);
    expect(requiredRateCents).not.toBeNull();
    expect(requiredRateCents as number).toBe(17692); // half-up rounded cents of 17692.3076...
  });
});

describe("margin and markup (spec example): cost 100, price 150", () => {
  it("margin is 33.333...%, markup is 50%", () => {
    expect(calculateMargin(cents(15000), cents(10000))).toBeCloseTo(33.333333, 4);
    expect(calculateMarkup(cents(15000), cents(10000))).toBeCloseTo(50, 10);
  });
});

describe("calculateExactRequiredPriceCentsDecimal / calculateRequiredPriceCents", () => {
  it("solves margin (not markup): $2,850.00 true cost at 35% target margin = $4,384.6153...", () => {
    const exact = calculateExactRequiredPriceCentsDecimal(cents(285000), 35);
    expect(exact).not.toBeNull();
    expect((exact as Decimal).toNumber()).toBeCloseTo(438461.53846, 3);
  });

  it("minimum-job-audit reference example: $390.00 true cost at 35% margin = exactly $600.00", () => {
    expect(calculateRequiredPriceCents(cents(39000), 35)).toBe(60000);
  });

  it("returns null (blocked), not a clamped number, at exactly 100% target margin", () => {
    expect(calculateExactRequiredPriceCentsDecimal(cents(100000), 100)).toBeNull();
  });

  it("returns null above 100% target margin", () => {
    expect(calculateExactRequiredPriceCentsDecimal(cents(100000), 150)).toBeNull();
  });

  it("returns null for a negative target margin", () => {
    expect(calculateExactRequiredPriceCentsDecimal(cents(100000), -5)).toBeNull();
  });

  it("returns null for NaN/Infinity margin inputs rather than propagating them", () => {
    expect(calculateExactRequiredPriceCentsDecimal(cents(100000), NaN)).toBeNull();
    expect(calculateExactRequiredPriceCentsDecimal(cents(100000), Infinity)).toBeNull();
  });
});

describe("calculateQuotePricingCents — Smith Residence, end to end", () => {
  const pricing = calculateQuotePricingCents(cents(284970), 35, 100);

  it("never pre-rounds true cost — exactTrueCostCents is the full $2,849.70", () => {
    expect(pricing.exactTrueCostCents).toBe(284970);
  });

  it("exact required price is $4,384.1538... (from the UNROUNDED true cost), reported rounded half-up to the cent", () => {
    expect(pricing.exactRequiredPriceCents).toBe(438415); // 438415.3846... half-up -> 438415
  });

  it("rounded recommended price rounds UP to $4,385, never down or to nearest", () => {
    expect(pricing.roundedRecommendedPriceCents).toBe(438500);
  });

  it("expected gross profit is roundedRecommendedPriceCents minus the exact true cost ($1,535.30)", () => {
    expect(pricing.expectedGrossProfitCents).toBe(153530);
  });

  it("achieved margin is recomputed from the rounded price against exact true cost, at or just above the 35% target", () => {
    expect(pricing.achievedMargin).not.toBeNull();
    expect(pricing.achievedMargin as number).toBeGreaterThanOrEqual(35);
    expect(pricing.achievedMargin as number).toBeLessThan(35.1);
  });

  it("rounding up never erodes margin below target, at every supported increment", () => {
    // A required price rounded to the nearest or down could land below the
    // exact required price and silently miss the target margin — ceiling
    // rounding must never do that, for any increment.
    for (const increment of ROUNDING_INCREMENTS) {
      const p = calculateQuotePricingCents(cents(284970), 35, increment);
      expect(p.roundedRecommendedPriceCents).not.toBeNull();
      expect(p.roundedRecommendedPriceCents as number).toBeGreaterThanOrEqual(p.exactRequiredPriceCents as number);
      expect(p.achievedMargin as number).toBeGreaterThanOrEqual(35);
    }
  });

  it("returns every field as null when the target margin is blocked (>=100%), never a garbage price", () => {
    const blocked = calculateQuotePricingCents(cents(284970), 100, 100);
    expect(blocked.exactRequiredPriceCents).toBeNull();
    expect(blocked.roundedRecommendedPriceCents).toBeNull();
    expect(blocked.expectedGrossProfitCents).toBeNull();
    expect(blocked.achievedMargin).toBeNull();
  });
});

describe("calculateExactPricingChainCents — preserves fractional-cent precision through overhead and required price", () => {
  it("REGRESSION: a $101 direct cost at 21% overhead produces $1.22.21 exact true cost — the two-step calculateProjectCostCents+calculateQuotePricingCents path would round that to $1.22 BEFORE dividing by the margin remainder, recommending $1.88, which achieves only ~34.99% margin against the true (unrounded) cost — this function must recommend $1.89 instead, the price that actually clears 35%", () => {
    const pricing = calculateExactPricingChainCents(
      { materialsCostCents: cents(101), laborCostCents: cents(0), equipmentCostCents: cents(0), deliveryCostCents: cents(0), otherCostCents: cents(0), overheadPercent: 21 },
      35,
      1 // one-cent increment, so no increment-rounding masks the effect
    );

    // Fractional-cent intermediate values are preserved, not pre-rounded.
    expect(pricing.exactOverheadAmountCentsDecimal.toString()).toBe("21.21");
    expect(pricing.exactTrueCostCentsDecimal.toString()).toBe("122.21");
    // Reporting-only rounded figures still round HALF-UP to a whole cent —
    // these are legitimate accounting values, just never fed back into the
    // required-price division.
    expect(pricing.overheadAmountCents).toBe(21);
    expect(pricing.trueCostCents).toBe(122);

    // The exact required price (from the UNROUNDED true cost) is 188.0153...,
    // which must ceiling to 189 — NOT 188 (which is what dividing the
    // already-rounded $1.22 by 0.65 and ceiling-rounding would give).
    expect(pricing.exactRequiredPriceCentsDecimal).not.toBeNull();
    expect((pricing.exactRequiredPriceCentsDecimal as Decimal).toNumber()).toBeCloseTo(188.0153846, 6);
    expect(pricing.roundedRecommendedPriceCents).toBe(189);

    // Proves the actual financial claim: at the recommended price, the
    // margin against the TRUE (unrounded) cost never falls short of target —
    // the old two-step path's $1.88 recommendation would have landed at
    // (188 - 122.21) / 188 = 34.99...%, BELOW the 35% target.
    const exactTrueCost = pricing.exactTrueCostCentsDecimal.toNumber();
    const marginAtRecommendedPrice = ((pricing.roundedRecommendedPriceCents as number) - exactTrueCost) / (pricing.roundedRecommendedPriceCents as number);
    expect(marginAtRecommendedPrice * 100).toBeGreaterThanOrEqual(35);

    // And the OLD (buggy) two-step path really would have undershot, proving
    // this isn't a hypothetical — it's exactly what the prior implementation did.
    const oldRounded = calculateProjectCostCents({
      materialsCostCents: cents(101),
      laborCostCents: cents(0),
      equipmentCostCents: cents(0),
      deliveryCostCents: cents(0),
      otherCostCents: cents(0),
      overheadPercent: 21,
    });
    const oldPricing = calculateQuotePricingCents(oldRounded.trueCostCents, 35, 1);
    expect(oldPricing.roundedRecommendedPriceCents).toBe(188); // the bug this function fixes
    const oldMarginAtRecommendedPrice = ((oldPricing.roundedRecommendedPriceCents as number) - exactTrueCost) / (oldPricing.roundedRecommendedPriceCents as number);
    expect(oldMarginAtRecommendedPrice * 100).toBeLessThan(35); // confirms the old path missed target
  });

  it("required price landing EXACTLY on an increment boundary is left unchanged, never bumped up an extra increment", () => {
    // 0% margin (remainder = 1) with 0% overhead makes required price equal
    // direct cost exactly — $10.00 exactly, a clean multiple of the $1 increment.
    const pricing = calculateExactPricingChainCents(
      { materialsCostCents: cents(1000), laborCostCents: cents(0), equipmentCostCents: cents(0), deliveryCostCents: cents(0), otherCostCents: cents(0), overheadPercent: 0 },
      0,
      100
    );
    expect((pricing.exactRequiredPriceCentsDecimal as Decimal).toNumber()).toBe(1000);
    expect(pricing.roundedRecommendedPriceCents).toBe(1000); // unchanged — already exact
  });

  it("required price a mere 0.001 cent above an increment boundary still rounds UP to the next increment, never truncated back down", () => {
    // overheadPercent chosen so exact overhead is exactly 0.001 cent, pushing
    // the (0%-margin) required price to 5000.001 — just over the $50 (5000-cent) increment.
    const pricing = calculateExactPricingChainCents(
      { materialsCostCents: cents(5000), laborCostCents: cents(0), equipmentCostCents: cents(0), deliveryCostCents: cents(0), otherCostCents: cents(0), overheadPercent: 0.00002 },
      0,
      5000
    );
    expect((pricing.exactRequiredPriceCentsDecimal as Decimal).toNumber()).toBeCloseTo(5000.001, 3);
    expect(pricing.roundedRecommendedPriceCents).toBe(10000); // ceilings up a full increment, never stays at 5000
  });

  it("property sweep: achieved margin never falls below target across many fractional-overhead combinations, at 1-cent granularity", () => {
    for (const directCost of [101, 233, 567, 909, 1001, 4999]) {
      for (const overheadPercent of [7, 11, 13, 17, 19, 21, 23]) {
        for (const targetMarginPercent of [10, 25, 35, 49]) {
          const pricing = calculateExactPricingChainCents(
            { materialsCostCents: cents(directCost), laborCostCents: cents(0), equipmentCostCents: cents(0), deliveryCostCents: cents(0), otherCostCents: cents(0), overheadPercent },
            targetMarginPercent,
            1
          );
          const exactTrueCost = pricing.exactTrueCostCentsDecimal.toNumber();
          const price = pricing.roundedRecommendedPriceCents as number;
          const achievedAgainstExactCost = ((price - exactTrueCost) / price) * 100;
          expect(achievedAgainstExactCost).toBeGreaterThanOrEqual(targetMarginPercent - 1e-9);
        }
      }
    }
  });

  it("returns every field as null when the target margin is blocked, and the exact Decimal fields are also null (not a garbage Decimal)", () => {
    const blocked = calculateExactPricingChainCents(
      { materialsCostCents: cents(1000), laborCostCents: cents(0), equipmentCostCents: cents(0), deliveryCostCents: cents(0), otherCostCents: cents(0), overheadPercent: 15 },
      100,
      100
    );
    expect(blocked.exactRequiredPriceCentsDecimal).toBeNull();
    expect(blocked.exactRequiredPriceCents).toBeNull();
    expect(blocked.roundedRecommendedPriceCents).toBeNull();
    expect(blocked.expectedGrossProfitCents).toBeNull();
    expect(blocked.achievedMargin).toBeNull();
    // Direct cost / overhead / true cost are still reported — those don't
    // depend on the margin being valid.
    expect(blocked.directCostCents).toBe(1000);
    expect(blocked.overheadAmountCents).toBe(150);
  });
});

describe("markupFromMargin / marginFromMarkup", () => {
  it("a 35% margin round-trips through markup back to 35%", () => {
    const markup = markupFromMargin(35);
    expect(markup).not.toBeNull();
    expect(markup as number).toBeCloseTo(53.846153846, 6);
    expect(marginFromMarkup(markup as number)).toBeCloseTo(35, 6);
  });

  it("returns null (not Infinity) at exactly 100% margin — required price/markup conversion blocked", () => {
    expect(markupFromMargin(100)).toBeNull();
  });

  it("returns null above 100% margin too", () => {
    expect(markupFromMargin(150)).toBeNull();
  });

  it("marginFromMarkup never divides by zero — 0% markup is 0% margin", () => {
    expect(marginFromMarkup(0)).toBe(0);
  });
});

describe("margin vs markup — brief's worked distinction", () => {
  it("a 35% markup on $2,850.00 produces $3,847.50 (not the same as 35% margin)", () => {
    expect(calculatePriceFromMarkupCents(cents(285000), 35)).toBe(384750);
  });

  it("that $3,847.50 markup price only yields a 25.9% margin", () => {
    const margin = calculateMargin(cents(384750), cents(285000));
    expect(margin).not.toBeNull();
    expect(margin as number).toBeCloseTo(25.925926, 4);
  });

  it("a true 35% margin instead requires the full $4,384.62 selling price", () => {
    expect(calculateRequiredPriceCents(cents(285000), 35)).toBe(438462);
  });

  it("markup and margin diverge more as the target percentage grows", () => {
    const markupPrice = calculatePriceFromMarkupCents(cents(100000), 50);
    const marginPrice = calculateRequiredPriceCents(cents(100000), 50);
    expect(markupPrice).toBe(150000);
    expect(marginPrice).toBe(200000);
    expect(markupPrice).toBeLessThan(marginPrice as number);
  });
});

describe("calculateMargin", () => {
  it("returns null (not 0) when selling price is 0/unset", () => {
    expect(calculateMargin(cents(0), cents(50000))).toBeNull();
  });

  it("underpricing example: $3,850.00 quote against $2,850.00 true cost is a 25.9% margin", () => {
    const margin = calculateMargin(cents(385000), cents(285000));
    expect(margin).not.toBeNull();
    expect(margin as number).toBeCloseTo(25.974026, 4);
  });
});

describe("calculateMarkup", () => {
  it("returns null (not 0) when true cost is 0/unset", () => {
    expect(calculateMarkup(cents(50000), cents(0))).toBeNull();
  });

  it("computes profit over cost, distinct from margin", () => {
    expect(calculateMarkup(cents(438462), cents(285000))).toBeCloseTo(53.85, 1);
  });
});

describe("invalid inputs never produce NaN/Infinity in a public result", () => {
  it("safe() absorbs NaN, Infinity, and negative values", () => {
    expect(Number.isFinite(safe(NaN))).toBe(true);
    expect(Number.isFinite(safe(Infinity))).toBe(true);
    expect(Number.isFinite(safe(-Infinity))).toBe(true);
  });

  it("calculateProjectCostCents never returns NaN for a NaN input line", () => {
    const result = calculateProjectCostCents({
      materialsCostCents: NaN as unknown as MoneyCents,
      laborCostCents: cents(10000),
      equipmentCostCents: cents(0),
      deliveryCostCents: cents(0),
      otherCostCents: cents(0),
      overheadPercent: 15,
    });
    expect(Number.isFinite(result.directCostCents)).toBe(true);
    expect(Number.isFinite(result.trueCostCents)).toBe(true);
  });

  it("a very large but finite true cost still produces a finite required price", () => {
    const huge = cents(1e12);
    const price = calculateRequiredPriceCents(huge, 35);
    expect(price).not.toBeNull();
    expect(Number.isFinite(price as number)).toBe(true);
  });
});

describe("formatCurrency", () => {
  it("formats whole dollars with no cents by default", () => {
    expect(formatCurrency(cents(438500))).toBe("$4,385");
  });
  it("formats with cents when requested", () => {
    expect(formatCurrency(cents(438462), { cents: true })).toBe("$4,384.62");
  });
  it("renders an em dash for null rather than $0 or crashing", () => {
    expect(formatCurrency(null)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("renders an em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
  it("renders one decimal place by default", () => {
    expect(formatPercent(35)).toBe("35.0%");
  });
});
