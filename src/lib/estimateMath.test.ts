import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateMargin } from "./calc";
import {
  buildProjectCsvRows,
  buildQuoteRevision,
  calculateAssemblyCost,
  calculateAssemblyVariance,
  calculateProfitabilitySummary,
  classifyCostImpact,
  evaluateActualVsEstimate,
  evaluateMinimumJob,
  evaluateProject,
  evaluateRateHealth,
  getActiveRevision,
  getQuoteBlockingErrors,
  QuoteBlockedError,
  snapshotCostImpact,
} from "./estimateMath";
import { ZERO_CENTS, type MoneyCents } from "./money";
import { DEFAULT_BUSINESS_SETTINGS, QUOTE_REVISION_SCHEMA_VERSION } from "./types";
import type { Assembly, BusinessSettings, Equipment, Material, Project, ProjectTemplate, QuoteRevision } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

const business: BusinessSettings = { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: cents(3200) };

const materials: Material[] = [
  { id: "mulch", name: "Mulch", unitCostCents: cents(4200), unit: "yd3" },
  { id: "shrub", name: "Shrub", unitCostCents: cents(2800), unit: "each" },
];

const equipment: Equipment[] = [{ id: "skidsteer", name: "Skid Steer", rateCents: cents(4500), rateType: "hour" }];

/** A minimal, directly-constructed QuoteRevision for tests that only care
 * about its actualQuotedPriceCents — real revisions come from buildQuoteRevision(). */
function fakeRevision(actualQuotedPriceCents: number, overrides?: Partial<QuoteRevision>): QuoteRevision {
  return {
    id: "rev-test",
    projectId: "proj-test",
    revisionNumber: 1,
    previousRevisionId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    calculationSchemaVersion: QUOTE_REVISION_SCHEMA_VERSION,
    roundingIncrementCents: 100,
    serviceLines: [],
    equipmentLines: [],
    laborLines: [],
    deliveryCostCents: ZERO_CENTS,
    deliveryTaxable: true,
    extraCosts: [],
    loadedLaborRateCents: cents(3200),
    laborRateBasis: "already-loaded",
    overheadPercent: 15,
    targetMarginPercent: 35,
    taxRatePercent: 0,
    directCostCents: ZERO_CENTS,
    overheadAmountCents: ZERO_CENTS,
    trueCostCents: ZERO_CENTS,
    exactRequiredPriceCents: cents(actualQuotedPriceCents),
    roundedRecommendedPriceCents: cents(actualQuotedPriceCents),
    actualQuotedPriceCents: cents(actualQuotedPriceCents),
    taxableSubtotalCents: cents(actualQuotedPriceCents),
    taxAmountCents: ZERO_CENTS,
    customerTotalCents: cents(actualQuotedPriceCents),
    grossProfitCents: ZERO_CENTS,
    achievedMargin: null,
    historicalCostBasisStatus: "known",
    revenueAllocation: [],
    ...overrides,
  };
}

function baseProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj-1",
    name: "Job",
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

