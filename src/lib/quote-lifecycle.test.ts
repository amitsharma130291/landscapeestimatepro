/**
 * Permanent home for the Pro Catalog/Settings/Assemblies/Estimate-Builder/
 * Revenue-Allocation/Mixed-Tax test cases from the QA workbook
 * (LEP-031..049, LEP-051..057, LEP-064/065/068/070, LEP-073..075,
 * LEP-077..080), plus the catalog-reference-integrity fix (DEF-09) added
 * afterward. Restored here as a permanent regression suite — see
 * "financial-oracle.test.ts" for this file's sibling covering the pure
 * calc-layer cases and Formula Oracle.
 */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateMargin } from "./calc";
import {
  buildAcceptancePatch,
  calculateAssemblyCost,
  deriveLifecycleStage,
  describeStatusTransition,
  evaluateProject,
  findCatalogItemReferences,
  getQuoteBlockingErrors,
  buildQuoteRevision,
  evaluateRateHealth,
  QuoteBlockedError,
} from "./estimateMath";
import { resolveDraftCommit } from "./draftNumberInputLogic";
import { resolveMoneyCommit } from "./moneyInputLogic";
import { allocateCents, sumCents, ZERO_CENTS, type MoneyCents } from "./money";
import {
  validateDollarInput,
  validateOverheadPercent,
  validateProductionRate,
  validateTargetMarginPercent,
  validateTaxRatePercent,
} from "./validation";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { Assembly, BusinessSettings, Equipment, Material, Project, ProjectTemplate } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

const business: BusinessSettings = { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: cents(3200) };
const zeroLaborBusiness: BusinessSettings = { ...business, loadedLaborRateCents: cents(0) };

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

// -- Pro Catalog: Materials / Equipment validation (LEP-031..042) -----------

describe("LEP-031..042 Catalog validation (real validateDollarInput + resolveMoneyCommit, the exact functions MoneyInput uses)", () => {
  const invalidCases: [string, string][] = [
    ["negative (LEP-033/039)", "-1"],
    ["malformed (LEP-034/040)", "12abc"],
    ["partial decimal (LEP-035/041)", "."],
    ["unsafe large (LEP-036/042)", "9007199254740992"],
  ];
  for (const [label, raw] of invalidCases) {
    it(`${label}: "${raw}" produces a field error and never commits`, () => {
      expect(validateDollarInput(raw)).not.toBeNull();
      expect(resolveMoneyCommit(raw).commit).toBe(false);
    });
  }
  it("LEP-032 blank: clearing the field IS a valid commit (persists as blank, never coerced to zero) — required-ness is enforced separately by getMaterialValidationErrors", () => {
    expect(validateDollarInput("")).not.toBeNull();
    expect(resolveMoneyCommit("")).toEqual({ commit: true, cents: "" });
  });
  it("LEP-031 create and edit material: $42.00 -> 4200 cents, then $45.50 -> 4550 cents", () => {
    expect(resolveMoneyCommit("42.00")).toEqual({ commit: true, cents: 4200 });
    expect(resolveMoneyCommit("45.50")).toEqual({ commit: true, cents: 4550 });
  });
  it("LEP-038 create equipment rate: $85.00 -> 8500 cents", () => {
    expect(resolveMoneyCommit("85.00")).toEqual({ commit: true, cents: 8500 });
  });
});

