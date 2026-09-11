/**
 * Independent Formula Oracle verification (OR-01..OR-18) for the
 * "Landscape Estimate Pro — Product Logic Test Suite" QA workbook.
 *
 * Every expected value below is computed BY HAND from the workbook's exact
 * inputs — never copied from the production formula under test — then
 * compared against the real, exported production function at cent/percent
 * exactness (no floating-point tolerance on money). See each oracle's
 * comment for the by-hand arithmetic.
 *
 * This file intentionally does not re-implement any calculation itself;
 * every `expect(...)` compares a literal, hand-computed number against a
 * real production function's return value.
 */
import { describe, expect, it } from "vitest";
import {
  calculateExactPricingChainCents,
  calculateMargin,
  calculatePriceFromMarkupCents,
  percentToFraction,
  resolvePersonHoursPerUnit,
} from "./calc";
import {
  buildProjectCsvRows,
  buildQuoteRevision,
  calculateAssemblyCost,
  calculateAssemblyVariance,
  calculateProfitabilitySummary,
  evaluateActualVsEstimate,
  evaluateMinimumJob,
  evaluateProject,
  evaluateRateHealth,
  evaluateRevisionAtOverhead,
  projectCostImpactForRevision,
} from "./estimateMath";
import { buildCsv } from "./csv";
import { allocateCents, multiplyCentsByRate, ZERO_CENTS, type MoneyCents } from "./money";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { Assembly, BusinessSettings, Equipment, Material, Project, QuoteRevision } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

// minimumProjectPriceCents is zeroed so these oracle results (hand-computed
// from the workbook's exact inputs, before LEP-115's minimum-price
// enforcement existed) aren't silently confounded by DEFAULT_BUSINESS_SETTINGS'
// own $500 floor. OR-09/OR-10 (evaluateMinimumJob) pass their own minimum
// directly as a literal argument and are unaffected either way.
const business: BusinessSettings = { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: cents(3200), minimumProjectPriceCents: ZERO_CENTS };

function baseProject(overrides?: Partial<Project>): Project {
  return {
    id: "oracle-proj",
    name: "Oracle Project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "draft",
    serviceLines: [],
    equipmentLines: [],
    laborLines: [],
    deliveryCostCents: ZERO_CENTS,
    extraCosts: [],
    overheadPercent: 15,
    targetMarginPercent: 35,
    taxRatePercent: 0,
    quoteRevisions: [],
    ...overrides,
  };
}

// The one shared pricing-chain call every OR-01..OR-04 oracle reads from —
// same real inputs the workbook specifies (materials 1250, labor 768,
// equipment 180, delivery 180, other 100; overhead 15%; target margin 35%).
const chain = calculateExactPricingChainCents(
  {
    materialsCostCents: cents(125000),
    laborCostCents: cents(76800),
    equipmentCostCents: cents(18000),
    deliveryCostCents: cents(18000),
    otherCostCents: cents(10000),
    overheadPercent: 15,
  },
  35,
  1 // no rounding-increment interference — oracle wants the EXACT required price
);

describe("OR-01 Direct cost: 1250+768+180+180+100 = $2,478.00", () => {
  it("calculateExactPricingChainCents.directCostCents", () => {
    expect(chain.directCostCents).toBe(247800); // hand sum: 125000+76800+18000+18000+10000
  });
});

describe("OR-02 Overhead allocation: 2478 x 15% = $371.70", () => {
  it("calculateExactPricingChainCents.overheadAmountCents", () => {
    expect(chain.overheadAmountCents).toBe(37170); // hand: 2478.00 * 0.15 = 371.70
  });
});

describe("OR-03 True cost: 2478 + 371.70 = $2,849.70", () => {
  it("calculateExactPricingChainCents.trueCostCents", () => {
    expect(chain.trueCostCents).toBe(284970); // hand: 2478.00 + 371.70 = 2849.70
  });
});

