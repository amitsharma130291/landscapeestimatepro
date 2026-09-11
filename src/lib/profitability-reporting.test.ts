/**
 * Permanent home for the Pro Analysis/Actuals test cases from the QA
 * workbook (Service Rate Health, Minimum Job Audit, Cost Impact, Estimate
 * vs Actual, Historical Variance, Profitability Summary — LEP-088..116),
 * plus the profitability-exclusion-visibility fix and the new
 * overhead-change scenario feature (DEF-06) added afterward.
 */
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  buildQuoteRevision,
  calculateActualsCategoryComparison,
  calculateAssemblyVariance,
  calculateProfitabilitySummary,
  classifyCostImpact,
  evaluateActualVsEstimate,
  evaluateMinimumJob,
  evaluateOverheadScenario,
  evaluateRateHealth,
  snapshotCostImpact,
} from "./estimateMath";
import { roundUpCentsToIncrement, ZERO_CENTS, type MoneyCents } from "./money";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { Assembly, BusinessSettings, Material, Project } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

// minimumProjectPriceCents is zeroed so this file's profitability/actuals
// assertions aren't silently confounded by DEFAULT_BUSINESS_SETTINGS' own
// $500 floor (LEP-115) — that enforcement mechanism gets its own dedicated
// tests in minimumPrice.test.ts. Calls below that pass DEFAULT_BUSINESS_SETTINGS
// directly (not this `business`) always supply an explicit
// actualQuotedPriceOverrideCents, which bypasses the floor either way.
const business: BusinessSettings = { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: cents(3200), minimumProjectPriceCents: ZERO_CENTS };

