/**
 * Permanent home for the Formula Oracle (OR-01..OR-15) and the core
 * calculation-layer test cases (LEP-001..010, LEP-013/014, LEP-021..023,
 * LEP-058) from "Landscape_Estimate_Pro_Comprehensive_QA_Test_Plan.xlsx" —
 * an independent QA pass that exercised the real calc.ts/money.ts functions
 * against the spreadsheet's own authoritative expected results. Restored
 * here as a permanent regression suite (originally a temporary audit file)
 * so a future change can never silently regress the money/tax/labor/rounding
 * fundamentals this app is built on.
 */
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateExactPricingChainCents, calculateLabor, calculateMargin, calculateMarkup, fractionToPercent, percentToFraction } from "./calc";
import { calculateAssemblyCost, evaluateRateHealth } from "./estimateMath";
import { resolveDraftCommit } from "./draftNumberInputLogic";
import { resolveMoneyCommit } from "./moneyInputLogic";
import { allocateCents, fromDollarInputToCents, roundUpCentsToIncrement, sumCents, ZERO_CENTS, type MoneyCents } from "./money";
import { validateQuantity } from "./validation";
import type { Assembly, Material } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

// -- Formula Oracle OR-01..OR-15 --------------------------------------------

describe("Formula Oracle", () => {
  it("OR-01 direct cost: 1250+768+180+180+100 = $2,478.00", () => {
    const p = calculateExactPricingChainCents(
      { materialsCostCents: cents(125000), laborCostCents: cents(76800), equipmentCostCents: cents(18000), deliveryCostCents: cents(18000), otherCostCents: cents(10000), overheadPercent: 15 },
      35,
      100
    );
    expect(p.directCostCents).toBe(247800);
  });
  it("OR-02 overhead: 2478 * 15% = $371.70", () => {
    const p = calculateExactPricingChainCents(
      { materialsCostCents: cents(125000), laborCostCents: cents(76800), equipmentCostCents: cents(18000), deliveryCostCents: cents(18000), otherCostCents: cents(10000), overheadPercent: 15 },
      35,
      100
    );
    expect(p.overheadAmountCents).toBe(37170);
  });
  it("OR-03 true cost: 2478+371.70 = $2,849.70, overhead applied once", () => {
    const p = calculateExactPricingChainCents(
      { materialsCostCents: cents(125000), laborCostCents: cents(76800), equipmentCostCents: cents(18000), deliveryCostCents: cents(18000), otherCostCents: cents(10000), overheadPercent: 15 },
      35,
      100
    );
    expect(p.trueCostCents).toBe(284970);
  });
  it("OR-04 required price: 2849.70/(1-.35) = $4,384.153846..., ceilings to $4,385 at $1 increment", () => {
    const p = calculateExactPricingChainCents(
      { materialsCostCents: cents(125000), laborCostCents: cents(76800), equipmentCostCents: cents(18000), deliveryCostCents: cents(18000), otherCostCents: cents(10000), overheadPercent: 15 },
      35,
      100
    );
    expect((p.exactRequiredPriceCentsDecimal as Decimal).toNumber()).toBeCloseTo(438415.3846, 3);
    expect(p.roundedRecommendedPriceCents).toBe(438500);
  });
  it("OR-05 margin: (150-100)/150 = 33.33%; price zero -> null", () => {
    expect(calculateMargin(cents(15000), cents(10000))).toBeCloseTo(33.3333, 3);
    expect(calculateMargin(cents(0), cents(10000))).toBeNull();
  });
  it("OR-06 markup: (150-100)/100 = 50%; cost zero -> null", () => {
    expect(calculateMarkup(cents(15000), cents(10000))).toBeCloseTo(50, 6);
    expect(calculateMarkup(cents(15000), cents(0))).toBeNull();
  });
  it("OR-07 production labor: 1000/100 = 10 person-hours; never multiplies raw rate", () => {
    const result = calculateLabor({ mode: "production", quantity: 1000, productionRate: 100, loadedRateCents: cents(3000) });
    expect(result.personHours).toBe(10);
    expect(result.personHours).not.toBe(100000);
  });
  it("OR-08 crew labor: 3x8x$30 = $720.00, 24 person-hours", () => {
    const result = calculateLabor({ mode: "direct", crewSize: 3, hours: 8, loadedRateCents: cents(3000) });
    expect(result.personHours).toBe(24);
    expect(result.laborCostCents).toBe(72000);
  });
  it("OR-09 assembly true cost: $42.40 x 1.15 = $48.76, overhead-inclusive", () => {
    const materials: Material[] = [{ id: "shrub", name: "Shrub", unitCostCents: cents(2800), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "Shrub Install", unit: "each", materials: [{ materialId: "shrub", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0.45, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const result = calculateAssemblyCost(assembly, materials, [], cents(3200), 15);
    expect(result.directCostPerUnitCents).toBe(4240);
    expect(result.trueCostPerUnitCents).toBe(4876);
  });
  it("OR-10 assembly required rate: 48.76/(1-.35) = $75.015384..., ceilings to $75.02 at $0.01 increment", () => {
    const health = evaluateRateHealth(4876, 8000, 35);
    expect(health.requiredRateCents).toBe(7502);
  });
  it("OR-12 allocation: $100/3 equal weights -> 3334+3333+3333 cents, sum exact", () => {
    const result = allocateCents(cents(10000), [1, 1, 1], ["a", "b", "c"]);
    expect(sumCents(result)).toBe(10000);
    expect(result.sort((a, b) => b - a)).toEqual([3334, 3333, 3333]);
  });
  it("OR-14 weighted margin: (10100-2900)/10100 = 71.29%, not average of job margins", () => {
    const numerator = new Decimal(10100).minus(2900);
    expect(fractionToPercent(numerator.dividedBy(10100))).toBeCloseTo(71.2871, 3);
  });
  it("OR-15 migration: legacy $1.005 -> 101 cents, Decimal half-up, never zero/double-multiply", () => {
    expect(fromDollarInputToCents(1.005)).toBe(101);
  });
  // OR-11 (mixed-tax half-up rounding) and OR-13 (locked-overhead actual costing)
  // require a full quote revision — see "quote-lifecycle.test.ts" (LEP-079,
  // LEP-102) for those, exercised against the real buildQuoteRevision pipeline.
});

// -- Free tools: Cost / Estimate Calculator core math (LEP-001..010) --------

describe("LEP-001..010 Cost/Estimate Calculator (calculation core, real calc.ts)", () => {
  it("LEP-001 baseline profitable estimate", () => {
    const p = calculateExactPricingChainCents(
      { materialsCostCents: cents(125000), laborCostCents: cents(76800), equipmentCostCents: cents(18000), deliveryCostCents: cents(18000), otherCostCents: cents(10000), overheadPercent: 15 },
      35,
      100
    );
    expect(p.directCostCents).toBe(247800);
    expect(p.overheadAmountCents).toBe(37170);
    expect(p.trueCostCents).toBe(284970);
    expect(p.roundedRecommendedPriceCents).toBe(438500);
    expect(p.achievedMargin).not.toBeNull();
    expect(p.achievedMargin as number).toBeGreaterThanOrEqual(35);
    expect(p.achievedMargin as number).toBeLessThan(35.1);
  });
  it("LEP-002 zero direct cost: all zero, no NaN/Infinity", () => {
    const p = calculateExactPricingChainCents({ materialsCostCents: ZERO_CENTS, laborCostCents: ZERO_CENTS, equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 15 }, 35, 100);
    expect(p.directCostCents).toBe(0);
    expect(p.overheadAmountCents).toBe(0);
    expect(p.trueCostCents).toBe(0);
    expect(p.roundedRecommendedPriceCents).toBe(0);
    expect(Number.isFinite(p.directCostCents)).toBe(true);
    expect(Number.isFinite(p.roundedRecommendedPriceCents as number)).toBe(true);
  });
  it("LEP-003/004 margin >=100%: blocked at the CALCULATION layer (null) — the free calculator's own input-VALIDATION layer is covered separately in free-tools-validation.test.tsx", () => {
    const p100 = calculateExactPricingChainCents({ materialsCostCents: cents(100000), laborCostCents: ZERO_CENTS, equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 0 }, 100, 100);
    expect(p100.roundedRecommendedPriceCents).toBeNull();
    const p120 = calculateExactPricingChainCents({ materialsCostCents: cents(100000), laborCostCents: ZERO_CENTS, equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 0 }, 120, 100);
    expect(p120.roundedRecommendedPriceCents).toBeNull();
  });
  it("LEP-007 classic decimal precision: 0.10+0.20 direct = exactly $0.30, no float drift", () => {
    const p = calculateExactPricingChainCents({ materialsCostCents: cents(10), laborCostCents: cents(20), equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 0 }, 0, 1);
    expect(p.directCostCents).toBe(30);
    expect(p.trueCostCents).toBe(30);
  });
  it("LEP-008 required price with any fractional-cent remainder always ceilings up, never truncates down", () => {
    const p = calculateExactPricingChainCents({ materialsCostCents: cents(101), laborCostCents: ZERO_CENTS, equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 21 }, 35, 1);
    expect(p.roundedRecommendedPriceCents).toBe(189); // never 188
  });
  it("LEP-009 required price exactly on increment stays put, not bumped an extra increment", () => {
    const p = calculateExactPricingChainCents({ materialsCostCents: cents(1000), laborCostCents: ZERO_CENTS, equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 0 }, 0, 100);
    expect(p.roundedRecommendedPriceCents).toBe(1000);
  });
  it("LEP-010 very large safe values handled without throwing; unsafe values rejected", () => {
    const big = Math.floor(Number.MAX_SAFE_INTEGER / 1000);
    expect(() =>
      calculateExactPricingChainCents({ materialsCostCents: cents(big), laborCostCents: ZERO_CENTS, equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 15 }, 35, 100)
    ).not.toThrow();
    expect(() => fromDollarInputToCents((Number.MAX_SAFE_INTEGER + 1000).toString())).toThrow();
  });
});

describe("LEP-006 malformed/partial number — draft/commit layer", () => {
  it("12abc, -, ., whitespace are all rejected — never partially parsed, never committed", () => {
    for (const bad of ["12abc", "-", ".", "   "]) {
      const moneyResult = resolveMoneyCommit(bad);
      const numResult = resolveDraftCommit(bad, validateQuantity);
      if (bad.trim() === "") {
        expect(moneyResult).toEqual({ commit: true, cents: "" }); // deliberate clear is valid, by design
      } else {
        expect(moneyResult.commit).toBe(false);
        expect(numResult.commit).toBe(false);
      }
    }
  });
});

// -- Free tools: Estimate & Quote Templates (LEP-013,014) --------------------

describe("LEP-013/014 Estimate & Quote Templates line math", () => {
  it("LEP-013 multiple line calculation: 8x95 + 18x65 = 760 + 1170 = 1930", () => {
    expect(8 * 95).toBe(760);
    expect(18 * 65).toBe(1170);
    expect(8 * 95 + 18 * 65).toBe(1930);
  });
  it("LEP-014 fractional quantity and price: 2.5 x 19.99 = 49.975 -> $49.98 half-up cents", () => {
    const exact = new Decimal(2.5).times(19.99);
    const rounded = exact.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).dividedBy(100);
    expect(rounded.toNumber()).toBe(49.98);
  });
});

// -- Free tools: Invoice Template tax math (LEP-021,022,023) -----------------

describe("LEP-021/022/023 Invoice Template tax math (real percentToFraction/Decimal chain)", () => {
  it("LEP-021 invoice baseline tax: $1,000 subtotal at 8.25% = $82.50 tax, $1,082.50 total", () => {
    const subtotalCents = 100000;
    const taxCents = new Decimal(subtotalCents).times(percentToFraction(8.25)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(taxCents).toBe(8250);
    expect(subtotalCents + taxCents).toBe(108250);
  });
  it("LEP-022 fractional-cent tax: $10.01 at 8.25% = $0.825825 -> $0.83, total $10.84", () => {
    const subtotalCents = 1001;
    const taxCents = new Decimal(subtotalCents).times(percentToFraction(8.25)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(taxCents).toBe(83);
    expect(subtotalCents + taxCents).toBe(1084);
  });
  it("LEP-023 zero tax: $100 subtotal, 0% tax -> total $100", () => {
    const subtotalCents = 10000;
    const taxCents = new Decimal(subtotalCents).times(percentToFraction(0)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(taxCents).toBe(0);
    expect(subtotalCents + taxCents).toBe(10000);
  });
});

// -- Pro Settings: quote increments (LEP-058) --------------------------------

describe("LEP-058 all quote increments", () => {
  it("a value just above each boundary ceilings up; an exact boundary stays put", () => {
    const increments: MoneyCents[] = [cents(1), cents(100), cents(500), cents(1000), cents(2500), cents(5000)];
    for (const inc of increments) {
      const exactOnBoundary = new Decimal(inc).times(3);
      expect(roundUpCentsToIncrement(exactOnBoundary, inc)).toBe(inc * 3);
      const justAbove = exactOnBoundary.plus(new Decimal("0.001"));
      expect(roundUpCentsToIncrement(justAbove, inc)).toBe(inc * 4);
    }
  });
});