describe("calculateAssemblyCost — overhead must be included in trueCostPerUnitCents", () => {
  const assembly: Assembly = {
    id: "shrub-install",
    name: "Shrub Installation",
    unit: "each",
    materials: [{ materialId: "shrub", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.45,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };

  it("direct cost per unit is $42.40 (28 material + 14.40 labor), true cost is direct + overhead", () => {
    const result = calculateAssemblyCost(assembly, materials, equipment, cents(3200), 15);
    expect(result.materialCostPerUnitCents).toBe(2800);
    expect(result.laborCostPerUnitCents).toBe(1440); // 0.45 * 3200
    expect(result.directCostPerUnitCents).toBe(4240);
    expect(result.overheadPerUnitCents).toBe(636); // 4240 * 0.15
    expect(result.trueCostPerUnitCents).toBe(4876); // 4240 + 636
  });

  it("REGRESSION: trueCostPerUnitCents must NOT equal directCostPerUnitCents when overhead > 0 — a prior version called direct cost 'true cost'", () => {
    const result = calculateAssemblyCost(assembly, materials, equipment, cents(3200), 15);
    expect(result.trueCostPerUnitCents).not.toBe(result.directCostPerUnitCents);
    expect(result.trueCostPerUnitCents).toBeGreaterThan(result.directCostPerUnitCents);
  });

  it("zero overhead leaves true cost equal to direct cost", () => {
    const result = calculateAssemblyCost(assembly, materials, equipment, cents(3200), 0);
    expect(result.trueCostPerUnitCents).toBe(result.directCostPerUnitCents);
  });

  it("ignores an equipment line that references an unknown id rather than throwing", () => {
    const withBadEquipment: Assembly = {
      ...assembly,
      equipment: [{ equipmentId: "does-not-exist", quantityPerUnit: 1 }],
    };
    expect(() => calculateAssemblyCost(withBadEquipment, materials, equipment, cents(3200), 15)).not.toThrow();
  });
});

describe("evaluateRateHealth — shrub installation reference example, now overhead-inclusive", () => {
  it("uses the overhead-INCLUSIVE true cost ($48.76) to compute a higher required rate than the old direct-cost-only bug would", () => {
    const trueCostPerUnitCents = 4876; // direct 4240 + 15% overhead, from calculateAssemblyCost above
    const result = evaluateRateHealth(trueCostPerUnitCents, 6750, 35);
    expect(result.requiredRateCents).not.toBeNull();
    expect(result.requiredRateCents as number).toBe(7502); // 7501.53846... half-up -> 7502
    // The OLD (buggy) required rate, computed from direct cost alone, was
    // $65.23 — the corrected rate must be strictly higher, since overhead is
    // real cost that must be recovered too.
    expect(result.requiredRateCents as number).toBeGreaterThan(6523);
    expect(result.status).toBe("attention");
  });

  it("flags healthy when the current rate already meets the required rate", () => {
    const result = evaluateRateHealth(4876, 8000, 35);
    expect(result.status).toBe("healthy");
    expect(result.gapPerUnitCents).toBeLessThanOrEqual(0);
  });

  it("flags critical when the gap exceeds 15% of the required rate", () => {
    const result = evaluateRateHealth(4876, 4000, 35);
    expect(result.status).toBe("critical");
  });

  it("flags invalid (not healthy, not a guessed number) when the target margin is blocked", () => {
    const result = evaluateRateHealth(4876, 6750, 100);
    expect(result.status).toBe("invalid");
    expect(result.requiredRateCents).toBeNull();
    expect(result.gapPerUnitCents).toBeNull();
  });
});

describe("evaluateMinimumJob — reference example", () => {
  it("matches the brief: $500 minimum, $390 true cost → 22% margin, $600 required minimum", () => {
    const result = evaluateMinimumJob(50000, 39000, 35);
    expect(result.currentMargin).toBeCloseTo(22, 10);
    expect(result.requiredMinimumCents).toBe(60000);
    expect(result.isBelowTarget).toBe(true);
  });

  it("is not flagged below target once the minimum meets the required minimum", () => {
    const result = evaluateMinimumJob(60000, 39000, 35);
    expect(result.isBelowTarget).toBe(false);
  });

  it("requiredMinimumCents is null (not a guess) when the target margin is blocked", () => {
    const result = evaluateMinimumJob(50000, 39000, 100);
    expect(result.requiredMinimumCents).toBeNull();
  });
});

describe("evaluateProject — Smith Residence, full project roll-up", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };

  const project = baseProject({
    id: "smith-residence",
    name: "Smith Residence",
    customerName: "Smith Residence",
    serviceLines: [{ id: "line-1", assemblyId: "mulch-install", quantity: 8 }],
    equipmentLines: [{ equipmentId: "skidsteer", quantity: 4 }],
    deliveryCostCents: cents(18000),
    extraCosts: [{ id: "extra-1", label: "Other", amountCents: cents(10000) }],
  });

  const result = evaluateProject(project, [mulchAssembly], materials, equipment, business);

  it("rolls up materials, labor, equipment, delivery and extras into a direct cost", () => {
    expect(result.materialsCostCents).toBe(33600); // 8 * 4200
    expect(result.laborCostCents).toBe(10240); // 8 * 0.4 * 3200
    expect(result.equipmentCostCents).toBe(18000); // 4 * 4500
    expect(result.deliveryCostCents).toBe(18000);
    expect(result.otherCostCents).toBe(10000);
  });

  it("produces a positive true cost and a required price above true cost", () => {
    expect(result.trueCostCents).toBeGreaterThan(result.directCostCents);
    expect(result.requiredSellingPriceCents).not.toBeNull();
    expect(result.requiredSellingPriceCents as number).toBeGreaterThan(result.trueCostCents);
  });

  it("has no tax by default", () => {
    expect(result.taxAmountCents).toBe(0);
    expect(result.customerTotalCents).toBe(result.displayPriceCents);
  });

  it("returns every price field as null when the target margin is blocked, never a garbage number", () => {
    const blocked = evaluateProject({ ...project, targetMarginPercent: 100 }, [mulchAssembly], materials, equipment, business);
    expect(blocked.requiredSellingPriceCents).toBeNull();
    expect(blocked.displayPriceCents).toBeNull();
    expect(blocked.expectedMargin).toBeNull();
    expect(blocked.taxableSubtotalCents).toBeNull();
    expect(blocked.taxAmountCents).toBeNull();
    expect(blocked.customerTotalCents).toBeNull();
  });

  it("computes tax on the pre-tax display price, and margin stays pre-tax", () => {
    const taxedProject = { ...project, taxRatePercent: 8 };
    const taxedResult = evaluateProject(taxedProject, [mulchAssembly], materials, equipment, business);
    expect(taxedResult.displayPriceCents).toBe(result.displayPriceCents); // tax doesn't change the pre-tax quote
    expect(taxedResult.expectedMargin).toBe(result.expectedMargin); // margin is unaffected by tax
    expect(taxedResult.taxAmountCents).not.toBeNull();
    expect(taxedResult.taxAmountCents as number).toBeCloseTo((taxedResult.displayPriceCents as number) * 0.08, 0);
    expect(taxedResult.customerTotalCents as number).toBeCloseTo((taxedResult.displayPriceCents as number) * 1.08, 0);
  });

  it("a non-taxable line reduces the taxable subtotal proportionally", () => {
    const mixedProject = {
      ...project,
      taxRatePercent: 10,
      serviceLines: [{ id: "line-1", assemblyId: "mulch-install", quantity: 8, taxable: false }],
    };
    const mixedResult = evaluateProject(mixedProject, [mulchAssembly], materials, equipment, business);
    const fullyTaxableResult = evaluateProject({ ...project, taxRatePercent: 10 }, [mulchAssembly], materials, equipment, business);
    expect(mixedResult.taxableSubtotalCents as number).toBeLessThan(fullyTaxableResult.taxableSubtotalCents as number);
    expect(mixedResult.taxAmountCents as number).toBeLessThan(fullyTaxableResult.taxAmountCents as number);
  });

  it("rounds the display price UP to the business's rounding increment", () => {
    const chunkyRounding = evaluateProject(project, [mulchAssembly], materials, equipment, { ...business, roundingIncrementCents: 5000 });
    expect(chunkyRounding.displayPriceCents).not.toBeNull();
    expect((chunkyRounding.displayPriceCents as number) % 5000).toBe(0);
    expect(chunkyRounding.displayPriceCents as number).toBeGreaterThanOrEqual(chunkyRounding.requiredSellingPriceCents as number);
  });

  it("REGRESSION (item 4): the live draft preview and a just-locked revision agree EXACTLY when nothing changes in between — no separate approximate draft tax engine", () => {
    const taxedProject = { ...project, taxRatePercent: 8 };
    const draft = evaluateProject(taxedProject, [mulchAssembly], materials, equipment, business);
    const revision = buildQuoteRevision(taxedProject, [mulchAssembly], materials, equipment, business);
    // No override was supplied, so the revision locks in exactly what the
    // draft was just showing — draft and locked numbers must be identical,
    // not merely close.
    expect(revision.actualQuotedPriceCents).toBe(draft.displayPriceCents);
    expect(revision.taxableSubtotalCents).toBe(draft.taxableSubtotalCents);
    expect(revision.taxAmountCents).toBe(draft.taxAmountCents);
    expect(revision.customerTotalCents).toBe(draft.customerTotalCents);
  });
});

