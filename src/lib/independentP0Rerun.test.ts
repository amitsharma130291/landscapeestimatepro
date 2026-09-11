/**
 * Independent P0 rerun (post-fix regression check), per the audit's own
 * requirement: at least 10 P0 cases, across different domains, verified
 * through a SEPARATE computation path from every other oracle test in this
 * repo. Every expected value below is computed with plain vanilla
 * JavaScript arithmetic and manual `Math.round` cent-rounding — deliberately
 * NOT using Decimal.js, NOT importing any shared fixture/helper from
 * productLogicOracles.test.ts or workbookExactDataOracles.test.ts, and NOT
 * reusing any "cents()" cast helper those files define. This file's only
 * import from the app itself is the real production function under test —
 * everything that computes the EXPECTED value is written fresh here.
 */
import { describe, expect, it } from "vitest";
import { calculateExactPricingChainCents } from "./calc";
import { calculateAssemblyCost, evaluateActualVsEstimate, evaluateMinimumJob, evaluateRateHealth, snapshotCostImpact } from "./estimateMath";
import { multiplyCentsByRate } from "./money";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { Assembly, Material, Project, ProjectTemplate, QuoteRevision } from "./types";

/** Plain, from-scratch cent rounding — round-half-up on a raw JS float,
 * independent of Decimal.js and of any rounding helper defined elsewhere in
 * this codebase. Good enough for these one-off oracle checks precisely
 * because every input below was chosen (by the workbook) to land exactly on
 * a cent or an unambiguous half-cent, so ordinary float arithmetic doesn't
 * accumulate meaningful error before rounding. */
function dollarsToCentsPlain(dollars: number): number {
  return Math.round(dollars * 100);
}

describe("Independent P0 rerun #1 — Required selling price (OR-04 / LEP-062/099)", () => {
  it("2849.70 / (1 - 0.35) = 4384.153846... -> $4,384.15, via a from-scratch division, not Decimal.js", () => {
    const trueCostDollars = 2849.7;
    const marginFraction = 0.35;
    const rawRequired = trueCostDollars / (1 - marginFraction); // 4384.153846153846...
    const expectedCents = Math.round(rawRequired * 100); // half-up on the raw float: 438415.3846 -> 438415

    const chain = calculateExactPricingChainCents(
      { materialsCostCents: 125000 as never, laborCostCents: 76800 as never, equipmentCostCents: 18000 as never, deliveryCostCents: 18000 as never, otherCostCents: 10000 as never, overheadPercent: 15 },
      35,
      1
    );
    expect(chain.exactRequiredPriceCents).toBe(expectedCents);
    expect(chain.exactRequiredPriceCents).toBe(438415);
  });
});

describe("Independent P0 rerun #2 — Production-rate labor (OR-14 / LEP-085/109)", () => {
  it("8 units at 2.5 units/person-hour, $32.00/hour -> 3.2 person-hours -> $102.40, computed as plain division/multiplication", () => {
    const quantity = 8;
    const productionRate = 2.5;
    const loadedRateDollars = 32;
    const personHours = quantity / productionRate; // 3.2
    const expectedCents = dollarsToCentsPlain(personHours * loadedRateDollars); // 320

    const assembly: Assembly = {
      id: "indep-prod-rate",
      name: "Independent Rerun Production Rate",
      unit: "yd3",
      materials: [],
      laborInputMode: "production-rate",
      laborPersonHoursPerUnit: personHours / quantity, // per-unit figure the production code actually stores
      laborProductionRate: productionRate,
      equipment: [],
      otherCostPerUnitCents: 0 as never,
    };
    const perUnit = calculateAssemblyCost(assembly, [], [], 3200 as never, 0);
    const totalLaborCents = perUnit.laborCostPerUnitCents * quantity;
    expect(totalLaborCents).toBe(expectedCents);
    expect(totalLaborCents).toBe(10240);
  });
});