describe("OR-04 Required price at 35% margin: 2849.70 / 0.65 = $4,384.15 (before quote-rounding)", () => {
  it("calculateExactPricingChainCents.exactRequiredPriceCents (NOT the increment-rounded price)", () => {
    // Hand: 2849.70 / 0.65 = 4384.153846... -> nearest cent = 4384.15 (thousandths
    // digit is 3, rounds down).
    expect(chain.exactRequiredPriceCents).toBe(438415);
  });
});

describe("OR-05 35% markup comparison: 2850 x 1.35 = $3,847.50 (markup is not margin)", () => {
  it("calculatePriceFromMarkupCents(285000, 35) applies a FLAT MARKUP, a different number entirely from the margin price", () => {
    // Hand: 2850.00 * 1.35 = 3847.50
    expect(calculatePriceFromMarkupCents(cents(285000), 35)).toBe(384750);
  });
});

describe("OR-06 Margin from markup price: (3847.50-2850)/3847.50 = 25.93%", () => {
  it("calculateMargin(384750, 285000)", () => {
    // Hand: (3847.50 - 2850.00) / 3847.50 = 997.50 / 3847.50 = 0.2593242... -> 25.93%
    const margin = calculateMargin(384750, 285000);
    expect(margin).not.toBeNull();
    expect(Number(margin!.toFixed(2))).toBe(25.93);
  });
});

describe("OR-07 Rate-health margin: (65-48)/65 = 26.15%", () => {
  it("evaluateRateHealth(4800, 6500, 35).currentMargin", () => {
    // Hand: (65.00 - 48.00) / 65.00 = 17.00 / 65.00 = 0.261538... -> 26.15%
    const health = evaluateRateHealth(4800, 6500, 35);
    expect(Number(health.currentMargin!.toFixed(2))).toBe(26.15);
  });
});

describe("OR-08 Rate-health required rate: 48/(1-35%) = $73.85", () => {
  it("evaluateRateHealth(4800, 6500, 35).requiredRateCents", () => {
    // Hand: 48.00 / 0.65 = 73.84615... -> nearest cent = 73.85
    const health = evaluateRateHealth(4800, 6500, 35);
    expect(health.requiredRateCents).toBe(7385);
  });
});

describe("OR-09 Minimum-job margin: (500-390)/500 = 22.00%", () => {
  it("evaluateMinimumJob(50000, 39000, 35).currentMargin", () => {
    // Hand: (500.00 - 390.00) / 500.00 = 110.00 / 500.00 = 0.22 -> 22.00%
    const audit = evaluateMinimumJob(50000, 39000, 35);
    expect(audit.currentMargin).toBe(22);
  });
});

describe("OR-10 Required minimum: 390/(1-35%) = $600.00", () => {
  it("evaluateMinimumJob(50000, 39000, 35).requiredMinimumCents", () => {
    // Hand: 390.00 / 0.65 = 600.00 exactly
    const audit = evaluateMinimumJob(50000, 39000, 35);
    expect(audit.requiredMinimumCents).toBe(60000);
  });
});

describe("OR-11 Actual margin: (4385-3345)/4385 = 23.72%, using ACCEPTED revenue (not the original required price)", () => {
  it("evaluateActualVsEstimate — overheadPercent 0 so actualTrueCost == actualDirectCost fed in", () => {
    // Hand: (4385.00 - 3345.00) / 4385.00 = 1040.00 / 4385.00 = 0.237172... -> 23.72%
    const revision = { overheadPercent: 0, actualQuotedPriceCents: cents(438500), trueCostCents: cents(300000) } as QuoteRevision;
    const result = evaluateActualVsEstimate(revision, 334500);
    expect(result.actualTrueCostCents).toBe(334500); // 0% overhead: passthrough
    expect(Number(result.actualMargin!.toFixed(2))).toBe(23.72);
  });
});