function baseProject(overrides?: Partial<Project>): Project {
  return {
    id: "qa-proj",
    name: "QA Project",
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

// -- Service Rate Health (LEP-088..091) --------------------------------------

describe("LEP-088..091 Service Rate Health", () => {
  it("LEP-088 healthy service: current rate above required -> Healthy", () => {
    const health = evaluateRateHealth(4876, 8000, 35);
    expect(health.gapPerUnitCents).toBeLessThanOrEqual(0);
    expect(health.status).toBe("healthy");
  });
  it("LEP-089 attention threshold exact: gap exactly 15% of required -> attention, not critical", () => {
    const health = evaluateRateHealth(6500, 8500, 35);
    expect(health.requiredRateCents).toBe(10000);
    expect(health.gapPerUnitCents).toBe(1500);
    expect(health.status).toBe("attention");
  });
  it("LEP-090 critical just above threshold: gap 15%+1 cent -> critical", () => {
    const health = evaluateRateHealth(6500, 8499, 35);
    expect(health.gapPerUnitCents).toBe(1501);
    expect(health.status).toBe("critical");
  });
  it("LEP-091 current rate zero: no Infinity, explicit status", () => {
    const health = evaluateRateHealth(4876, 0, 35);
    expect(Number.isFinite(health.gapPerUnitCents as number)).toBe(true);
    expect(health.currentMargin).toBeNull();
    expect(["critical", "attention"]).toContain(health.status);
  });
});

// -- Minimum Job Audit (LEP-092,094) -----------------------------------------

describe("LEP-092/094 Minimum Job Audit", () => {
  it("LEP-092 representative minimum cost: current margin 22%, required minimum $600", () => {
    const result = evaluateMinimumJob(50000, 39000, 35);
    expect(result.currentMargin).toBeCloseTo(22, 6);
    expect(result.requiredMinimumCents).toBe(60000);
  });
  it("LEP-094 minimum price quote increment ceilings correctly", () => {
    expect(roundUpCentsToIncrement(new Decimal(60000), cents(2500))).toBe(60000);
    expect(roundUpCentsToIncrement(new Decimal(60001), cents(2500))).toBe(62500);
  });
});

// -- Cost Impact (LEP-095,097,098,099,100,101) -------------------------------

describe("LEP-095/097/098/099/100/101 Cost Impact classification", () => {
  const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS, currentRateCents: cents(10000) };

  function makeWorkspace(materialCostCents: number, quotedPriceCents: number) {
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(materialCostCents), unit: "each" }];
    const project = baseProject({ id: "p1", status: "sent", serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    const revision = buildQuoteRevision(project, [assembly], materials, [], DEFAULT_BUSINESS_SETTINGS, { actualQuotedPriceOverrideCents: cents(quotedPriceCents) });
    const quotedProject = { ...project, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    return { assemblies: [assembly], templates: [], projects: [quotedProject], materials, equipment: [], business: DEFAULT_BUSINESS_SETTINGS };
  }

  it("LEP-095/097 material cost increase crosses target -> worsened", () => {
    const ws = makeWorkspace(10000, 13000);
    const before = snapshotCostImpact("material", "m", ws);
    const wsAfter = { ...ws, materials: [{ id: "m", name: "M", unitCostCents: cents(20000), unit: "each" as const }] };
    const after = snapshotCostImpact("material", "m", wsAfter);
    const impact = classifyCostImpact(before, after).find((i) => i.projectId === "p1")!;
    expect(impact.impactDirection).toBe("worsened");
    expect(impact.trueCostDeltaCents).toBeGreaterThan(0);
  });
  it("LEP-099 recovered above: decreasing cost after being below target crosses back above", () => {
    const ws = makeWorkspace(20000, 21000);
    const before = snapshotCostImpact("material", "m", ws);
    expect(before.belowTargetProjectIds).toContain("p1");
    const wsAfter = { ...ws, materials: [{ id: "m", name: "M", unitCostCents: cents(2000), unit: "each" as const }] };
    const after = snapshotCostImpact("material", "m", wsAfter);
    const impact = classifyCostImpact(before, after).find((i) => i.projectId === "p1")!;
    expect(impact.thresholdTransition).toBe("recovered-above");
    expect(impact.impactDirection).toBe("improved");
  });
  it("LEP-100 unchanged within tolerance: an unrelated re-snapshot classifies unchanged", () => {
    const ws = makeWorkspace(10000, 20000);
    const before = snapshotCostImpact("material", "m", ws);
    const after = snapshotCostImpact("material", "m", ws);
    const impact = classifyCostImpact(before, after).find((i) => i.projectId === "p1")!;
    expect(impact.impactDirection).toBe("unchanged");
  });
  it("LEP-101 unrelated catalog change: a project not using the changed item is never marked affected", () => {
    const ws = makeWorkspace(10000, 20000);
    const snapshot = snapshotCostImpact("equipment", "does-not-exist", ws);
    expect(snapshot.affectedProjectIds).toEqual([]);
  });
});

// -- Estimate vs Actual (LEP-102,106) ----------------------------------------

describe("LEP-102/106 Estimate vs Actual", () => {
  it("LEP-102 baseline actual costing: margin ~12.14%", () => {
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], overheadPercent: 15 });
    const revision = buildQuoteRevision(project, [assembly], materials, [], { ...business, loadedLaborRateCents: cents(0) }, { actualQuotedPriceOverrideCents: cents(438500) });
    const comparison = evaluateActualVsEstimate(revision, 335000);
    expect(comparison.actualTrueCostCents).toBe(385250);
    expect(comparison.actualMargin as number).toBeCloseTo(12.14, 1);
  });
  it("LEP-106 estimated true cost zero: variance percent null (never Infinity)", () => {
    const zeroCostRevision = { overheadPercent: 0, actualQuotedPriceCents: cents(100), trueCostCents: cents(0) } as unknown as Parameters<typeof evaluateActualVsEstimate>[0];
    const comparison = evaluateActualVsEstimate(zeroCostRevision, 500);
    expect(comparison.costVariancePercent).toBeNull();
    expect(comparison.costVarianceCents).toBe(500);
  });
});

// -- Historical Variance (LEP-107,108,109) -----------------------------------

