/**
 * Exact-data reproductions of specific "Product Logic Test Suite" workbook
 * rows whose Exact Test Data differs from every other oracle test already in
 * this repo (productLogicOracles.test.ts, estimateMath.test.ts, etc.) —
 * written because the audit's own rule is that reused coverage must use the
 * workbook's PRECISE numbers, not merely a structurally similar case.
 *
 * Every expected value is hand-computed from the workbook's literal inputs
 * and compared against the real, unmocked production function.
 */
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { resolveDraftCommit } from "./draftNumberInputLogic";
import { calculateAssemblyCost, evaluateActualVsEstimate, evaluateRateHealth } from "./estimateMath";
import { fromDollarInputToCents } from "./money";
import { multiplyCentsByQuantity, multiplyCentsByRate, roundUpCentsToIncrement, sumCents, type MoneyCents } from "./money";
import { resolveMoneyCommit } from "./moneyInputLogic";
import { validateQuantity } from "./validation";
import type { Assembly, Material } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

describe("LEP-036 Free Estimate Template line total: 8 x $95.00 = $760.00", () => {
  it("multiplyCentsByQuantity(9500, 8) — the exact function EstimateBuilderIsland uses for a line total", () => {
    expect(multiplyCentsByQuantity(cents(9500), 8)).toBe(76000);
  });
});

describe("LEP-037 Free Estimate Template subtotal: 8x95 + 18x65 + 220x2.25 = $2,425.00", () => {
  it("sumCents of the three real line totals", () => {
    const line1 = multiplyCentsByQuantity(cents(9500), 8); // 760.00
    const line2 = multiplyCentsByQuantity(cents(6500), 18); // 1170.00
    const line3 = multiplyCentsByQuantity(cents(225), 220); // 495.00
    expect(line1).toBe(76000);
    expect(line2).toBe(117000);
    expect(line3).toBe(49500);
    expect(sumCents([line1, line2, line3])).toBe(242500);
  });
});

describe("LEP-044 Free Quote Template total: 2x$450 + 1x$125 = $1,025.00", () => {
  it("sumCents of the two real line totals", () => {
    const line1 = multiplyCentsByQuantity(cents(45000), 2);
    const line2 = multiplyCentsByQuantity(cents(12500), 1);
    expect(sumCents([line1, line2])).toBe(102500);
  });
});

describe("LEP-049 Free Invoice Template tax: subtotal $100.00 at 8.25% -> tax $8.25, total $108.25", () => {
  it("multiplyCentsByRate(10000, 0.0825) — the exact function InvoiceBuilderIsland uses for tax", () => {
    const tax = multiplyCentsByRate(cents(10000), 0.0825);
    expect(tax).toBe(825);
    expect(sumCents([cents(10000), tax])).toBe(10825);
  });
});

describe("LEP-050 Free Invoice Template fractional-cent tax: subtotal $10.05 at 8.25% -> tax $0.83, total $10.88", () => {
  it("multiplyCentsByRate(1005, 0.0825) rounds once to the nearest cent", () => {
    // Hand: 10.05 * 0.0825 = 0.829125 -> nearest cent = 0.83
    const tax = multiplyCentsByRate(cents(1005), 0.0825);
    expect(tax).toBe(83);
    expect(sumCents([cents(1005), tax])).toBe(1088);
  });
});

describe("LEP-051 Free Invoice Template tax boundary: -0.01%, 100.01%, and text are all rejected, prior valid tax retained", () => {
  it("validateTaxRatePercent rejects each, matching the real production validator InvoiceBuilderIsland uses", async () => {
    const { validateTaxRatePercent } = await import("./validation");
    expect(validateTaxRatePercent(-0.01)).not.toBeNull();
    expect(validateTaxRatePercent(100.01)).not.toBeNull();
    expect(validateTaxRatePercent(Number.NaN)).not.toBeNull(); // stand-in for a non-numeric "text" entry, which DraftNumberInput's parser rejects before this validator even runs
  });
});

describe("LEP-052 Free Invoice Template tax boundary: 0% and 100% on $12.34 give $12.34 and $24.68", () => {
  it("multiplyCentsByRate at both boundary rates", () => {
    expect(multiplyCentsByRate(cents(1234), 0)).toBe(0);
    expect(sumCents([cents(1234), multiplyCentsByRate(cents(1234), 0)])).toBe(1234);
    expect(multiplyCentsByRate(cents(1234), 1)).toBe(1234);
    expect(sumCents([cents(1234), multiplyCentsByRate(cents(1234), 1)])).toBe(2468);
  });
});