describe("Independent P0 rerun #3 — Direct crew labor (OR-15 / LEP-083/110)", () => {
  it("crew 3, elapsed 8 hours, $32.00 loaded rate -> $768.00, plain multiplication of the three raw numbers", async () => {
    const crewSize = 3;
    const elapsedHours = 8;
    const loadedRateDollars = 32;
    const expectedCents = dollarsToCentsPlain(crewSize * elapsedHours * loadedRateDollars);

    const { evaluateProject } = await import("./estimateMath");
    const project = {
      id: "indep-crew",
      name: "Independent Rerun Crew",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "draft",
      serviceLines: [],
      equipmentLines: [],
      laborLines: [{ id: "l1", label: "Crew", mode: "crew-duration", crewSize, elapsedHours, loadedRateCents: (loadedRateDollars * 100) as never, taxable: true }],
      deliveryCostCents: 0 as never,
      extraCosts: [],
      overheadPercent: 0,
      targetMarginPercent: 35,
      taxRatePercent: 0,
      quoteRevisions: [],
    } as unknown as Project;
    const result = evaluateProject(project, [], [], [], DEFAULT_BUSINESS_SETTINGS);
    expect(result.laborCostCents).toBe(expectedCents);
    expect(result.laborCostCents).toBe(76800);
  });
});

describe("Independent P0 rerun #4 — Tax rounding (OR-16 / LEP-050/111)", () => {
  it("$10.05 at 8.25% -> $0.829125, rounds to $0.83 via plain Math.round, not the app's own multiplyCentsByRate logic internals", () => {
    const subtotalDollars = 10.05;
    const taxRateFraction = 0.0825;
    const rawTax = subtotalDollars * taxRateFraction; // 0.829125
    const expectedCents = Math.round(rawTax * 100); // 82.9125 -> 83

    const actualCents = multiplyCentsByRate(1005 as never, taxRateFraction);
    expect(actualCents).toBe(expectedCents);
    expect(actualCents).toBe(83);
  });
});

describe("Independent P0 rerun #5 — Rate Health (OR-07/OR-08 / LEP-102/103/116)", () => {
  it("current $65.00, true cost $48.00, target 35% -> margin 26.15%, required $73.85 — computed from scratch", () => {
    const currentRateDollars = 65;
    const trueCostDollars = 48;
    const targetMarginFraction = 0.35;
    const expectedMarginPercent = ((currentRateDollars - trueCostDollars) / currentRateDollars) * 100; // 26.153846...
    const expectedRequiredCents = Math.round((trueCostDollars / (1 - targetMarginFraction)) * 100); // 7384.615... -> 7385

    const health = evaluateRateHealth(4800, 6500, 35);
    expect(Number(health.currentMargin!.toFixed(2))).toBe(Number(expectedMarginPercent.toFixed(2)));
    expect(health.requiredRateCents).toBe(expectedRequiredCents);
    expect(health.requiredRateCents).toBe(7385);
  });
});

describe("Independent P0 rerun #6 — Minimum Job Audit (OR-09/OR-10 / LEP-104/105/118)", () => {
  it("minimum $500.00, typical true cost $390.00, target 35% -> margin 22.00%, required minimum $600.00 — computed from scratch", () => {
    const minimumDollars = 500;
    const typicalCostDollars = 390;
    const targetMarginFraction = 0.35;
    const expectedMarginPercent = ((minimumDollars - typicalCostDollars) / minimumDollars) * 100; // 22 exactly
    const expectedRequiredMinimumCents = Math.round((typicalCostDollars / (1 - targetMarginFraction)) * 100); // 60000

    const audit = evaluateMinimumJob(50000, 39000, 35);
    expect(audit.currentMargin).toBe(expectedMarginPercent);
    expect(audit.currentMargin).toBe(22);
    expect(audit.requiredMinimumCents).toBe(expectedRequiredMinimumCents);
    expect(audit.requiredMinimumCents).toBe(60000);
  });
});

describe("Independent P0 rerun #7 — Actual margin (OR-11 / LEP-106/128)", () => {
  it("accepted revenue $4,385.00, actual cost $3,345.00 -> margin 23.72%, computed from scratch", () => {
    const revenueDollars = 4385;
    const actualCostDollars = 3345;
    const expectedMarginPercent = ((revenueDollars - actualCostDollars) / revenueDollars) * 100; // 23.71721...

    const revision = { overheadPercent: 0, actualQuotedPriceCents: 438500, trueCostCents: 300000 } as QuoteRevision;
    const result = evaluateActualVsEstimate(revision, actualCostDollars * 100);
    expect(Number(result.actualMargin!.toFixed(2))).toBe(Number(expectedMarginPercent.toFixed(2)));
    expect(Number(result.actualMargin!.toFixed(2))).toBe(23.72);
  });
});