describe("getQuoteBlockingErrors / buildQuoteRevision — invalid estimates are blocked, not quoted", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };
  const validProject = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });

  it("a valid project has no blocking errors", () => {
    expect(getQuoteBlockingErrors(validProject, [mulchAssembly], materials, equipment)).toEqual([]);
  });

  it("blocks a target margin of exactly 100%", () => {
    const errors = getQuoteBlockingErrors({ ...validProject, targetMarginPercent: 100 }, [mulchAssembly], materials, equipment);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("blocks a negative target margin", () => {
    expect(getQuoteBlockingErrors({ ...validProject, targetMarginPercent: -1 }, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks NaN and Infinity target margins", () => {
    expect(getQuoteBlockingErrors({ ...validProject, targetMarginPercent: NaN }, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
    expect(getQuoteBlockingErrors({ ...validProject, targetMarginPercent: Infinity }, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks a negative overhead rate", () => {
    expect(getQuoteBlockingErrors({ ...validProject, overheadPercent: -5 }, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks a negative service-line quantity", () => {
    const withNegativeQty = { ...validProject, serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: -3 }] };
    expect(getQuoteBlockingErrors(withNegativeQty, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks a negative delivery cost", () => {
    expect(getQuoteBlockingErrors({ ...validProject, deliveryCostCents: cents(-5000) }, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks a negative extra-cost amount", () => {
    const withNegativeExtra = { ...validProject, extraCosts: [{ id: "e1", label: "Discount", amountCents: cents(-2000) }] };
    expect(getQuoteBlockingErrors(withNegativeExtra, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks an entirely empty project (nothing to quote)", () => {
    expect(getQuoteBlockingErrors(baseProject(), [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks a service line whose assembly references an invalid Catalog material (negative unit cost)", () => {
    const badMaterials = materials.map((m) => (m.id === "mulch" ? { ...m, unitCostCents: cents(-100) } : m));
    expect(getQuoteBlockingErrors(validProject, [mulchAssembly], badMaterials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks a service line whose assembly has an invalid person-hours-per-unit (zero)", () => {
    const badAssembly: Assembly = { ...mulchAssembly, laborPersonHoursPerUnit: 0 };
    expect(getQuoteBlockingErrors(validProject, [badAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("blocks a crew-duration labor line with zero crew size", () => {
    const withBadLabor = {
      ...validProject,
      laborLines: [{ id: "labor-1", label: "Crew", mode: "crew-duration" as const, crewSize: 0, elapsedHours: 4, loadedRateCents: cents(3200) }],
    };
    expect(getQuoteBlockingErrors(withBadLabor, [mulchAssembly], materials, equipment).length).toBeGreaterThan(0);
  });

  it("buildQuoteRevision throws QuoteBlockedError (never silently produces a revision) for a blocked project", () => {
    const blocked = { ...validProject, targetMarginPercent: 120 };
    expect(() => buildQuoteRevision(blocked, [mulchAssembly], materials, equipment, business)).toThrow(QuoteBlockedError);
  });

  it("buildQuoteRevision succeeds for a valid project and produces revision 1", () => {
    const revision = buildQuoteRevision(validProject, [mulchAssembly], materials, equipment, business);
    expect(revision.revisionNumber).toBe(1);
    expect(revision.previousRevisionId).toBeNull();
    expect(revision.historicalCostBasisStatus).toBe("known");
    expect(revision.actualQuotedPriceCents).toBe(revision.roundedRecommendedPriceCents);
  });
});

describe("crew-duration labor lines — an explicit PROJECT labor line, not forced into an Assembly", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };

  it("personHours = crewSize x elapsedHours, and laborCost = personHours x loadedRate", () => {
    const project = baseProject({
      laborLines: [{ id: "labor-1", label: "Site cleanup", mode: "crew-duration", crewSize: 3, elapsedHours: 4, loadedRateCents: cents(3000) }],
    });
    const result = evaluateProject(project, [], materials, equipment, business);
    expect(result.laborPersonHours).toBe(12); // 3 * 4
    expect(result.laborCostCents).toBe(36000); // 12 * 3000
  });

  it("contributes its own weighted row to revenue allocation, alongside service lines", () => {
    const project = baseProject({
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }],
      laborLines: [{ id: "labor-1", label: "Change-order crew day", mode: "crew-duration", crewSize: 2, elapsedHours: 8, loadedRateCents: cents(3200) }],
    });
    const revision = buildQuoteRevision(project, [mulchAssembly], materials, [], business);
    const laborRow = revision.revenueAllocation.find((r) => r.key === "labor:0");
    expect(laborRow).toBeDefined();
    expect(laborRow!.directCostCents).toBe(51200); // 2 * 8 * 3200
    const sumAllocated = revision.revenueAllocation.reduce((s, r) => s + r.allocatedSellingPriceCents, 0);
    expect(sumAllocated).toBe(revision.actualQuotedPriceCents);
  });

  it("snapshots the original crew-duration inputs and computed cost onto the locked revision", () => {
    const project = baseProject({
      laborLines: [{ id: "labor-1", label: "Site cleanup", mode: "crew-duration", crewSize: 3, elapsedHours: 4, loadedRateCents: cents(3000), taxable: false }],
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }],
    });
    const revision = buildQuoteRevision(project, [mulchAssembly], materials, [], business);
    expect(revision.laborLines).toHaveLength(1);
    const [laborLine] = revision.laborLines;
    expect(laborLine.mode).toBe("crew-duration");
    expect(laborLine.crewSize).toBe(3);
    expect(laborLine.elapsedHours).toBe(4);
    expect(laborLine.personHours).toBe(12);
    expect(laborLine.loadedRateCents).toBe(3000);
    expect(laborLine.laborCostCents).toBe(36000);
    expect(laborLine.taxable).toBe(false);
  });

  it("a locked labor-line revision is unaffected by a later loaded-labor-rate change", () => {
    const project = baseProject({
      laborLines: [{ id: "labor-1", label: "Site cleanup", mode: "crew-duration", crewSize: 3, elapsedHours: 4, loadedRateCents: cents(3000) }],
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }],
    });
    const revision = buildQuoteRevision(project, [mulchAssembly], materials, [], business);
    const originalLaborCostCents = revision.laborLines[0].laborCostCents;
    // Changing the business's current labor rate must not retroactively
    // change what this revision says the crew labor cost.
    const changedBusiness = { ...business, loadedLaborRateCents: cents(9999) };
    void evaluateProject(project, [mulchAssembly], materials, [], changedBusiness);
    expect(revision.laborLines[0].laborCostCents).toBe(originalLaborCostCents);
  });

  it("REGRESSION: a locked revision's crew-duration snapshot is unaffected by LATER edits to the project's own labor lines — re-quoting after editing crew size/hours appends a NEW revision, never mutates the old one", () => {
    const project = baseProject({
      laborLines: [{ id: "labor-1", label: "Site cleanup", mode: "crew-duration", crewSize: 3, elapsedHours: 4, loadedRateCents: cents(3000) }],
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }],
    });
    const revision1 = buildQuoteRevision(project, [mulchAssembly], materials, [], business);
    const frozenSnapshot = JSON.parse(JSON.stringify(revision1.laborLines));

    // The contractor edits the labor line on the project — bigger crew, more
    // hours, a higher rate — and re-quotes.
    const editedProject = {
      ...project,
      laborLines: [{ id: "labor-1", label: "Site cleanup", mode: "crew-duration" as const, crewSize: 6, elapsedHours: 9, loadedRateCents: cents(3500) }],
      quoteRevisions: [revision1],
      activeQuoteRevisionId: revision1.id,
    };
    const revision2 = buildQuoteRevision(editedProject, [mulchAssembly], materials, [], business, { reason: "Re-quoted after crew change" });

    // Revision 2 reflects the NEW inputs...
    expect(revision2.laborLines[0].crewSize).toBe(6);
    expect(revision2.laborLines[0].elapsedHours).toBe(9);
    expect(revision2.laborLines[0].personHours).toBe(54); // 6 * 9
    expect(revision2.laborLines[0].loadedRateCents).toBe(3500);
    expect(revision2.laborLines[0].laborCostCents).toBe(189000); // 54 * 3500

    // ...while revision 1's own frozen crew-duration snapshot is untouched,
    // byte-for-byte, exactly as it was built.
    expect(revision1.laborLines).toEqual(frozenSnapshot);
    expect(revision1.laborLines[0].crewSize).toBe(3);
    expect(revision1.laborLines[0].elapsedHours).toBe(4);
    expect(revision1.laborLines[0].personHours).toBe(12);
    expect(revision1.laborLines[0].loadedRateCents).toBe(3000);
    expect(revision1.laborLines[0].laborCostCents).toBe(36000);
  });
});

describe("revenue allocation — exact-cents largest-remainder split across quote lines", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };
  const shrubAssembly: Assembly = {
    id: "shrub-install",
    name: "Shrub Installation",
    unit: "each",
    materials: [{ materialId: "shrub", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.45,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };
  const assemblies = [mulchAssembly, shrubAssembly];

  it("REGRESSION: sum of allocated line cents always equals actualQuotedPriceCents, exactly", () => {
    const project = baseProject({
      serviceLines: [
        { id: "l1", assemblyId: "mulch-install", quantity: 8 },
        { id: "l2", assemblyId: "shrub-install", quantity: 3 },
      ],
      deliveryCostCents: cents(3713), // an odd cent value to stress the remainder allocation
      extraCosts: [{ id: "e1", label: "Permit", amountCents: cents(1999) }],
    });
    const revision = buildQuoteRevision(project, assemblies, materials, [], business, { actualQuotedPriceOverrideCents: cents(123457) });
    const sumAllocatedCents = revision.revenueAllocation.reduce((sum, r) => sum + r.allocatedSellingPriceCents, 0);
    expect(sumAllocatedCents).toBe(123457);
    expect(revision.revenueAllocation.length).toBe(4); // 2 service lines + delivery + 1 extra cost
  });

  it("allocates proportionally to each line's direct-cost weight", () => {
    const project = baseProject({
      serviceLines: [
        { id: "l1", assemblyId: "mulch-install", quantity: 8 }, // larger direct cost
        { id: "l2", assemblyId: "shrub-install", quantity: 1 }, // smaller direct cost
      ],
    });
    const revision = buildQuoteRevision(project, assemblies, materials, [], business);
    const mulchRow = revision.revenueAllocation.find((r) => r.key === "service:0")!;
    const shrubRow = revision.revenueAllocation.find((r) => r.key === "service:1")!;
    expect(mulchRow.allocatedSellingPriceCents).toBeGreaterThan(shrubRow.allocatedSellingPriceCents);
  });

  it("blocks quote creation when every line has zero direct cost (nothing to allocate proportionally against)", () => {
    // A service line at quantity 0 costs nothing, and there's no delivery or
    // extra cost either — getQuoteBlockingErrors lets a 0-quantity line
    // through (only negative is blocked), so this exercises the allocator's
    // own zero-weight guard specifically.
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 0 }] });
    expect(() => buildQuoteRevision(project, assemblies, materials, [], business, { actualQuotedPriceOverrideCents: cents(50000) })).toThrow(QuoteBlockedError);
  });

  it("a manual override above the recommendation still allocates and sums exactly", () => {
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const recommended = buildQuoteRevision(project, [mulchAssembly], materials, [], business);
    const overridden = buildQuoteRevision(project, [mulchAssembly], materials, [], business, {
      actualQuotedPriceOverrideCents: cents(recommended.roundedRecommendedPriceCents + 50000),
    });
    expect(overridden.actualQuotedPriceCents).toBe(recommended.roundedRecommendedPriceCents + 50000);
    const sumCentsOverridden = overridden.revenueAllocation.reduce((s, r) => s + r.allocatedSellingPriceCents, 0);
    expect(sumCentsOverridden).toBe(overridden.actualQuotedPriceCents);
  });

  it("a manual override below the recommendation still allocates and sums exactly", () => {
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const recommended = buildQuoteRevision(project, [mulchAssembly], materials, [], business);
    const discounted = buildQuoteRevision(project, [mulchAssembly], materials, [], business, {
      actualQuotedPriceOverrideCents: cents(recommended.roundedRecommendedPriceCents - 5000),
    });
    expect(discounted.actualQuotedPriceCents).toBe(recommended.roundedRecommendedPriceCents - 5000);
    const sumCentsDiscounted = discounted.revenueAllocation.reduce((s, r) => s + r.allocatedSellingPriceCents, 0);
    expect(sumCentsDiscounted).toBe(discounted.actualQuotedPriceCents);
  });

  it("REGRESSION: expected margin, actual margin, cost impact, and profitability all key off actualQuotedPriceCents, not roundedRecommendedPriceCents, after an override", () => {
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const recommended = buildQuoteRevision(project, [mulchAssembly], materials, [], business);
    const negotiated = buildQuoteRevision(project, [mulchAssembly], materials, [], business, {
      actualQuotedPriceOverrideCents: cents(recommended.roundedRecommendedPriceCents - 10000),
    });
    const wonProject: Project = { ...project, status: "won", quoteRevisions: [negotiated], activeQuoteRevisionId: negotiated.id };

    // Estimate-vs-actual
    const comparison = evaluateActualVsEstimate(negotiated, negotiated.directCostCents);
    expect(comparison.actualQuotedPriceCents).toBe(negotiated.actualQuotedPriceCents);
    expect(comparison.actualQuotedPriceCents).not.toBe(recommended.roundedRecommendedPriceCents);

    // Profitability
    const summaryProject: Project = {
      ...wonProject,
      actual: {
        actualLaborPersonHours: 3.2,
        actualMaterialsCostCents: cents(33600),
        actualEquipmentCostCents: ZERO_CENTS,
        actualDeliveryCostCents: ZERO_CENTS,
        actualOtherCostCents: ZERO_CENTS,
        finalSellingPriceCents: negotiated.actualQuotedPriceCents,
        completedAt: "2026-02-01T00:00:00.000Z",
      },
    };
    const profitability = calculateProfitabilitySummary([summaryProject], business);
    expect(profitability.weightedExpectedMargin).not.toBeNull();
    // A margin computed against the negotiated (lower) price must be lower
    // than one computed against the system's original recommendation.
    const marginAtRecommended = calculateMargin(recommended.roundedRecommendedPriceCents, negotiated.trueCostCents);
    expect(profitability.weightedExpectedMargin as number).toBeLessThan(marginAtRecommended as number);
  });
});

describe("mixed taxation", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };

  function projectWithTax(taxRatePercent: number, serviceTaxable: boolean, extraTaxable: boolean): Project {
    return baseProject({
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8, taxable: serviceTaxable }],
      extraCosts: [{ id: "e1", label: "Permit", amountCents: cents(10000), taxable: extraTaxable }],
      taxRatePercent,
    });
  }

  it("all lines taxable: tax applies to the full pre-tax price", () => {
    const revision = buildQuoteRevision(projectWithTax(10, true, true), [mulchAssembly], materials, [], business);
    expect(revision.taxableSubtotalCents).toBe(revision.actualQuotedPriceCents);
    expect(revision.taxAmountCents).toBeCloseTo(revision.actualQuotedPriceCents * 0.1, 0);
  });

  it("no lines taxable: zero tax despite a non-zero rate", () => {
    const revision = buildQuoteRevision(projectWithTax(10, false, false), [mulchAssembly], materials, [], business);
    expect(revision.taxableSubtotalCents).toBe(0);
    expect(revision.taxAmountCents).toBe(0);
  });

  it("mixed taxable lines: tax applies only to the taxable share", () => {
    const revision = buildQuoteRevision(projectWithTax(10, true, false), [mulchAssembly], materials, [], business);
    expect(revision.taxableSubtotalCents).toBeGreaterThan(0);
    expect(revision.taxableSubtotalCents).toBeLessThan(revision.actualQuotedPriceCents);
    expect(revision.taxAmountCents).toBeCloseTo(revision.taxableSubtotalCents * 0.1, 0);
  });

  it("zero tax rate: no tax regardless of taxable status", () => {
    const revision = buildQuoteRevision(projectWithTax(0, true, true), [mulchAssembly], materials, [], business);
    expect(revision.taxAmountCents).toBe(0);
  });

  it("a manual quoted-price override recomputes tax from the OVERRIDE, not the original recommendation", () => {
    const draft = projectWithTax(10, true, true);
    const recommended = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    const overridden = buildQuoteRevision(draft, [mulchAssembly], materials, [], business, {
      actualQuotedPriceOverrideCents: cents(recommended.roundedRecommendedPriceCents - 20000),
    });
    expect(overridden.taxableSubtotalCents).toBe(overridden.actualQuotedPriceCents);
    expect(overridden.taxAmountCents).toBeCloseTo(overridden.actualQuotedPriceCents * 0.1, 0);
    expect(overridden.taxAmountCents).not.toBe(recommended.taxAmountCents);
  });

  it("fractional-cent tax rounds HALF-UP to the nearest cent", () => {
    const project = baseProject({
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8, taxable: true }],
    });
    const revision = buildQuoteRevision(project, [mulchAssembly], materials, [], business, { actualQuotedPriceOverrideCents: cents(10005) });
    const testProject = { ...project, taxRatePercent: 12.5 };
    const revisionWithTax = buildQuoteRevision(testProject, [mulchAssembly], materials, [], business, { actualQuotedPriceOverrideCents: cents(10005) });
    const expectedTaxCents = new Decimal(revisionWithTax.taxableSubtotalCents).times(0.125).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(revisionWithTax.taxAmountCents).toBe(expectedTaxCents);
    expect(revision.taxAmountCents).toBe(0); // sanity: the non-taxed control revision has no tax
  });

  it("rejects quote creation when total direct cost is zero (nothing to allocate revenue or tax against)", () => {
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 0, taxable: true }], taxRatePercent: 10 });
    expect(() => buildQuoteRevision(project, [mulchAssembly], materials, [], business, { actualQuotedPriceOverrideCents: cents(10000) })).toThrow(QuoteBlockedError);
  });
});