describe("LEP-107/108/109 Historical Variance", () => {
  function completedProjectWithLine(assembly: Assembly, estimatedQuantity: number, actualQuantity: number, actualLaborHours: number, index: number, materials: Material[]): Project {
    const draft = baseProject({ id: `p-${index}`, serviceLines: [{ id: "l1", assemblyId: assembly.id, quantity: estimatedQuantity }] });
    const revision = buildQuoteRevision(draft, [assembly], materials, [], business);
    return {
      ...draft,
      status: "won",
      quoteRevisions: [revision],
      activeQuoteRevisionId: revision.id,
      actual: {
        actualLaborPersonHours: actualLaborHours,
        actualMaterialsCostCents: ZERO_CENTS,
        actualEquipmentCostCents: ZERO_CENTS,
        actualDeliveryCostCents: ZERO_CENTS,
        actualOtherCostCents: ZERO_CENTS,
        finalSellingPriceCents: ZERO_CENTS,
        completedAt: "2026-02-01T00:00:00.000Z",
        serviceLineActuals: [{ assemblyId: assembly.id, estimatedQuantity, actualQuantity, actualLaborHours }],
      },
    };
  }

  it("LEP-107 locked production assumptions ignore a later catalog rate change", () => {
    const originalAssembly: Assembly = { id: "big", name: "Big", unit: "sqft", materials: [], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0.01, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = completedProjectWithLine(originalAssembly, 1000, 1000, 12, 0, []);
    expect(project.quoteRevisions[0].serviceLines[0].laborPersonHoursPerUnit).toBe(0.01);
    const [result] = calculateAssemblyVariance([project]);
    expect(result.avgEstimatedLaborHours).toBe(10);
    expect(result.laborVariancePercent).toBeCloseTo(20, 1);
  });
  it("LEP-108 different job sizes: totals-first ratio, not an average of per-job percentages", () => {
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const small = completedProjectWithLine(assembly, 10, 10, 100, 0, []);
    const large = completedProjectWithLine(assembly, 100, 100, 80, 1, []);
    const [result] = calculateAssemblyVariance([small, large]);
    expect(result.laborVariancePercent).toBeCloseTo(((90 - 55) / 55) * 100, 3);
    expect(result.laborVariancePercent).not.toBeCloseTo((900 + -20) / 2, 1);
  });
  it("LEP-109 zero actual hours: actual production rate is null, not Infinity", () => {
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0.1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = completedProjectWithLine(assembly, 5, 5, 0, 0, []);
    const [result] = calculateAssemblyVariance([project]);
    expect(result.avgActualProductionRate).toBeNull();
  });
});

// -- Profitability Summary (LEP-112..116 + DEF-06 exclusion visibility) -----

describe("LEP-112..116 Profitability Summary, and DEF-06 (exclusion visibility)", () => {
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

  it("LEP-112 revenue-weighted margin, not an average of -100% and 73%", () => {
    const small = wonJobAtCost("small", 20000, 10000);
    const large = wonJobAtCost("large", 270000, 1000000);
    const summary = calculateProfitabilitySummary([small, large], business);
    expect(summary.weightedActualMargin).not.toBeNull();
    expect(summary.weightedActualMargin as number).toBeCloseTo(71.287, 1);
    const naiveAverage = (-100 + 73) / 2;
    expect(Math.abs((summary.weightedActualMargin as number) - naiveAverage)).toBeGreaterThan(50);
  });
  it("LEP-113 zero total revenue: weighted margin null, not Infinity", () => {
    const summary = calculateProfitabilitySummary([], business);
    expect(summary.weightedActualMargin).toBeNull();
    expect(summary.weightedExpectedMargin).toBeNull();
    expect(summary.eligibleCount).toBe(0);
  });
  it("LEP-114/DEF-06 completed job missing a locked revision is excluded from totals AND the exclusion is surfaced explicitly (not silent)", () => {
    const eligible = wonJobAtCost("eligible", 20000, 40000);
    // Has actuals recorded (marked done) but no quoteRevisions/activeQuoteRevisionId at all.
    const missingRevision: Project = { ...baseProject({ id: "missing-rev" }), status: "won", actual: { actualLaborPersonHours: 0, actualMaterialsCostCents: cents(1000), actualEquipmentCostCents: ZERO_CENTS, actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS, finalSellingPriceCents: cents(2000), completedAt: "2026-02-01" } };
    const summary = calculateProfitabilitySummary([eligible, missingRevision], business);
    expect(summary.eligibleCount).toBe(1); // only the eligible job counted
    expect(summary.excludedCount).toBe(1); // the other one is NOT silently dropped — it's counted as excluded
    expect(summary.exclusionReasons["missing locked quote revision"]).toBe(1);
  });
  it("LEP-115 manual quote override: revenue uses actualQuotedPriceCents from the locked revision, not a live recompute", () => {
    const job = wonJobAtCost("override", 10000, 999999); // override wildly different from what the math would recommend
    const revision = job.quoteRevisions[0];
    const summary = calculateProfitabilitySummary([job], business);
    expect(summary.weightedExpectedMargin).not.toBeNull();
    // Directly reconciles against the revision's OWN override price and locked true cost.
    expect(summary.weightedExpectedMargin as number).toBeCloseTo(((revision.actualQuotedPriceCents - revision.trueCostCents) / revision.actualQuotedPriceCents) * 100, 6);
    expect(revision.actualQuotedPriceCents).toBe(999999); // the override, not a system recommendation
  });
  it("LEP-116 average and median ARE computed as fields distinct from the weighted headline", () => {
    const jobA = wonJobAtCost("a", 5000, 10000); // 50% margin
    const jobB = wonJobAtCost("b", 8000, 10000); // 20% margin
    const summary = calculateProfitabilitySummary([jobA, jobB], business);
    expect(summary.averageActualMarginPerJob).not.toBeNull();
    expect(summary.medianActualMarginPerJob).not.toBeNull();
    expect(summary.averageActualMarginPerJob).toBeCloseTo((50 + 20) / 2, 1);
    // The weighted headline and the simple average are DIFFERENT metrics (equal jobs here, but distinctly labeled/typed) — never conflated into one field.
    expect(summary.weightedActualMargin).not.toBe(undefined);
  });
});

// -- DEF-06 (second half): explicit overhead-change scenario for open and locked quotes --

describe("DEF-06 — overhead-change cost-impact scenario (open and locked quotes, non-mutating)", () => {
  const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(10000), unit: "each" }];
  const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
  const zeroLaborBusiness: BusinessSettings = { ...business, loadedLaborRateCents: cents(0) };

  it("a LOCKED quote's scenario margin reflects the hypothetical overhead rate, without mutating the revision", () => {
    const project = baseProject({ id: "locked-1", serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], overheadPercent: 10 });
    const revision = buildQuoteRevision(project, [assembly], materials, [], zeroLaborBusiness, { actualQuotedPriceOverrideCents: cents(20000) });
    const quotedProject = { ...project, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const before = JSON.stringify(revision);

    const results = evaluateOverheadScenario(50, { assemblies: [assembly], materials, equipment: [], business: zeroLaborBusiness, projects: [quotedProject] });
    const result = results.find((r) => r.projectId === "locked-1")!;

    expect(result.isLocked).toBe(true);
    expect(result.baselineOverheadPercent).toBe(10);
    expect(result.scenarioMargin).not.toBeNull();
    expect(result.scenarioMargin as number).toBeLessThan(result.baselineMargin as number); // higher overhead -> worse margin
    expect(JSON.stringify(revision)).toBe(before); // never mutated
  });

  it("an OPEN (draft) project's scenario margin is computed live, without mutating the project", () => {
    const project = baseProject({ id: "draft-1", serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], overheadPercent: 10 });
    const before = JSON.stringify(project);

    const results = evaluateOverheadScenario(50, { assemblies: [assembly], materials, equipment: [], business: zeroLaborBusiness, projects: [project] });
    const result = results.find((r) => r.projectId === "draft-1")!;

    expect(result.isLocked).toBe(false);
    expect(result.baselineOverheadPercent).toBe(10);
    expect(result.scenarioMargin as number).toBeLessThan(result.baselineMargin as number);
    expect(JSON.stringify(project)).toBe(before); // never mutated
  });

  it("crossesBelowTarget is true only when the baseline was at/above target and the scenario drops below it", () => {
    const project = baseProject({ id: "cross-1", serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], overheadPercent: 0, targetMarginPercent: 30 });
    const revision = buildQuoteRevision(project, [assembly], materials, [], zeroLaborBusiness, { actualQuotedPriceOverrideCents: cents(15000) }); // healthy margin at 0% overhead
    const quotedProject = { ...project, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };

    const mild = evaluateOverheadScenario(5, { assemblies: [assembly], materials, equipment: [], business: zeroLaborBusiness, projects: [quotedProject] }).find((r) => r.projectId === "cross-1")!;
    const extreme = evaluateOverheadScenario(200, { assemblies: [assembly], materials, equipment: [], business: zeroLaborBusiness, projects: [quotedProject] }).find((r) => r.projectId === "cross-1")!;

    expect(mild.crossesBelowTarget).toBe(false);
    expect(extreme.crossesBelowTarget).toBe(true);
  });
});