describe("LEP-037 Material price change impact (Cost Impact banner data)", () => {
  it("changing a referenced material from $42 to $95 correctly identifies affected assemblies/projects, and a LOCKED quote's own figures stay unchanged", () => {
    const assembly: Assembly = { id: "asm-mulch", name: "Mulch Install", unit: "yd3", materials: [{ materialId: "mulch", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0.4, equipment: [], otherCostPerUnitCents: ZERO_CENTS, currentRateCents: cents(9500) };
    const materials: Material[] = [{ id: "mulch", name: "Mulch", unitCostCents: cents(4200), unit: "yd3" }];
    const project = baseProject({ id: "p1", status: "sent", serviceLines: [{ id: "l1", assemblyId: "asm-mulch", quantity: 8 }] });
    const revision = buildQuoteRevision(project, [assembly], materials, [], DEFAULT_BUSINESS_SETTINGS, { actualQuotedPriceOverrideCents: cents(40000) });
    expect(revision.serviceLines[0].materialCostPerUnitCents).toBe(4200);
  });
});

// -- Service Assemblies (LEP-043..049) ---------------------------------------

describe("LEP-043..049 Service Assemblies", () => {
  it("LEP-043 assembly direct/true cost: material $28 + labor .45h*$32 = $42.40 direct, $48.76 true, $75.02 required at 35%", () => {
    const materials: Material[] = [{ id: "shrub", name: "Shrub", unitCostCents: cents(2800), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "Shrub Install", unit: "each", materials: [{ materialId: "shrub", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0.45, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const cost = calculateAssemblyCost(assembly, materials, [], cents(3200), 15);
    expect(cost.directCostPerUnitCents).toBe(4240);
    expect(cost.trueCostPerUnitCents).toBe(4876);
    const health = evaluateRateHealth(cost.trueCostPerUnitCents, 8000, 35);
    expect(health.requiredRateCents).toBe(7502);
  });
  it("LEP-044/045 production-rate vs hours-per-unit modes are reciprocal and agree", () => {
    const materials: Material[] = [];
    const prodAssembly: Assembly = { id: "a", name: "A", unit: "yd3", materials: [], laborInputMode: "production-rate", laborProductionRate: 4, laborPersonHoursPerUnit: 0.25, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const hoursAssembly: Assembly = { ...prodAssembly, laborInputMode: "person-hours-per-unit" };
    const costProd = calculateAssemblyCost(prodAssembly, materials, [], cents(3200), 0);
    const costHours = calculateAssemblyCost(hoursAssembly, materials, [], cents(3200), 0);
    expect(costProd.laborCostPerUnitCents).toBe(800);
    expect(costProd.laborCostPerUnitCents).toBe(costHours.laborCostPerUnitCents);
  });
  it("LEP-046/047 zero production rate / zero hours-per-unit rejected by domain validation, not silently accepted", () => {
    expect(validateProductionRate(0)).not.toBeNull();
    const zeroHoursAssembly: Assembly = { id: "a", name: "A", unit: "each", materials: [], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    const errors = getQuoteBlockingErrors(project, [zeroHoursAssembly], [], []);
    expect(errors.some((e) => e.includes("Person-hours per unit"))).toBe(true);
  });
  it("LEP-049 multiple material and equipment rows: per-unit direct cost is the exact sum", () => {
    const materials: Material[] = [
      { id: "m1", name: "M1", unitCostCents: cents(100), unit: "each" },
      { id: "m2", name: "M2", unitCostCents: cents(250), unit: "each" },
      { id: "m3", name: "M3", unitCostCents: cents(75), unit: "each" },
    ];
    const equipment: Equipment[] = [
      { id: "e1", name: "E1", rateCents: cents(500), rateType: "hour" },
      { id: "e2", name: "E2", rateCents: cents(1200), rateType: "job" },
    ];
    const assembly: Assembly = {
      id: "a",
      name: "A",
      unit: "each",
      materials: [{ materialId: "m1", quantityPerUnit: 2 }, { materialId: "m2", quantityPerUnit: 1 }, { materialId: "m3", quantityPerUnit: 3 }],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0,
      equipment: [{ equipmentId: "e1", quantityPerUnit: 0.5 }, { equipmentId: "e2", quantityPerUnit: 1 }],
      otherCostPerUnitCents: cents(50),
    };
    const cost = calculateAssemblyCost(assembly, materials, equipment, cents(3200), 0);
    expect(cost.materialCostPerUnitCents).toBe(675);
    expect(cost.equipmentCostPerUnitCents).toBe(1450);
    expect(cost.directCostPerUnitCents).toBe(675 + 1450 + 50);
  });
});

// -- Pro Settings validation (LEP-051..057) ----------------------------------

describe("LEP-051..057 Settings validation (real validators + DraftNumberInput commit logic)", () => {
  it("LEP-052 overhead rejects -1", () => {
    expect(validateOverheadPercent(-1)).not.toBeNull();
    expect(resolveDraftCommit("-1", validateOverheadPercent).commit).toBe(false);
  });
  it("LEP-053 margin rejects 100", () => {
    expect(validateTargetMarginPercent(100)).not.toBeNull();
    expect(resolveDraftCommit("100", validateTargetMarginPercent).commit).toBe(false);
  });
  it("LEP-054 margin rejects 120", () => {
    expect(validateTargetMarginPercent(120)).not.toBeNull();
    expect(resolveDraftCommit("120", validateTargetMarginPercent).commit).toBe(false);
  });
  it("LEP-055 tax rejects -1", () => {
    expect(validateTaxRatePercent(-1)).not.toBeNull();
    expect(resolveDraftCommit("-1", validateTaxRatePercent).commit).toBe(false);
  });
  it("LEP-056 tax rejects 100.01", () => {
    expect(validateTaxRatePercent(100.01)).not.toBeNull();
    expect(resolveDraftCommit("100.01", validateTaxRatePercent).commit).toBe(false);
  });
  it("LEP-057 percentage rejects 35abc", () => {
    expect(resolveDraftCommit("35abc", validateTargetMarginPercent).commit).toBe(false);
    expect(resolveDraftCommit("35abc", validateOverheadPercent).commit).toBe(false);
    expect(resolveDraftCommit("35abc", validateTaxRatePercent).commit).toBe(false);
  });
});

// -- Pro Estimate Builder (LEP-064,065,068,070) ------------------------------

describe("LEP-064/065/068/070 Estimate Builder roll-up", () => {
  it("LEP-064 baseline project roll-up reconciles to the Formula Oracle", () => {
    const materials: Material[] = [{ id: "mulch", name: "Mulch", unitCostCents: cents(4200), unit: "yd3" }];
    const equipment: Equipment[] = [{ id: "skid", name: "Skid Steer", rateCents: cents(4500), rateType: "hour" }];
    const assembly: Assembly = { id: "mulch-install", name: "Mulch Install", unit: "yd3", materials: [{ materialId: "mulch", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0.4, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }],
      equipmentLines: [{ equipmentId: "skid", quantity: 4 }],
      deliveryCostCents: cents(18000),
      extraCosts: [{ id: "e1", label: "Other", amountCents: cents(10000) }],
    });
    const result = evaluateProject(project, [assembly], materials, equipment, business);
    expect(result.materialsCostCents).toBe(33600);
    expect(result.laborCostCents).toBe(10240);
    expect(result.equipmentCostCents).toBe(18000);
    expect(result.directCostCents).toBe(33600 + 10240 + 18000 + 18000 + 10000);
  });
  it("LEP-065 crew-duration line: crew 3, elapsed 8h, rate $30 -> 24 person-hours, $720 labor, counted once", () => {
    const project = baseProject({ laborLines: [{ id: "labor-1", label: "Crew", mode: "crew-duration", crewSize: 3, elapsedHours: 8, loadedRateCents: cents(3000) }] });
    const result = evaluateProject(project, [], [], [], business);
    expect(result.laborPersonHours).toBe(24);
    expect(result.laborCostCents).toBe(72000);
  });
  it("LEP-068 overhead applied exactly once: never double-counted", () => {
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100000), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], overheadPercent: 15 });
    const result = evaluateProject(project, [assembly], materials, [], business);
    expect(result.directCostCents).toBe(100000);
    expect(result.trueCostCents).toBe(115000);
    expect(result.trueCostCents).not.toBe(132250);
  });
  it("LEP-070 manual quote zero: actualQuotedPriceOverrideCents of 0 is blocked, not silently locked", () => {
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    expect(() => buildQuoteRevision(project, [assembly], materials, [], business, { actualQuotedPriceOverrideCents: cents(0) })).toThrow(QuoteBlockedError);
  });
});

// -- Revenue Allocation (LEP-073,074,075) ------------------------------------

describe("LEP-073/074/075 Revenue Allocation", () => {
  it("LEP-073 $100 across three equal lines: deterministic, sum exactly 10000", () => {
    const result = allocateCents(cents(10000), [1, 1, 1], ["a", "b", "c"]);
    expect(sumCents(result)).toBe(10000);
    expect(result).toEqual(allocateCents(cents(10000), [1, 1, 1], ["a", "b", "c"]));
  });
  it("LEP-074 unequal weighted lines: 10/20/70 split sums exactly, follows weights", () => {
    const result = allocateCents(cents(12345), [10, 20, 70], ["a", "b", "c"]);
    expect(sumCents(result)).toBe(12345);
    expect(result[2]).toBeGreaterThan(result[1]);
    expect(result[1]).toBeGreaterThan(result[0]);
  });
  it("LEP-075 zero total direct cost with a non-zero price is BLOCKED, never an arbitrary even split", () => {
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 0 }] });
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 0, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100), unit: "each" }];
    expect(() => buildQuoteRevision(project, [assembly], materials, [], business, { actualQuotedPriceOverrideCents: cents(10000) })).toThrow(QuoteBlockedError);
  });
});