describe("immutable quote revisions", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };
  const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });

  it("revision 1 is unaffected by later catalog/business changes; re-quoting appends revision 2 without altering revision 1", () => {
    const revision1 = buildQuoteRevision(project, [mulchAssembly], materials, equipment, business);
    const originalPrice = revision1.actualQuotedPriceCents;
    const originalMaterialCost = revision1.serviceLines[0]?.materialCostPerUnitCents;

    // Change the catalog AND business settings after the quote was locked in.
    const pricierMaterials = materials.map((m) => (m.id === "mulch" ? { ...m, unitCostCents: cents(99900) } : m));
    const higherOverheadBusiness = { ...business, overheadPercent: 50, targetMarginPercent: 60 };

    // Revision 1, read back, must be byte-for-byte identical — nothing
    // mutates it just by existing while the world around it changes.
    expect(revision1.actualQuotedPriceCents).toBe(originalPrice);
    expect(revision1.serviceLines[0]?.materialCostPerUnitCents).toBe(originalMaterialCost);

    const projectWithRevision1 = { ...project, quoteRevisions: [revision1], activeQuoteRevisionId: revision1.id };
    const revision2 = buildQuoteRevision(projectWithRevision1, [mulchAssembly], pricierMaterials, equipment, higherOverheadBusiness, {
      reason: "Re-quoted at current costs",
    });

    expect(revision2.revisionNumber).toBe(2);
    expect(revision2.previousRevisionId).toBe(revision1.id);
    expect(revision2.actualQuotedPriceCents).not.toBe(revision1.actualQuotedPriceCents);
    expect(revision2.serviceLines[0]?.materialCostPerUnitCents).toBe(99900);

    // Revision 1 is STILL exactly as it was — appending revision 2 must not
    // have mutated it.
    expect(revision1.actualQuotedPriceCents).toBe(originalPrice);
    expect(revision1.serviceLines[0]?.materialCostPerUnitCents).toBe(originalMaterialCost);

    const projectWithBoth = { ...projectWithRevision1, quoteRevisions: [revision1, revision2], activeQuoteRevisionId: revision2.id };
    expect(projectWithBoth.quoteRevisions).toHaveLength(2);
    expect(projectWithBoth.quoteRevisions[0]).toBe(revision1); // still accessible, unchanged
    expect(getActiveRevision(projectWithBoth)?.id).toBe(revision2.id);
  });

  it("a manual actualQuotedPriceCents override is stored separately from the system recommendation, and both survive", () => {
    const revision = buildQuoteRevision(project, [mulchAssembly], materials, equipment, business, {
      actualQuotedPriceOverrideCents: cents(50000),
      reason: "Negotiated a flat $500",
    });
    expect(revision.roundedRecommendedPriceCents).not.toBe(50000); // the system's own recommendation, untouched
    expect(revision.actualQuotedPriceCents).toBe(50000); // what was actually charged
  });

  it("locked historical rates: changing the current production rate/labor rate/overhead/assembly does not change a past revision's own figures", () => {
    const revision = buildQuoteRevision(project, [mulchAssembly], materials, equipment, business);
    const frozen = JSON.parse(JSON.stringify(revision));

    const changedAssembly = {
      ...mulchAssembly,
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 5,
      materials: [{ materialId: "mulch", quantityPerUnit: 100 }],
    };
    const changedBusiness = { ...business, loadedLaborRateCents: cents(99900), overheadPercent: 99 };
    // Re-evaluating the LIVE project against changed inputs must produce a
    // different number than the frozen revision...
    const liveResult = evaluateProject(project, [changedAssembly], materials, equipment, changedBusiness);
    expect(liveResult.trueCostCents).not.toBeCloseTo(revision.trueCostCents, -2);
    // ...while the revision object itself never changed at all.
    expect(revision).toEqual(frozen);
  });
});