// -- Phase 9: dollar totals, per-project drill-down, and "worst offenders" --

describe("Phase 9 — profitability dollar totals, drill-down ids, and worst-offender lists", () => {
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

  it("headline margin is revenue-weighted, not a naive average, for a small high-margin job plus a large low-margin job", () => {
    // Exactly the Phase 9 brief's own example: a $500 job at 80% margin and a
    // $50,000 job at 20% margin must not average to 50%.
    const small = wonJobAtCost("small", 10000, 50000); // $100 cost, $500 quote -> 80% margin
    const large = wonJobAtCost("large", 4000000, 5000000); // $40,000 cost, $50,000 quote -> 20% margin
    const summary = calculateProfitabilitySummary([small, large], business);

    const naiveAverage = (80 + 20) / 2; // the WRONG answer: 50%
    const totalRevenue = 50000 + 5000000;
    const totalCost = 10000 + 4000000;
    const expectedWeighted = ((totalRevenue - totalCost) / totalRevenue) * 100;

    expect(summary.weightedActualMargin).not.toBeNull();
    expect(summary.weightedActualMargin as number).toBeCloseTo(expectedWeighted, 4);
    // The large job dominates the revenue-weighted figure (it's 100x the
    // revenue of the small job) — nowhere near the naive 50% midpoint.
    expect(Math.abs((summary.weightedActualMargin as number) - naiveAverage)).toBeGreaterThan(25);
    expect(summary.weightedActualMargin as number).toBeLessThan(30);
  });

  it("totalQuotedRevenueCents/totalActualTrueCostCents/totalGrossProfitCents sum only the eligible jobs", () => {
    const jobA = wonJobAtCost("a", 6000, 10000); // $60 cost, $100 quote
    const jobB = wonJobAtCost("b", 3000, 10000); // $30 cost, $100 quote
    const summary = calculateProfitabilitySummary([jobA, jobB], business);

    expect(summary.totalQuotedRevenueCents).toBe(20000);
    expect(summary.totalActualTrueCostCents).toBe(9000);
    expect(summary.totalGrossProfitCents).toBe(11000);
  });

  it("dollar totals are null (not $0) when there are no eligible jobs — a missing total is a different fact from a $0 total", () => {
    const summary = calculateProfitabilitySummary([], business);
    expect(summary.totalQuotedRevenueCents).toBeNull();
    expect(summary.totalActualTrueCostCents).toBeNull();
    expect(summary.totalGrossProfitCents).toBeNull();
  });

  it("eligibleProjectIds/excludedProjectIds match eligibleCount/excludedCount exactly, for drill-down UI", () => {
    const eligible = wonJobAtCost("eligible", 5000, 10000);
    const missingRevision: Project = {
      ...baseProject({ id: "missing-rev" }),
      status: "won",
      actual: { actualLaborPersonHours: 0, actualMaterialsCostCents: cents(1000), actualEquipmentCostCents: ZERO_CENTS, actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS, finalSellingPriceCents: cents(2000), completedAt: "2026-02-01" },
    };
    const summary = calculateProfitabilitySummary([eligible, missingRevision], business);

    expect(summary.eligibleProjectIds).toEqual(["eligible"]);
    expect(summary.excludedProjectIds).toEqual(["missing-rev"]);
  });

  it("mostOverBudgetProjectIds ranks only jobs that ran over budget, worst dollar overrun first", () => {
    const overBudget = wonJobAtCost("over", 9000, 10000); // true cost ~$90 vs. an estimate of ~$32 -> ran over
    const underBudget = wonJobAtCost("under", 50, 10000); // true cost ~$0.50 vs. ~$32 estimate -> came in well under
    const summary = calculateProfitabilitySummary([overBudget, underBudget], business);

    expect(summary.mostOverBudgetProjectIds[0]).toBe("over");
    expect(summary.mostOverBudgetProjectIds).not.toContain("under");
  });

  it("largestMarginDeteriorationProjectIds ranks only jobs whose actual margin fell short of their quoted margin", () => {
    const worsened = wonJobAtCost("worsened", 9000, 10000); // actual cost far above estimate -> margin collapsed
    const improved = wonJobAtCost("improved", 1, 10000); // actual cost far below estimate -> margin improved, not worsened
    const summary = calculateProfitabilitySummary([worsened, improved], business);

    expect(summary.largestMarginDeteriorationProjectIds[0]).toBe("worsened");
    expect(summary.largestMarginDeteriorationProjectIds).not.toContain("improved");
  });

  it("perProjectDetail carries one row per eligible job with the same figures the totals are built from", () => {
    const job = wonJobAtCost("solo", 4000, 10000);
    const summary = calculateProfitabilitySummary([job], business);
    expect(summary.perProjectDetail).toHaveLength(1);
    const detail = summary.perProjectDetail[0];
    expect(detail.projectId).toBe("solo");
    expect(detail.quotedRevenueCents).toBe(10000);
    expect(detail.actualTrueCostCents).toBe(4000);
    expect(detail.costVarianceCents).toBe(detail.actualTrueCostCents - job.quoteRevisions[0].trueCostCents);
  });
});