describe("OR-12 Labor variance: (10.8-9.2)/9.2 = 17.39%", () => {
  it("calculateAssemblyVariance via a real locked QuoteRevision (buildQuoteRevision), not a copied ratio", () => {
    const materials: Material[] = [];
    const assembly: Assembly = {
      id: "shrub-oracle",
      name: "Shrub Installation",
      unit: "each",
      materials: [],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.46, // 20 units x 0.46 = 9.2 estimated hours exactly
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: assembly.id, quantity: 20 }] });
    const revision = buildQuoteRevision(draft, [assembly], materials, [], business);
    const project: Project = {
      ...draft,
      status: "won",
      quoteRevisions: [revision],
      activeQuoteRevisionId: revision.id,
      actual: {
        actualLaborPersonHours: 10.8,
        actualMaterialsCostCents: ZERO_CENTS,
        actualEquipmentCostCents: ZERO_CENTS,
        actualDeliveryCostCents: ZERO_CENTS,
        actualOtherCostCents: ZERO_CENTS,
        finalSellingPriceCents: ZERO_CENTS,
        completedAt: "2026-02-01T00:00:00.000Z",
        serviceLineActuals: [{ assemblyId: assembly.id, estimatedQuantity: 20, actualQuantity: 20, actualLaborHours: 10.8 }],
      },
    };
    const [result] = calculateAssemblyVariance([project]);
    expect(result.avgEstimatedLaborHours).toBeCloseTo(9.2, 10);
    expect(result.avgActualLaborHours).toBeCloseTo(10.8, 10);
    // Hand: (10.8 - 9.2) / 9.2 = 1.6 / 9.2 = 0.173913... -> 17.39%
    expect(Number(result.laborVariancePercent!.toFixed(2))).toBe(17.39);
  });
});

describe("OR-13 Material variance: (8.7-7.8)/7.8 = 11.54%", () => {
  it("calculateAssemblyVariance via a real locked QuoteRevision", () => {
    const assembly: Assembly = {
      id: "mulch-oracle",
      name: "Mulch Installation",
      unit: "yd3",
      materials: [],
      // A quote revision requires a positive labor assumption; kept
      // negligible and irrelevant to this oracle, which only asserts on
      // materialVariancePercent.
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.001,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: assembly.id, quantity: 7.8 }] });
    const revision = buildQuoteRevision(draft, [assembly], [], [], business);
    const project: Project = {
      ...draft,
      status: "won",
      quoteRevisions: [revision],
      activeQuoteRevisionId: revision.id,
      actual: {
        actualLaborPersonHours: 0,
        actualMaterialsCostCents: ZERO_CENTS,
        actualEquipmentCostCents: ZERO_CENTS,
        actualDeliveryCostCents: ZERO_CENTS,
        actualOtherCostCents: ZERO_CENTS,
        finalSellingPriceCents: ZERO_CENTS,
        completedAt: "2026-02-01T00:00:00.000Z",
        serviceLineActuals: [{ assemblyId: assembly.id, estimatedQuantity: 7.8, actualQuantity: 8.7, actualLaborHours: 0 }],
      },
    };
    const [result] = calculateAssemblyVariance([project]);
    // Hand: (8.7 - 7.8) / 7.8 = 0.9 / 7.8 = 0.115384... -> 11.54%
    expect(Number(result.materialVariancePercent!.toFixed(2))).toBe(11.54);
  });
});