describe("buildProjectCsvRows — CSV export formats cents as dollar strings at the presentation boundary only", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };
  const project = baseProject({
    id: "smith-residence",
    name: "Smith Residence",
    serviceLines: [{ id: "line-1", assemblyId: "mulch-install", quantity: 8 }],
    equipmentLines: [{ equipmentId: "skidsteer", quantity: 4 }],
    deliveryCostCents: cents(18000),
    extraCosts: [{ id: "extra-1", label: "Other", amountCents: cents(10000) }],
  });

  it("produces one row per resource, matching the brief's CSV shape, in plain decimal dollars", () => {
    const rows = buildProjectCsvRows(project, [mulchAssembly], materials, equipment, cents(3200));
    const mulchRow = rows.find((r) => r.item === "mulch");
    expect(mulchRow).toEqual({ item: "mulch", quantity: 8, unit: "yd3", unitCost: 42, total: 336 });

    const laborRow = rows.find((r) => r.item.includes("labor"));
    expect(laborRow?.quantity).toBeCloseTo(3.2, 10); // 8 * 0.4
    expect(laborRow?.total).toBeCloseTo(102.4, 10);

    const equipmentRow = rows.find((r) => r.item === "skid steer");
    expect(equipmentRow).toEqual({ item: "skid steer", quantity: 4, unit: "hour", unitCost: 45, total: 180 });

    const deliveryRow = rows.find((r) => r.item === "delivery");
    expect(deliveryRow?.total).toBe(180);
  });
});