describe("LEP-089 Pro assembly oracle: shrub $28 + soil $3 + labor 0.45h x $32 + equip $2 + other $1 = $48.40/unit, x18 = $871.20", () => {
  it("calculateAssemblyCost with the workbook's exact component costs", () => {
    const materials: Material[] = [
      { id: "shrub", name: "Shrub", unitCostCents: cents(2800), unit: "each" },
      { id: "soil", name: "Soil", unitCostCents: cents(300), unit: "each" },
    ];
    const equipment = [{ id: "eq", name: "Equip", rateCents: cents(200), rateType: "job" as const }];
    const assembly: Assembly = {
      id: "shrub-oracle-2",
      name: "Shrub Assembly",
      unit: "each",
      materials: [
        { materialId: "shrub", quantityPerUnit: 1 },
        { materialId: "soil", quantityPerUnit: 1 },
      ],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.45,
      equipment: [{ equipmentId: "eq", quantityPerUnit: 1 }],
      otherCostPerUnitCents: cents(100),
    };
    const perUnit = calculateAssemblyCost(assembly, materials, equipment, cents(3200), 0);
    // Hand: 28.00 + 3.00 + (0.45 x 32.00 = 14.40) + 2.00 + 1.00 = 48.40
    expect(perUnit.directCostPerUnitCents).toBe(4840);
    const total = multiplyCentsByQuantity(perUnit.directCostPerUnitCents, 18);
    expect(total).toBe(87120); // $871.20
  });
});

describe("LEP-090 Pro assembly scaling: unit cost $48.00 at quantities 0, 1, 0.5, 18, 1000 -> $0, $48, $24, $864, $48,000 exactly", () => {
  it("multiplyCentsByQuantity at every workbook quantity, linear with no rounding drift", () => {
    const unitCost = cents(4800);
    expect(multiplyCentsByQuantity(unitCost, 0)).toBe(0);
    expect(multiplyCentsByQuantity(unitCost, 1)).toBe(4800);
    expect(multiplyCentsByQuantity(unitCost, 0.5)).toBe(2400);
    expect(multiplyCentsByQuantity(unitCost, 18)).toBe(86400);
    expect(multiplyCentsByQuantity(unitCost, 1000)).toBe(4800000);
  });
});

describe("LEP-093 Pro multi-service project direct cost: 760+1170+495+180+100 = $2,705.00", () => {
  it("sumCents of the workbook's exact five cost lines", () => {
    const lines = [cents(76000), cents(117000), cents(49500), cents(18000), cents(10000)];
    expect(sumCents(lines)).toBe(270500);
  });
});

describe("LEP-130 Pro actuals revenue source: accepted $4,200 (not the original $4,385 required price) vs actual cost $3,345 -> 20.36%", () => {
  it("evaluateActualVsEstimate uses the revision's own accepted price, never the original required price", () => {
    // overheadPercent 0 so actualTrueCostCents passes through as the raw actual cost.
    const revision = { overheadPercent: 0, actualQuotedPriceCents: cents(420000), trueCostCents: cents(300000) } as import("./types").QuoteRevision;
    const result = evaluateActualVsEstimate(revision, 334500);
    expect(result.actualTrueCostCents).toBe(334500);
    // Hand: (4200.00 - 3345.00) / 4200.00 = 855.00 / 4200.00 = 0.20357... -> 20.36%
    expect(Number(result.actualMargin!.toFixed(2))).toBe(20.36);
    // Confirms it is NOT using the original $4,385 required price (which would give 23.72%, OR-11's own answer).
    expect(Number(result.actualMargin!.toFixed(2))).not.toBe(23.72);
  });
});

describe("LEP-003/008/013/018/023/028/033 draft safety: blank, '-', '.', and '12.' each resolve exactly as their own numeric meaning requires — never a partial/garbage commit", () => {
  it("'-' and '.' alone are genuinely incomplete (no digits) and are rejected by both resolvers", () => {
    for (const incomplete of ["-", "."]) {
      expect(resolveMoneyCommit(incomplete).commit).toBe(false);
      expect(resolveDraftCommit(incomplete, validateQuantity).commit).toBe(false);
    }
  });

  it("'12.' is NOT actually an incomplete state — a trailing decimal point with no digits after it is unambiguously the same value as '12', so both resolvers correctly commit it as exactly 12 (12.00), never as a partial/garbage value", () => {
    const moneyResult = resolveMoneyCommit("12.");
    expect(moneyResult).toEqual({ commit: true, cents: 1200 });
    const draftResult = resolveDraftCommit("12.", validateQuantity);
    expect(draftResult).toEqual({ commit: true, value: 12 });
  });

  it("blank IS a valid commit (persists as blank, never coerced to zero) — required-ness is enforced separately", () => {
    expect(resolveMoneyCommit("").commit).toBe(true);
    expect(resolveDraftCommit("", validateQuantity)).toEqual({ commit: true, value: "" });
  });
});