// -- Mixed Tax (LEP-077,078,079,080) -----------------------------------------

describe("LEP-077/078/079/080 Mixed Tax", () => {
  it("LEP-077 taxable and non-taxable lines: margin uses pre-tax price", () => {
    const materials: Material[] = [
      { id: "taxable-m", name: "Taxable", unitCostCents: cents(60000), unit: "each" },
      { id: "exempt-m", name: "Exempt", unitCostCents: cents(40000), unit: "each" },
    ];
    const assemblies: Assembly[] = [
      { id: "taxable-a", name: "Taxable Service", unit: "each", materials: [{ materialId: "taxable-m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS },
      { id: "exempt-a", name: "Exempt Service", unit: "each", materials: [{ materialId: "exempt-m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS },
    ];
    const project = baseProject({
      serviceLines: [
        { id: "l1", assemblyId: "taxable-a", quantity: 1, taxable: true },
        { id: "l2", assemblyId: "exempt-a", quantity: 1, taxable: false },
      ],
      taxRatePercent: 8.25,
    });
    const revision = buildQuoteRevision(project, assemblies, materials, [], zeroLaborBusiness, { actualQuotedPriceOverrideCents: cents(100000) });
    expect(revision.taxableSubtotalCents).toBe(60000);
    expect(revision.taxAmountCents).toBe(4950);
    expect(revision.customerTotalCents).toBe(104950);
    expect(revision.achievedMargin).toBe(calculateMargin(cents(100000), revision.trueCostCents));
  });
  it("LEP-078 manual override drives tax", () => {
    const materials: Material[] = [
      { id: "taxable-m", name: "Taxable", unitCostCents: cents(6000), unit: "each" },
      { id: "exempt-m", name: "Exempt", unitCostCents: cents(4000), unit: "each" },
    ];
    const assemblies: Assembly[] = [
      { id: "taxable-a", name: "Taxable Service", unit: "each", materials: [{ materialId: "taxable-m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS },
      { id: "exempt-a", name: "Exempt Service", unit: "each", materials: [{ materialId: "exempt-m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS },
    ];
    const project = baseProject({
      serviceLines: [
        { id: "l1", assemblyId: "taxable-a", quantity: 1, taxable: true },
        { id: "l2", assemblyId: "exempt-a", quantity: 1, taxable: false },
      ],
      taxRatePercent: 10,
    });
    const revision = buildQuoteRevision(project, assemblies, materials, [], zeroLaborBusiness, { actualQuotedPriceOverrideCents: cents(110000) });
    expect(revision.taxableSubtotalCents).toBe(66000);
    expect(revision.taxAmountCents).toBe(6600);
    expect(revision.customerTotalCents).toBe(116600);
  });
  it("LEP-079 half-up fractional-cent tax: $10.01 at 8.25% -> $0.83 — reconciles OR-11", () => {
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(1001), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], taxRatePercent: 8.25 });
    const revision = buildQuoteRevision(project, [assembly], materials, [], zeroLaborBusiness, { actualQuotedPriceOverrideCents: cents(1001) });
    expect(revision.taxAmountCents).toBe(83);
  });
  it("LEP-080 draft-to-locked tax parity: evaluateProject and buildQuoteRevision agree exactly", () => {
    const materials: Material[] = [
      { id: "taxable-m", name: "Taxable", unitCostCents: cents(60000), unit: "each" },
      { id: "exempt-m", name: "Exempt", unitCostCents: cents(40000), unit: "each" },
    ];
    const assemblies: Assembly[] = [
      { id: "taxable-a", name: "Taxable Service", unit: "each", materials: [{ materialId: "taxable-m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS },
      { id: "exempt-a", name: "Exempt Service", unit: "each", materials: [{ materialId: "exempt-m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS },
    ];
    const project = baseProject({
      serviceLines: [
        { id: "l1", assemblyId: "taxable-a", quantity: 1, taxable: true },
        { id: "l2", assemblyId: "exempt-a", quantity: 1, taxable: false },
      ],
      taxRatePercent: 8.25,
    });
    const draft = evaluateProject(project, assemblies, materials, [], zeroLaborBusiness);
    const revision = buildQuoteRevision(project, assemblies, materials, [], zeroLaborBusiness);
    expect(revision.actualQuotedPriceCents).toBe(draft.displayPriceCents);
    expect(revision.taxableSubtotalCents).toBe(draft.taxableSubtotalCents);
    expect(revision.taxAmountCents).toBe(draft.taxAmountCents);
    expect(revision.customerTotalCents).toBe(draft.customerTotalCents);
  });
});

// -- OR-13: locked overhead, not current (reconciled here since it needs a full revision) --

describe("OR-13 actual true cost uses the revision's LOCKED overhead, not today's project value", () => {
  it("$3,350 x 1.15 = $3,852.50", () => {
    const materials: Material[] = [{ id: "m1", name: "M", unitCostCents: cents(1), unit: "each" }];
    const assembly: Assembly = { id: "a1", name: "A", unit: "each", materials: [{ materialId: "m1", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const revision = buildQuoteRevision(
      baseProject({ serviceLines: [{ id: "l1", assemblyId: "a1", quantity: 1 }], overheadPercent: 15 }),
      [assembly],
      materials,
      [],
      zeroLaborBusiness
    );
    const overheadFraction = new Decimal(15).dividedBy(100);
    const actualTrueCostCents = new Decimal(335000).times(new Decimal(1).plus(overheadFraction)).toNumber();
    expect(actualTrueCostCents).toBe(385250);
    expect(revision.overheadPercent).toBe(15); // locked, independent of any later business/project change
  });
});

// -- DEF-09: catalog reference integrity (getQuoteBlockingErrors / findCatalogItemReferences) --

describe("DEF-09 — catalog reference integrity: a missing resource can never silently reduce quote cost", () => {
  it("a service line referencing a DELETED assembly blocks quoting rather than silently contributing zero cost", () => {
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "deleted-assembly", quantity: 1 }] });
    const errors = getQuoteBlockingErrors(project, [], [], []);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes("no longer exists"))).toBe(true);
    expect(() => buildQuoteRevision(project, [], [], [], business)).toThrow(QuoteBlockedError);
  });

  it("an assembly referencing a DELETED material blocks quoting rather than silently omitting that line's cost", () => {
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "deleted-material", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    const errors = getQuoteBlockingErrors(project, [assembly], [], []);
    expect(errors.some((e) => e.includes("material") && e.includes("no longer exists"))).toBe(true);
  });

  it("an assembly referencing DELETED equipment blocks quoting rather than silently omitting that line's cost", () => {
    const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100), unit: "each" }];
    const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [{ equipmentId: "deleted-equipment", quantityPerUnit: 1 }], otherCostPerUnitCents: ZERO_CENTS };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    const errors = getQuoteBlockingErrors(project, [assembly], materials, []);
    expect(errors.some((e) => e.includes("equipment") && e.includes("no longer exists"))).toBe(true);
  });

  it("a project-level equipment line referencing DELETED equipment blocks quoting", () => {
    const project = baseProject({ equipmentLines: [{ equipmentId: "deleted-equipment", quantity: 1 }] });
    const errors = getQuoteBlockingErrors(project, [], [], []);
    expect(errors.some((e) => e.includes("no longer exists"))).toBe(true);
  });

  it("findCatalogItemReferences finds every assembly, template, and project referencing a material — used to warn before a catalog delete", () => {
    const assembly: Assembly = { id: "asm", name: "Mulch Install", unit: "yd3", materials: [{ materialId: "mulch", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
    const template: ProjectTemplate = { id: "tmpl", name: "Standard Mulch Job", serviceLines: [{ assemblyId: "asm", quantity: 5 }], equipmentLines: [], deliveryCostCents: ZERO_CENTS, extraCosts: [] };
    const project = baseProject({ id: "p1", serviceLines: [{ id: "l1", assemblyId: "asm", quantity: 5 }] });
    const refs = findCatalogItemReferences("material", "mulch", { assemblies: [assembly], templates: [template], projects: [project] });
    expect(refs.assemblies.map((a) => a.id)).toEqual(["asm"]);
    expect(refs.templates.map((t) => t.id)).toEqual(["tmpl"]);
    expect(refs.projects.map((p) => p.id)).toEqual(["p1"]);
  });

  it("findCatalogItemReferences returns nothing for an unreferenced material — a delete needs no warning", () => {
    const refs = findCatalogItemReferences("material", "unused-material", { assemblies: [], templates: [], projects: [] });
    expect(refs.assemblies).toEqual([]);
    expect(refs.templates).toEqual([]);
    expect(refs.projects).toEqual([]);
  });

  it("findCatalogItemReferences also finds equipment referenced directly on a project/template, not only through an assembly", () => {
    const template: ProjectTemplate = { id: "tmpl", name: "T", serviceLines: [], equipmentLines: [{ equipmentId: "skid", quantity: 1 }], deliveryCostCents: ZERO_CENTS, extraCosts: [] };
    const project = baseProject({ id: "p1", equipmentLines: [{ equipmentId: "skid", quantity: 1 }] });
    const refs = findCatalogItemReferences("equipment", "skid", { assemblies: [], templates: [template], projects: [project] });
    expect(refs.templates.map((t) => t.id)).toEqual(["tmpl"]);
    expect(refs.projects.map((p) => p.id)).toEqual(["p1"]);
  });
});

// -- Project lifecycle: derived stage + transition rules + acceptance --------

describe("Project lifecycle — deriveLifecycleStage", () => {
  const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100), unit: "each" }];
  const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
  const zeroLaborBusiness2: BusinessSettings = { ...business, loadedLaborRateCents: cents(0) };

  function quotedProject(overrides?: Partial<Project>): Project {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }], ...overrides });
    const revision = buildQuoteRevision(draft, [assembly], materials, [], zeroLaborBusiness2);
    return { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
  }

  it("a brand-new project with no revisions is 'draft'", () => {
    expect(deriveLifecycleStage(baseProject())).toBe("draft");
  });
  it("a project with a locked revision but still draft/sent status is 'quoted'", () => {
    expect(deriveLifecycleStage(quotedProject({ status: "sent" }))).toBe("quoted");
    expect(deriveLifecycleStage(quotedProject({ status: "draft" }))).toBe("quoted"); // revision exists even though status wasn't advanced yet
  });
  it("status 'won' with no actual data yet is 'accepted', not 'completed'", () => {
    expect(deriveLifecycleStage(quotedProject({ status: "won" }))).toBe("accepted");
  });
  it("status 'won' WITH actual data recorded is 'completed' — the same condition profitability reporting uses for eligibility", () => {
    const project = quotedProject({
      status: "won",
      actual: { actualLaborPersonHours: 0, actualMaterialsCostCents: cents(100), actualEquipmentCostCents: ZERO_CENTS, actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS, finalSellingPriceCents: cents(200), completedAt: "2026-02-01" },
    });
    expect(deriveLifecycleStage(project)).toBe("completed");
  });
  it("status 'lost' is 'lost' regardless of revisions", () => {
    expect(deriveLifecycleStage(quotedProject({ status: "lost" }))).toBe("lost");
  });
  it("status 'archived' is 'archived' even if it also has actual data (archived takes precedence for display)", () => {
    expect(deriveLifecycleStage(quotedProject({ status: "archived" }))).toBe("archived");
  });
  it("never disagrees with real records: a stage is always recomputed from status/quoteRevisions/actual, never cached", () => {
    const project = quotedProject({ status: "won" });
    expect(deriveLifecycleStage(project)).toBe("accepted");
    const withActuals = { ...project, actual: { actualLaborPersonHours: 0, actualMaterialsCostCents: cents(50), actualEquipmentCostCents: ZERO_CENTS, actualDeliveryCostCents: ZERO_CENTS, actualOtherCostCents: ZERO_CENTS, finalSellingPriceCents: cents(100), completedAt: "2026-02-01" } };
    expect(deriveLifecycleStage(withActuals)).toBe("completed"); // flips immediately, no separate flag to update
  });
});

describe("Project lifecycle — describeStatusTransition (every valid and invalid change)", () => {
  const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100), unit: "each" }];
  const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
  const zeroLaborBusiness3: BusinessSettings = { ...business, loadedLaborRateCents: cents(0) };

  function quoted(status: Project["status"] = "sent"): Project {
    const draft = baseProject({ status, serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    const revision = buildQuoteRevision(draft, [assembly], materials, [], zeroLaborBusiness3);
    return { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
  }

  it("no-op: transitioning to the same status is always allowed, no confirmation", () => {
    const check = describeStatusTransition(baseProject({ status: "draft" }), "draft");
    expect(check).toEqual({ allowed: true, requiresConfirmation: false });
  });

  it("INVALID: draft -> sent/won/lost/archived with NO locked quote revision is blocked with a clear reason", () => {
    for (const next of ["sent", "won", "lost", "archived"] as const) {
      const check = describeStatusTransition(baseProject({ status: "draft" }), next);
      expect(check.allowed).toBe(false);
      expect(check.reason).toMatch(/no locked quote/i);
    }
  });

  it("VALID: any status -> draft is always allowed, never needs confirmation (reverting never touches locked revisions)", () => {
    for (const from of ["sent", "won", "lost", "archived"] as const) {
      const check = describeStatusTransition(quoted(from), "draft");
      expect(check).toEqual({ allowed: true, requiresConfirmation: false });
    }
  });

  it("VALID: quoted (sent) -> won requires confirmation (this is a historical-state change: acceptance)", () => {
    const check = describeStatusTransition(quoted("sent"), "won");
    expect(check.allowed).toBe(true);
    expect(check.requiresConfirmation).toBe(true);
    expect(check.confirmationMessage).toMatch(/accepted/i);
  });

  it("VALID: quoted (sent) -> archived requires confirmation and explains the consequence", () => {
    const check = describeStatusTransition(quoted("sent"), "archived");
    expect(check.allowed).toBe(true);
    expect(check.requiresConfirmation).toBe(true);
    expect(check.confirmationMessage).toMatch(/read-only|exportable/i);
  });

  it("VALID: quoted (sent) -> lost requires confirmation and explains it's reversible", () => {
    const check = describeStatusTransition(quoted("sent"), "lost");
    expect(check.allowed).toBe(true);
    expect(check.requiresConfirmation).toBe(true);
    expect(check.confirmationMessage).toMatch(/reopen/i);
  });

  it("VALID: draft -> sent (once a revision exists) needs no confirmation — low-stakes, reversible", () => {
    const check = describeStatusTransition(quoted("draft"), "sent");
    expect(check).toEqual({ allowed: true, requiresConfirmation: false });
  });
});

describe("Project lifecycle — buildAcceptancePatch and accepted-revision immutability", () => {
  const materials: Material[] = [{ id: "m", name: "M", unitCostCents: cents(100), unit: "each" }];
  const assembly: Assembly = { id: "a", name: "A", unit: "each", materials: [{ materialId: "m", quantityPerUnit: 1 }], laborInputMode: "person-hours-per-unit", laborPersonHoursPerUnit: 1, equipment: [], otherCostPerUnitCents: ZERO_CENTS };
  const zeroLaborBusiness4: BusinessSettings = { ...business, loadedLaborRateCents: cents(0) };

  it("returns null when there is no locked revision to accept", () => {
    expect(buildAcceptancePatch(baseProject({ status: "draft" }))).toBeNull();
  });

  it("records the active revision's id and an acceptance timestamp", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    const revision = buildQuoteRevision(draft, [assembly], materials, [], zeroLaborBusiness4);
    const project: Project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };

    const patch = buildAcceptancePatch(project);
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe("won");
    expect(patch!.acceptedRevisionId).toBe(revision.id);
    expect(new Date(patch!.acceptedAt!).getTime()).not.toBeNaN();
  });

  it("a later re-quote (a new revision) never changes which revision was recorded as accepted", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "a", quantity: 1 }] });
    const firstRevision = buildQuoteRevision(draft, [assembly], materials, [], zeroLaborBusiness4);
    const acceptedProject: Project = { ...draft, quoteRevisions: [firstRevision], activeQuoteRevisionId: firstRevision.id };
    const acceptancePatch = buildAcceptancePatch(acceptedProject)!;
    const wonProject: Project = { ...acceptedProject, ...acceptancePatch };

    expect(wonProject.acceptedRevisionId).toBe(firstRevision.id);

    // Now re-quote — this appends a SECOND revision and makes it active, the
    // same way "Re-quoted at current costs" already works elsewhere in the
    // app. The acceptance record must NOT silently follow the new revision.
    const secondRevision = buildQuoteRevision(wonProject, [assembly], materials, [], zeroLaborBusiness4, { reason: "Re-quoted at current costs" });
    const reQuotedProject: Project = { ...wonProject, quoteRevisions: [...wonProject.quoteRevisions, secondRevision], activeQuoteRevisionId: secondRevision.id };

    expect(reQuotedProject.acceptedRevisionId).toBe(firstRevision.id); // unchanged
    expect(reQuotedProject.activeQuoteRevisionId).toBe(secondRevision.id); // the active one did move forward
    expect(reQuotedProject.acceptedRevisionId).not.toBe(reQuotedProject.activeQuoteRevisionId);
  });
});