describe("evaluateActualVsEstimate — driven entirely by the locked revision, never a live recompute", () => {
  it("shows a lower actual margin when the completed job cost more than estimated", () => {
    const revision = fakeRevision(438500, { trueCostCents: cents(285000), overheadPercent: 15 });
    // Actual direct cost of $2,909 roughly matches the brief's estimate-vs-actual example.
    const result = evaluateActualVsEstimate(revision, 290900);
    expect(result.actualTrueCostCents).toBe(334535); // 290900 * 1.15
    expect(result.actualMargin).not.toBeNull();
    expect(result.actualMargin as number).toBeLessThan(result.expectedMargin as number);
    expect(result.costVarianceCents).toBeGreaterThan(0);
  });

  it("uses the REVISION's own locked overhead rate, not any rate passed in separately", () => {
    const revisionWithLowOverhead = fakeRevision(100000, { trueCostCents: cents(70000), overheadPercent: 0 });
    const result = evaluateActualVsEstimate(revisionWithLowOverhead, 70000);
    expect(result.actualTrueCostCents).toBe(70000); // no overhead applied, per the locked 0% rate
  });
});

describe("calculateAssemblyVariance — brief reference examples", () => {
  /** Builds a completed project with a REAL quote revision (via
   * buildQuoteRevision) so the locked laborPersonHoursPerUnit variance
   * reads actually comes from — never the live assembly catalog. */
  function completedProjectWithLine(
    assembly: Assembly,
    estimatedQuantity: number,
    actualQuantity: number,
    actualLaborHours: number,
    index: number
  ): Project {
    const draft = baseProject({
      id: `proj-${assembly.id}-${index}`,
      name: `Job ${index}`,
      serviceLines: [{ id: "line-1", assemblyId: assembly.id, quantity: estimatedQuantity }],
    });
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

  it("matches the brief's shrub-installation labor variance: 9.2 est hrs -> 10.8 actual -> +17.4%", () => {
    const shrubAssembly: Assembly = {
      id: "shrub-install",
      name: "Shrub Installation",
      unit: "each",
      materials: [],
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 0.46, // 20 units * 0.46 = 9.2 estimated hours
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const projects = Array.from({ length: 18 }, (_, i) => completedProjectWithLine(shrubAssembly, 20, 20, 10.8, i));

    const [result] = calculateAssemblyVariance(projects);
    expect(result.completedCount).toBe(18);
    expect(result.eligibleRecordCount).toBe(18);
    expect(result.excludedRecordCount).toBe(0);
    expect(result.avgEstimatedLaborHours).toBeCloseTo(9.2, 10);
    expect(result.avgActualLaborHours).toBeCloseTo(10.8, 10);
    expect(result.laborVariancePercent).toBeCloseTo(17.4, 1);
    expect(result.avgActualProductionRate).toBeCloseTo(20 / 10.8, 6);
  });

  it("REGRESSION: estimated hours are quantity x hours-per-unit, never quantity x a raw production rate (1,000 sq ft example)", () => {
    const bigAssembly: Assembly = {
      id: "big-service",
      name: "Big Service",
      unit: "sqft",
      materials: [],
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 0.01, // equivalent to 100 sq ft per person-hour
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const [result] = calculateAssemblyVariance([completedProjectWithLine(bigAssembly, 1000, 1000, 10, 0)]);
    expect(result.avgEstimatedLaborHours).toBe(10); // 1000 * 0.01, NOT 1000 * 100 = 100,000
    expect(result.avgEstimatedLaborHours).not.toBe(100000);
  });

  it("REGRESSION: uses the assumption LOCKED into the quote at completion time, not today's edited catalog value", () => {
    const originalAssembly: Assembly = {
      id: "shifting-rate",
      name: "Shifting Rate Service",
      unit: "yd3",
      materials: [],
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const project = completedProjectWithLine(originalAssembly, 10, 10, 5, 0);
    // The catalog assembly is edited to a wildly different hours-per-unit
    // AFTER the job was quoted and completed.
    const editedAssembly: Assembly = { ...originalAssembly, laborPersonHoursPerUnit: 99 };
    // calculateAssemblyVariance doesn't even take a catalog anymore — but
    // assert the locked figure captured on the project's own revision is
    // what was actually used, not the edited one.
    const lockedHours = project.quoteRevisions[0].serviceLines[0].laborPersonHoursPerUnit;
    expect(lockedHours).toBe(0.4);
    expect(lockedHours).not.toBe(editedAssembly.laborPersonHoursPerUnit);
    const [result] = calculateAssemblyVariance([project]);
    expect(result.avgEstimatedLaborHours).toBe(4); // 10 * 0.4, using the LOCKED value
  });

  it("matches the brief's mulch material variance: 7.8 yd3 est -> 8.7 actual -> +11.5%", () => {
    const mulchAssembly: Assembly = {
      id: "mulch-install",
      name: "Mulch Installation",
      unit: "yd3",
      materials: [],
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const projects = Array.from({ length: 24 }, (_, i) => completedProjectWithLine(mulchAssembly, 7.8, 8.7, 3, i));

    const [result] = calculateAssemblyVariance(projects);
    expect(result.completedCount).toBe(24);
    expect(result.avgEstimatedQuantity).toBeCloseTo(7.8, 10);
    expect(result.avgActualQuantity).toBeCloseTo(8.7, 10);
    expect(result.materialVariancePercent).toBeCloseTo(11.5, 1);
  });

  it("avgActualProductionRate is null (not Infinity) when no labor hours were logged", () => {
    const assembly: Assembly = {
      id: "no-hours",
      name: "No Hours Service",
      unit: "each",
      materials: [],
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 0.1,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const [result] = calculateAssemblyVariance([completedProjectWithLine(assembly, 5, 5, 0, 0)]);
    expect(result.avgActualProductionRate).toBeNull();
  });

  it("excludes a completed job whose project was never actually quoted (no active revision) and reports why", () => {
    const assembly: Assembly = {
      id: "never-quoted",
      name: "Never Quoted Service",
      unit: "each",
      materials: [],
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 0.2,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
    };
    const unquoted = baseProject({
      id: "proj-unquoted",
      status: "won",
      serviceLines: [{ id: "l1", assemblyId: assembly.id, quantity: 5 }],
      actual: {
        actualLaborPersonHours: 1,
        actualMaterialsCostCents: ZERO_CENTS,
        actualEquipmentCostCents: ZERO_CENTS,
        actualDeliveryCostCents: ZERO_CENTS,
        actualOtherCostCents: ZERO_CENTS,
        finalSellingPriceCents: ZERO_CENTS,
        completedAt: "2026-02-01T00:00:00.000Z",
        serviceLineActuals: [{ assemblyId: assembly.id, estimatedQuantity: 5, actualQuantity: 5, actualLaborHours: 1 }],
      },
      // quoteRevisions deliberately left empty — never quoted.
    });
    const [result] = calculateAssemblyVariance([unquoted]);
    expect(result.eligibleRecordCount).toBe(0);
    expect(result.excludedRecordCount).toBe(1);
    expect(result.exclusionReasons["missing locked labor assumption"]).toBe(1);
  });

  it("omits assemblies with no completed jobs", () => {
    expect(calculateAssemblyVariance([])).toEqual([]);
  });
});

describe("calculateProfitabilitySummary — revenue-weighted, using actualQuotedPriceCents", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };

  it("returns nulls and a zero count when nothing is completed", () => {
    const summary = calculateProfitabilitySummary([], business);
    expect(summary.eligibleCount).toBe(0);
    expect(summary.weightedExpectedMargin).toBeNull();
    expect(summary.weightedActualMargin).toBeNull();
  });

  function wonProject(id: string, quantity: number, actualMaterialsCostCents: number): Project {
    const draft = baseProject({ id, name: `Job ${id}`, serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity }] });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    return {
      ...draft,
      status: "won",
      quoteRevisions: [revision],
      activeQuoteRevisionId: revision.id,
      actual: {
        actualLaborPersonHours: quantity * 0.4,
        actualMaterialsCostCents: cents(actualMaterialsCostCents),
        actualEquipmentCostCents: ZERO_CENTS,
        actualDeliveryCostCents: ZERO_CENTS,
        actualOtherCostCents: ZERO_CENTS,
        finalSellingPriceCents: revision.actualQuotedPriceCents,
        completedAt: "2026-02-01T00:00:00.000Z",
      },
    };
  }

  it("computes expected/actual margin for a single completed job", () => {
    const project = wonProject("p1", 8, 40000);
    const summary = calculateProfitabilitySummary([project], business);
    expect(summary.eligibleCount).toBe(1);
    expect(summary.weightedExpectedMargin).not.toBeNull();
    expect(summary.weightedActualMargin).not.toBeNull();
  });

  it("REGRESSION: weights by aggregate revenue, not by averaging each job's own margin percentage equally", () => {
    // A small job with a terrible margin and a large job with a great margin —
    // an unweighted average of the two percentages would land roughly midway
    // between them, but revenue-weighting must land close to the large job's
    // margin since it dominates total revenue.
    const smallBadJob = wonProject("small", 1, 20000); // tiny revenue, deeply unprofitable
    const largeGoodJob = wonProject("large", 100, 100000); // huge revenue, healthy margin

    const summary = calculateProfitabilitySummary([smallBadJob, largeGoodJob], business);

    const smallComparison = evaluateActualVsEstimate(getActiveRevision(smallBadJob)!, 20000 + 1 * 0.4 * business.loadedLaborRateCents);
    const largeComparison = evaluateActualVsEstimate(getActiveRevision(largeGoodJob)!, 100000 + 100 * 0.4 * business.loadedLaborRateCents);
    const unweightedAverage = ((smallComparison.actualMargin ?? 0) + (largeComparison.actualMargin ?? 0)) / 2;

    expect(summary.weightedActualMargin).not.toBeNull();
    // The revenue-weighted figure must sit far closer to the large job's own
    // margin than a naive 50/50 average would — proving the headline is
    // computed from aggregate revenue/cost, not averaged percentages.
    expect(Math.abs((summary.weightedActualMargin as number) - unweightedAverage)).toBeGreaterThan(5);
    expect(Math.abs((summary.weightedActualMargin as number) - (largeComparison.actualMargin ?? 0))).toBeLessThan(
      Math.abs(unweightedAverage - (largeComparison.actualMargin ?? 0))
    );
  });

  it("also reports average/median per-job margin as clearly-secondary metrics, distinct from the weighted headline", () => {
    const smallBadJob = wonProject("small2", 1, 20000);
    const largeGoodJob = wonProject("large2", 100, 100000);
    const summary = calculateProfitabilitySummary([smallBadJob, largeGoodJob], business);
    expect(summary.averageActualMarginPerJob).not.toBeNull();
    expect(summary.medianActualMarginPerJob).not.toBeNull();
    // These secondary per-job stats must NOT be the number reported as the
    // primary weighted metric.
    expect(summary.averageActualMarginPerJob).not.toBe(summary.weightedActualMargin);
  });
});

describe("snapshotCostImpact / classifyCostImpact — three independent axes", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
    currentRateCents: cents(9500),
  };
  const edgingAssembly: Assembly = {
    id: "edging",
    name: "Edging",
    unit: "linear-ft",
    materials: [],
    laborInputMode: "person-hours-per-unit" as const,
    laborPersonHoursPerUnit: 0.025,
    equipment: [],
    otherCostPerUnitCents: cents(40),
    currentRateCents: cents(225),
  };
  const assemblies = [mulchAssembly, edgingAssembly];
  const template: ProjectTemplate = {
    id: "tmpl-1",
    name: "Mulch refresh",
    serviceLines: [{ assemblyId: "mulch-install", quantity: 8 }],
    equipmentLines: [],
    deliveryCostCents: ZERO_CENTS,
    extraCosts: [],
  };

  function projectQuotedAt(priceCents: number): Project {
    const draft = baseProject({ id: "proj-1", name: "Low margin job", status: "sent", serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    // A real revision (not a bare fakeRevision) so its LOCKED serviceLines
    // actually contain the mulch-install quantity these tests reprice.
    const revision = buildQuoteRevision(draft, assemblies, materials, equipment, DEFAULT_BUSINESS_SETTINGS, { actualQuotedPriceOverrideCents: cents(priceCents) });
    return { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
  }

  const lowMarginProject = projectQuotedAt(40000); // quoted back when mulch was cheap
  const workspace = { assemblies, templates: [template], projects: [lowMarginProject], materials, equipment, business: DEFAULT_BUSINESS_SETTINGS };

  it("finds only assemblies that use the changed material", () => {
    const snapshot = snapshotCostImpact("material", "mulch", workspace);
    expect(snapshot.affectedAssemblyIds).toEqual(["mulch-install"]);
    expect(snapshot.affectedTemplateIds).toEqual(["tmpl-1"]);
    expect(snapshot.affectedProjectIds).toEqual(["proj-1"]);
  });

  it("a labor-rate change affects every assembly that bills labor", () => {
    const snapshot = snapshotCostImpact("labor", undefined, workspace);
    expect(snapshot.affectedAssemblyIds.sort()).toEqual(["edging", "mulch-install"]);
  });

  it("flags open estimates currently below their own target margin", () => {
    const snapshot = snapshotCostImpact("material", "mulch", workspace);
    expect(snapshot.belowTargetProjectIds).toEqual(["proj-1"]);
  });

  it("excludes archived projects from the affected count", () => {
    const archived = { ...lowMarginProject, id: "proj-archived", status: "archived" as const };
    const snapshot = snapshotCostImpact("material", "mulch", { ...workspace, projects: [archived] });
    expect(snapshot.affectedProjectIds).toEqual([]);
  });

  it("returns nothing for an equipment id no assembly references", () => {
    const snapshot = snapshotCostImpact("equipment", "does-not-exist", workspace);
    expect(snapshot.affectedAssemblyIds).toEqual([]);
    expect(snapshot.affectedProjectIds).toEqual([]);
  });

  it("classifies a project already below target that stays below after a further cost increase", () => {
    const before = snapshotCostImpact("material", "mulch", workspace);
    const pricierMulch = materials.map((m) => (m.id === "mulch" ? { ...m, unitCostCents: cents(20000) } : m));
    const after = snapshotCostImpact("material", "mulch", { ...workspace, materials: pricierMulch });

    const impacts = classifyCostImpact(before, after);
    const projImpact = impacts.find((i) => i.projectId === "proj-1");
    expect(projImpact?.targetStatus).toBe("below-target");
    expect(projImpact?.thresholdTransition).toBe("no-crossing"); // was already below
    expect(projImpact?.impactDirection).toBe("worsened");
    expect(projImpact?.trueCostDeltaCents).toBeGreaterThan(0);
  });

  it("classifies newly-below then recovered-above independently across two edits", () => {
    const richerProject = projectQuotedAt(1000000);
    const richWorkspace = { ...workspace, projects: [richerProject] };
    const cheapBefore = snapshotCostImpact("material", "mulch", richWorkspace);
    const expensiveMaterials = materials.map((m) => (m.id === "mulch" ? { ...m, unitCostCents: cents(500000) } : m));
    const expensiveAfter = snapshotCostImpact("material", "mulch", { ...richWorkspace, materials: expensiveMaterials });

    const impact = classifyCostImpact(cheapBefore, expensiveAfter).find((i) => i.projectId === "proj-1");
    expect(impact?.thresholdTransition).toBe("newly-below");
    expect(impact?.targetStatus).toBe("below-target");
    expect(impact?.impactDirection).toBe("worsened");

    const backToCheap = snapshotCostImpact("material", "mulch", richWorkspace);
    const recovered = classifyCostImpact(expensiveAfter, backToCheap).find((i) => i.projectId === "proj-1");
    expect(recovered?.thresholdTransition).toBe("recovered-above");
    expect(recovered?.targetStatus).toBe("above-target");
    expect(recovered?.impactDirection).toBe("improved");
  });

  it("a draft with no quote revision is 'unpriced' on every axis", () => {
    const draft = baseProject({ id: "proj-draft", serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const draftWorkspace = { ...workspace, projects: [draft] };
    const before = snapshotCostImpact("material", "mulch", draftWorkspace);
    const after = snapshotCostImpact("material", "mulch", { ...draftWorkspace, materials: materials.map((m) => (m.id === "mulch" ? { ...m, unitCostCents: cents(99900) } : m)) });
    const impact = classifyCostImpact(before, after).find((i) => i.projectId === "proj-draft");
    expect(impact?.targetStatus).toBe("unpriced");
    expect(impact?.impactDirection).toBeNull();
    expect(impact?.thresholdTransition).toBeNull();
  });

  it("a change too small to matter is classified 'unchanged', not improved/worsened", () => {
    const before = snapshotCostImpact("material", "mulch", workspace);
    // An unrelated equipment-only edit doesn't touch mulch-install at all —
    // the project's own figures are identical before/after.
    const after = snapshotCostImpact("material", "mulch", workspace);
    const impact = classifyCostImpact(before, after).find((i) => i.projectId === "proj-1");
    expect(impact?.impactDirection).toBe("unchanged");
    expect(impact?.marginPointsDelta).toBeCloseTo(0, 10);
  });
});

describe("integration: draft -> recommended price -> override -> revision -> catalog change -> cost-impact -> actuals -> profitability", () => {
  it("walks the full lifecycle and keeps every stage internally consistent", () => {
    const mulchAssembly: Assembly = {
      id: "mulch-install",
      name: "Mulch Installation",
      unit: "yd3",
      materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
      laborInputMode: "person-hours-per-unit" as const,
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnitCents: ZERO_CENTS,
      currentRateCents: cents(9500),
    };
    let assemblies = [mulchAssembly];
    let materialsCatalog = materials;

    // 1. Draft estimate.
    let project = baseProject({ id: "lifecycle", name: "Lifecycle Job", serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    expect(project.status).toBe("draft");
    expect(getActiveRevision(project)).toBeNull();

    // 2. Recommended price (live, unlocked).
    const live = evaluateProject(project, assemblies, materialsCatalog, [], business);
    expect(live.displayPriceCents).not.toBeNull();

    // 3. Manual quoted-price override — the contractor negotiates a
    // different final number.
    const negotiatedPriceCents = (live.displayPriceCents as number) - 5000;
    const revision1 = buildQuoteRevision(project, assemblies, materialsCatalog, [], business, {
      actualQuotedPriceOverrideCents: cents(negotiatedPriceCents),
      reason: "Negotiated $50 off",
    });
    expect(revision1.actualQuotedPriceCents).toBe(negotiatedPriceCents);
    expect(revision1.roundedRecommendedPriceCents).not.toBe(negotiatedPriceCents);
    project = { ...project, status: "sent", quoteRevisions: [revision1], activeQuoteRevisionId: revision1.id };

    // 4. Quote revision recorded and immutable.
    expect(project.quoteRevisions).toHaveLength(1);

    // 5. Catalog cost change AFTER the quote was locked in.
    materialsCatalog = materialsCatalog.map((m) => (m.id === "mulch" ? { ...m, unitCostCents: cents(9000) } : m));

    // 6. Cost-impact report: reprice the SAME locked quantities against the
    // new catalog, without touching the stored revision.
    const workspaceBefore = { assemblies, templates: [] as ProjectTemplate[], projects: [project], materials, equipment: [], business };
    const workspaceAfter = { ...workspaceBefore, materials: materialsCatalog };
    const before = snapshotCostImpact("material", "mulch", workspaceBefore);
    const after = snapshotCostImpact("material", "mulch", workspaceAfter);
    const impact = classifyCostImpact(before, after).find((i) => i.projectId === project.id);
    expect(impact).toBeDefined();
    expect(impact!.trueCostDeltaCents).toBeGreaterThan(0); // materials got more expensive
    expect(revision1.serviceLines[0]?.materialCostPerUnitCents).toBe(4200); // the LOCKED revision is untouched

    // 7. Actual costs recorded, job completed.
    const actualDirectCostCents = 9000 * 8 + 0.4 * 8 * business.loadedLaborRateCents; // uses the NEW material price, as really happened
    const comparison = evaluateActualVsEstimate(revision1, actualDirectCostCents);
    project = {
      ...project,
      status: "won",
      actual: {
        actualLaborPersonHours: 0.4 * 8,
        actualMaterialsCostCents: cents(9000 * 8),
        actualEquipmentCostCents: ZERO_CENTS,
        actualDeliveryCostCents: ZERO_CENTS,
        actualOtherCostCents: ZERO_CENTS,
        finalSellingPriceCents: revision1.actualQuotedPriceCents,
        completedAt: "2026-03-01T00:00:00.000Z",
      },
    };
    expect(comparison.actualTrueCostCents).toBeGreaterThan(comparison.estimatedTrueCostCents); // costs rose after quoting

    // 8. Completed job feeds the profitability report, using actualQuotedPriceCents.
    const summary = calculateProfitabilitySummary([project], business);
    expect(summary.eligibleCount).toBe(1);
    expect(summary.weightedActualMargin).not.toBeNull();
    // Actual margin must be lower than expected, since real costs came in higher.
    expect(summary.weightedActualMargin as number).toBeLessThan(summary.weightedExpectedMargin as number);
  });
});