// -- Phase 8: per-category (materials/labor/equipment/delivery/other) estimated-vs-actual --

describe("Phase 8 — calculateActualsCategoryComparison (per-category estimated vs. actual)", () => {
  const materials: Material[] = [{ id: "m", name: "Mulch", unitCostCents: cents(500), unit: "each" }];
  const assembly: Assembly = {
    id: "a",
    name: "A",
    unit: "each",
    materials: [{ materialId: "m", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit",
    laborPersonHoursPerUnit: 1,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };

  function buildQuotedRevision(quantity: number) {
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity }], overheadPercent: 0 });
    return buildQuoteRevision(project, [assembly], materials, [], business);
  }

  it("breaks estimated-vs-actual down per category, matching the whole-project total when everything is entered", () => {
    const revision = buildQuotedRevision(10); // 10 units: $50 materials, $320 labor (10 * $32/hr)
    const actual = { actualMaterialsCostCents: cents(6000), actualLaborPersonHours: 9, actualEquipmentCostCents: ZERO_CENTS, actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS };
    const rows = calculateActualsCategoryComparison(revision, actual, business.loadedLaborRateCents);

    const materialsRow = rows.find((r) => r.category === "materials")!;
    expect(materialsRow.estimatedCents).toBe(5000);
    expect(materialsRow.actualCents).toBe(6000);
    expect(materialsRow.varianceCents).toBe(1000);
    expect(materialsRow.variancePercent).toBeCloseTo(20, 4);

    const laborRow = rows.find((r) => r.category === "labor")!;
    expect(laborRow.estimatedCents).toBe(32000); // 10 hrs * $32/hr
    expect(laborRow.actualCents).toBe(28800); // 9 hrs * $32/hr
    expect(laborRow.varianceCents).toBe(-3200); // came in UNDER on labor
  });

  it("a category that came in UNDER estimate shows a genuine negative variance, never clamped to zero", () => {
    const revision = buildQuotedRevision(10);
    const actual = { actualMaterialsCostCents: cents(1000), actualLaborPersonHours: 0, actualEquipmentCostCents: ZERO_CENTS, actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS };
    const rows = calculateActualsCategoryComparison(revision, actual, business.loadedLaborRateCents);
    const materialsRow = rows.find((r) => r.category === "materials")!;
    expect(materialsRow.varianceCents).toBeLessThan(0);
    expect(materialsRow.varianceCents).toBe(1000 - 5000);
  });

  it("variancePercent is null (never Infinity) when a category's estimated cost is exactly zero", () => {
    const revision = buildQuotedRevision(10);
    const actual = { actualMaterialsCostCents: ZERO_CENTS, actualLaborPersonHours: 0, actualEquipmentCostCents: cents(500), actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS };
    const rows = calculateActualsCategoryComparison(revision, actual, business.loadedLaborRateCents);
    const equipmentRow = rows.find((r) => r.category === "equipment")!;
    expect(equipmentRow.estimatedCents).toBe(0);
    expect(equipmentRow.variancePercent).toBeNull();
    expect(equipmentRow.varianceCents).toBe(500);
  });
});