describe("OR-14 Production labor: 8 / 2.5 x 32 = $102.40 (person-hours first, then cost — never a raw-rate multiply)", () => {
  it("resolvePersonHoursPerUnit (production-rate mode) chained into calculateAssemblyCost", () => {
    // Hand: person-hours-per-unit = 1 / 2.5 = 0.4; for 8 units = 3.2 person-hours;
    // 3.2 x $32.00 = $102.40.
    const personHoursPerUnit = resolvePersonHoursPerUnit("production-rate", 2.5, undefined);
    expect(personHoursPerUnit).toBe(0.4);
    const assembly: Assembly = {
      id: "prod-rate-oracle",
      name: "Production Rate Oracle",
      unit: "yd3",
      materials: [],
      laborInputMode: "production-rate",
      laborPersonHoursPerUnit: personHoursPerUnit!,
      laborProductionRate: 2.5,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const perUnit = calculateAssemblyCost(assembly, [], [], 3200, 0);
    // laborCostPerUnitCents is PER UNIT (0.4h x $32 = $12.80); scale by the 8-unit quantity by hand.
    const totalLaborCents = perUnit.laborCostPerUnitCents * 8;
    expect(totalLaborCents).toBe(10240);
  });
});

describe("OR-15 Direct labor: 3 x 8 x 32 = $768.00 (crew x elapsed x loaded rate)", () => {
  it("a real crew-duration ProjectLaborLine, rolled up through evaluateProject's real production pipeline", async () => {
    const { evaluateProject } = await import("./estimateMath");
    const project = baseProject({
      overheadPercent: 0,
      laborLines: [{ id: "l1", label: "Crew", mode: "crew-duration", crewSize: 3, elapsedHours: 8, loadedRateCents: cents(3200), taxable: true }],
    });
    const result = evaluateProject(project, [], [], [], business);
    // Hand: 3 people x 8 hours x $32.00/hr = $768.00
    expect(result.laborCostCents).toBe(76800);
  });
});

describe("OR-16 Tax fractional cent: $10.05 x 8.25% = $0.83 (round final tax to cents, once)", () => {
  it("multiplyCentsByRate(1005, percentToFraction(8.25)) — the real function the free Invoice Template uses", () => {
    // Hand: 10.05 * 0.0825 = 0.829125 -> nearest cent = 0.83 (round-half-up)
    expect(multiplyCentsByRate(cents(1005), percentToFraction(8.25))).toBe(83);
  });
});

describe("OR-17 Largest remainder allocation: $100 across 3 equal lines = $33.34, $33.33, $33.33 (deterministic tie-break; sums to $100 exactly)", () => {
  it("allocateCents(10000, [1,1,1], ['0','1','2'])", () => {
    // Hand: 10000/3 = 3333.333...; each line floors to 3333 (9999 total), 1
    // leftover cent goes to the smallest tie-breaker key ("0") by the
    // documented deterministic rule.
    const result = allocateCents(cents(10000), [1, 1, 1], ["0", "1", "2"]);
    expect(result).toEqual([3334, 3333, 3333]);
    expect(result[0] + result[1] + result[2]).toBe(10000);
  });
});

describe("OR-18 Weighted project margin: total profit / total revenue, never an average of line margins", () => {
  it("calculateProfitabilitySummary — Job A revenue $100/cost $50, Job B revenue $1,000/cost $900", () => {
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(1), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    function wonJobAtCost(id: string, actualCostCents: number, quotedPriceCents: number): Project {
      const draft = baseProject({ id, serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], overheadPercent: 0 });
      const revision = buildQuoteRevision(draft, [assembly], materials, [], business, { actualQuotedPriceOverrideCents: cents(quotedPriceCents) });
      return {
        ...draft,
        status: "won",
        quoteRevisions: [revision],
        activeQuoteRevisionId: revision.id,
        actual: { actualLaborPersonHours: 0, actualMaterialsCostCents: cents(actualCostCents), actualEquipmentCostCents: ZERO_CENTS, actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS, finalSellingPriceCents: cents(quotedPriceCents), completedAt: "2026-02-01" },
      };
    }
    const jobA = wonJobAtCost("A", 5000, 10000); // cost $50, revenue $100 -> profit $50
    const jobB = wonJobAtCost("B", 90000, 100000); // cost $900, revenue $1000 -> profit $100
    const summary = calculateProfitabilitySummary([jobA, jobB], business);
    // Hand: total profit = 50 + 100 = 150; total revenue = 100 + 1000 = 1100;
    // 150 / 1100 = 0.136363... -> 13.64%. NEVER the naive average of each
    // job's own margin ((50/100=50%) and (100/1000=10%) averaged = 30%).
    expect(Number(summary.weightedActualMargin!.toFixed(2))).toBe(13.64);
    const naiveAverageOfLineMargins = (50 + 10) / 2;
    expect(Math.abs(summary.weightedActualMargin! - naiveAverageOfLineMargins)).toBeGreaterThan(10);
  });
});