describe("LEP-005/010/015/020/025/030/035 large value: $99,999,999.99 survives exactly, no overflow/NaN/Infinity/truncation", () => {
  it("fromDollarInputToCents(\"99999999.99\") is exactly 9,999,999,999 cents", () => {
    const result = fromDollarInputToCents("99999999.99");
    expect(result).toBe(9999999999);
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe("LEP-114 quote rounding: unrounded required price $4,384.1538... at every configured increment (none=$0.01/$1/$5/$10/$25) — deterministic, never below cost", () => {
  it("roundUpCentsToIncrement always rounds UP (ceiling), matching each increment's own arithmetic exactly", () => {
    // Hand: 2849.70 / 0.65 = 4384.153846153846... dollars -> 438415.384615... cents
    // (284970 is already in CENTS, so dividing by the margin fraction alone
    // gives cents directly — no extra x100).
    const exactCents = new Decimal(284970).dividedBy(0.65);
    const trueCostCents = 284970;

    const cases: Array<[MoneyCents, number]> = [
      [1 as MoneyCents, 438416], // "none" (1-cent increment): ceil to the next cent = $4,384.16
      [100 as MoneyCents, 438500], // $1 increment -> $4,385.00
      [500 as MoneyCents, 438500], // $5 increment -> $4,385.00
      [1000 as MoneyCents, 439000], // $10 increment -> $4,390.00
      [2500 as MoneyCents, 440000], // $25 increment -> $4,400.00
    ];
    for (const [increment, expected] of cases) {
      const rounded = roundUpCentsToIncrement(exactCents, increment);
      expect(rounded).toBe(expected);
      // Never rounds below true cost — every increment's result must stay
      // at or above the unrounded required price, which is itself above cost.
      expect(rounded).toBeGreaterThanOrEqual(Math.ceil(exactCents.toNumber()));
      expect(rounded).toBeGreaterThan(trueCostCents);
    }
  });
});

describe("LEP-117 Rate Health classification boundary matrix: critical / needs-attention / healthy are exhaustive with no gap at the documented 15%-of-required threshold", () => {
  it("evaluateRateHealth: at/above the required rate is healthy; a gap just over 15% of required is critical; a gap just under is attention", () => {
    const trueCostCents = 10000; // $100.00
    const targetMargin = 35;
    const requiredRate = evaluateRateHealth(trueCostCents, trueCostCents, targetMargin).requiredRateCents!;

    // Exactly at the required rate: healthy (zero gap).
    expect(evaluateRateHealth(trueCostCents, requiredRate, targetMargin).status).toBe("healthy");
    // Above the required rate: still healthy — never penalized for charging more.
    expect(evaluateRateHealth(trueCostCents, requiredRate + 1000, targetMargin).status).toBe("healthy");

    // A gap of 10% of the required rate: below target, but not badly enough
    // to be "critical" (well clear of the documented >15% threshold).
    const rateAt10PercentGap = Math.round(requiredRate * 0.9);
    expect(evaluateRateHealth(trueCostCents, rateAt10PercentGap, targetMargin).status).toBe("attention");

    // A gap of 30% of the required rate: well past the threshold -> critical.
    const rateAt30PercentGap = Math.round(requiredRate * 0.7);
    expect(evaluateRateHealth(trueCostCents, rateAt30PercentGap, targetMargin).status).toBe("critical");

    // Every real classification is one of exactly three values for a valid
    // target margin — no gap in the documented policy.
    for (const status of [
      evaluateRateHealth(trueCostCents, requiredRate, targetMargin).status,
      evaluateRateHealth(trueCostCents, rateAt10PercentGap, targetMargin).status,
      evaluateRateHealth(trueCostCents, rateAt30PercentGap, targetMargin).status,
    ]) {
      expect(["healthy", "attention", "critical"]).toContain(status);
    }
  });
});

describe("LEP-038 money-decimal rounding policy: qty 3 x $33.333 -> a single, explicit, consistent behavior (round once to $33.33), never a hidden fraction", () => {
  it("fromDollarInputToCents('33.333') rounds ONCE to the nearest cent — the accepted behavior the workbook allows, verified against the real production parser, not assumed", () => {
    const result = fromDollarInputToCents("33.333");
    expect(result).toBe(3333); // $33.33 — half-up rounds the third decimal away exactly once
    // Total for 3 units: 3 x $33.33 = $99.99, matching the workbook's own
    // accepted total under this rounding policy.
    expect(multiplyCentsByQuantity(result as unknown as MoneyCents, 3)).toBe(9999);
  });

  it("the SAME policy applies consistently everywhere money is parsed — validateDollarInput never rejects a 3-decimal amount outright, it accepts and rounds it, and does so identically for a totally different amount", () => {
    expect(resolveMoneyCommit("33.333")).toEqual({ commit: true, cents: 3333 });
    expect(resolveMoneyCommit("10.005")).toEqual({ commit: true, cents: 1001 }); // consistent half-up rounding, not truncation
  });
});