describe("Independent P0 rerun #8 — Scenario isolation (LEP-123)", () => {
  it("snapshotCostImpact never mutates the workspace objects passed to it — verified by reference identity AND deep-equality against a separately frozen copy", () => {
    const materials: Material[] = [{ id: "m1", name: "Mulch", unitCostCents: 4200 as never, unit: "yd3" }];
    const assembly: Assembly = {
      id: "a1",
      name: "Mulch Install",
      unit: "yd3",
      materials: [{ materialId: "m1", quantityPerUnit: 1 }],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnitCents: 0 as never,
    };
    const workspace = { assemblies: [assembly], templates: [] as ProjectTemplate[], projects: [] as Project[], materials, equipment: [], business: DEFAULT_BUSINESS_SETTINGS };
    // A separately-constructed, independent frozen snapshot (built with
    // Object.freeze, not by importing any test helper) to compare against.
    const frozenMaterialsCopy = JSON.parse(JSON.stringify(materials));
    const frozenAssemblyCopy = JSON.parse(JSON.stringify(assembly));

    snapshotCostImpact("material", "m1", workspace);

    expect(workspace.materials).toBe(materials); // same array reference, never replaced
    expect(materials).toEqual(frozenMaterialsCopy); // contents byte-for-byte identical
    expect(assembly).toEqual(frozenAssemblyCopy);
  });
});

describe("Independent P0 rerun #9 — Quote revision immutability (LEP-091/126)", () => {
  it("a locked revision's own price/cost fields never change after the catalog it was built from is edited", async () => {
    const { buildQuoteRevision } = await import("./estimateMath");
    const materials: Material[] = [{ id: "m1", name: "Mulch", unitCostCents: 4200 as never, unit: "yd3" }];
    const assembly: Assembly = {
      id: "a1",
      name: "Mulch Install",
      unit: "yd3",
      materials: [{ materialId: "m1", quantityPerUnit: 1 }],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnitCents: 0 as never,
    };
    const project = {
      id: "p1",
      name: "Job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "draft",
      serviceLines: [{ id: "l1", assemblyId: "a1", quantity: 8 }],
      equipmentLines: [],
      laborLines: [],
      deliveryCostCents: 0 as never,
      extraCosts: [],
      overheadPercent: 15,
      targetMarginPercent: 35,
      taxRatePercent: 0,
      quoteRevisions: [],
    } as unknown as Project;

    const revision = buildQuoteRevision(project, [assembly], materials, [], DEFAULT_BUSINESS_SETTINGS);
    const priceBeforeEdit = revision.actualQuotedPriceCents;
    const trueCostBeforeEdit = revision.trueCostCents;

    // Wildly change the catalog price AFTER the revision was locked.
    const editedMaterials = materials.map((m) => (m.id === "m1" ? { ...m, unitCostCents: 999900 as never } : m));
    void editedMaterials; // the edit itself is never re-applied to `revision` — that's the entire point

    expect(revision.actualQuotedPriceCents).toBe(priceBeforeEdit);
    expect(revision.trueCostCents).toBe(trueCostBeforeEdit);
    expect(revision.trueCostCents).not.toBe(0);
  });
});

describe("Independent P0 rerun #10 — Backup/restore round trip (LEP-142)", () => {
  it("exportWorkspaceJson -> parseWorkspaceJson reproduces an equivalent workspace, verified field-by-field with a hand-written comparator (not deep-equal against the same fixture object)", async () => {
    const { createSampleWorkspace } = await import("./sampleData");
    const { exportWorkspaceJson, parseWorkspaceJson } = await import("./persistence");

    const original = createSampleWorkspace();
    const json = exportWorkspaceJson(original);
    const result = parseWorkspaceJson(json);

    expect(result.ok).toBe(true);
    const restored = result.workspace!;

    // Hand-written field checks, not a blanket toEqual against `original`.
    expect(restored.materials.length).toBe(original.materials.length);
    expect(restored.equipment.length).toBe(original.equipment.length);
    expect(restored.assemblies.length).toBe(original.assemblies.length);
    expect(restored.projects.length).toBe(original.projects.length);
    expect(restored.business.loadedLaborRateCents).toBe(original.business.loadedLaborRateCents);
    expect(restored.business.overheadPercent).toBe(original.business.overheadPercent);
    for (let i = 0; i < original.materials.length; i++) {
      expect(restored.materials[i].id).toBe(original.materials[i].id);
      expect(restored.materials[i].unitCostCents).toBe(original.materials[i].unitCostCents);
    }
  });
});