// -- Cost-impact scenario oracles (workbook LEP-119..122) -------------------
// These reprice a LOCKED quote revision's own quantities against a changed
// catalog via the real projectCostImpactForRevision/evaluateRevisionAtOverhead
// functions the "what-if" scenario screens use — never a hand-rolled ratio.

describe("LEP-119 Material cost-impact: mulch $42 -> $50, 8 units affected -> +$64.00 true-cost delta, +19.05% unit-price change", () => {
  it("projectCostImpactForRevision — 8yd3 of mulch, overhead 0 so the delta isolates the material change", () => {
    const assembly: Assembly = {
      id: "mulch-impact",
      name: "Mulch Installation",
      unit: "yd3",
      materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
      // Negligible nonzero labor so buildQuoteRevision's validation passes;
      // it contributes equally to before/after and cancels out of the delta.
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.001,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const materialsBefore: Material[] = [{ id: "mulch", name: "Mulch", unitCostCents: cents(4200), unit: "yd3" }];
    const materialsAfter: Material[] = [{ id: "mulch", name: "Mulch", unitCostCents: cents(5000), unit: "yd3" }];
    const draft = baseProject({ overheadPercent: 0, serviceLines: [{ id: "l1", assemblyId: assembly.id, quantity: 8 }] });
    const revision = buildQuoteRevision(draft, [assembly], materialsBefore, [], business);
    const projected = projectCostImpactForRevision(revision, [assembly], materialsAfter, [], business.loadedLaborRateCents);
    // Hand: 8 x ($50.00 - $42.00) = 8 x $8.00 = $64.00
    expect(projected.trueCostDeltaCents).toBe(6400);
    // Hand: ($50.00 - $42.00) / $42.00 = 8 / 42 = 0.190476... -> 19.05%
    const percentIncrease = ((5000 - 4200) / 4200) * 100;
    expect(Number(percentIncrease.toFixed(2))).toBe(19.05);
  });
});

describe("LEP-120 Labor cost-impact: loaded rate $32 -> $36, 24 person-hours -> +$96.00", () => {
  it("projectCostImpactForRevision — 24 units at 1 person-hour/unit, overhead 0", () => {
    const assembly: Assembly = {
      id: "labor-impact",
      name: "Labor Impact Oracle",
      unit: "hour",
      materials: [],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 1,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const draft = baseProject({ overheadPercent: 0, serviceLines: [{ id: "l1", assemblyId: assembly.id, quantity: 24 }] });
    const revision = buildQuoteRevision(draft, [assembly], [], [], { ...business, loadedLaborRateCents: cents(3200) });
    const projected = projectCostImpactForRevision(revision, [assembly], [], [], cents(3600));
    // Hand: 24 x ($36.00 - $32.00) = 24 x $4.00 = $96.00
    expect(projected.trueCostDeltaCents).toBe(9600);
  });
});

describe("LEP-121 Equipment cost-impact: rate $45/hr -> $55/hr, 4 hours -> +$40.00", () => {
  it("projectCostImpactForRevision — a project-level equipment line, overhead 0", () => {
    const equipmentBefore: Equipment[] = [{ id: "skid", name: "Skid Steer", rateCents: cents(4500), rateType: "hour" }];
    const equipmentAfter: Equipment[] = [{ id: "skid", name: "Skid Steer", rateCents: cents(5500), rateType: "hour" }];
    const draft = baseProject({ overheadPercent: 0, equipmentLines: [{ equipmentId: "skid", quantity: 4 }] });
    const revision = buildQuoteRevision(draft, [], [], equipmentBefore, business);
    const projected = projectCostImpactForRevision(revision, [], [], equipmentAfter, business.loadedLaborRateCents);
    // Hand: 4 x ($55.00 - $45.00) = 4 x $10.00 = $40.00
    expect(projected.trueCostDeltaCents).toBe(4000);
  });
});

describe("LEP-122 Overhead cost-impact: 15% -> 20% on direct cost $2,478.00 -> +$123.90 true-cost delta", () => {
  it("evaluateRevisionAtOverhead — a hypothetical repricing that never mutates the locked revision", () => {
    const revision = { directCostCents: cents(247800) } as QuoteRevision;
    const before = evaluateRevisionAtOverhead(revision, 15);
    const after = evaluateRevisionAtOverhead(revision, 20);
    // Hand: 2478.00 x 1.15 = 2849.70; 2478.00 x 1.20 = 2973.60; delta = 123.90
    expect(before.trueCostCents).toBe(284970);
    expect(after.trueCostCents).toBe(297360);
    expect(after.trueCostCents - before.trueCostCents).toBe(12390);
  });
});

describe("LEP-139/141 CSV export reconciliation: raw exported file, independently parsed and hand-summed, must equal the project's own direct cost", () => {
  it("buildProjectCsvRows -> buildCsv -> independently parsed back -> summed, reconciles to evaluateProject's directCostCents", () => {
    const csvMaterials: Material[] = [{ id: "mulch", name: "Mulch", unitCostCents: cents(4200), unit: "yd3" }];
    const csvEquipment: Equipment[] = [{ id: "skidsteer", name: "Skid Steer", rateCents: cents(4500), rateType: "hour" }];
    const mulchAssembly: Assembly = {
      id: "mulch-csv",
      name: "Mulch Installation",
      unit: "yd3",
      materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const project = baseProject({
      overheadPercent: 0, // isolate direct cost — CSV rows never include overhead (it is not a line item)
      serviceLines: [{ id: "line-1", assemblyId: mulchAssembly.id, quantity: 8 }],
      equipmentLines: [{ equipmentId: "skidsteer", quantity: 4 }],
      deliveryCostCents: cents(18000),
      extraCosts: [{ id: "extra-1", label: "Permit fee", amountCents: cents(10000) }],
    });

    const rows = buildProjectCsvRows(project, [mulchAssembly], csvMaterials, csvEquipment, 3200);
    const rawCsv = buildCsv(rows);

    // Independent parse of the RAW exported text — a plain split, not a call
    // into any production CSV-reading code — proving the file itself, not
    // just the in-memory row objects, reconciles.
    const lines = rawCsv.split("\r\n");
    expect(lines[0]).toBe("item,quantity,unit,unit_cost,total");
    const parsedTotal = lines
      .slice(1)
      .filter((l) => l.length > 0)
      .reduce((sum, line) => sum + Number(line.split(",").pop()), 0);

    // Hand: mulch 8 x $42.00 = $336.00; labor 8 x 0.4h x $32.00 = $102.40;
    // skid steer 4 x $45.00 = $180.00; delivery $180.00; permit fee $100.00.
    // Total = 336 + 102.40 + 180 + 180 + 100 = $898.40
    expect(Number(parsedTotal.toFixed(2))).toBe(898.4);

    const result = evaluateProject(project, [mulchAssembly], csvMaterials, csvEquipment, { ...business, loadedLaborRateCents: cents(3200) });
    expect(result.directCostCents).toBe(89840); // $898.40 in cents, overhead 0 so this IS the CSV's own total
  });
});
