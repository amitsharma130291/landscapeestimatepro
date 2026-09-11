import { beforeEach, describe, expect, it } from "vitest";
import { createSampleWorkspace } from "./sampleData";
import { exportWorkspaceJson, loadWorkspace, migrateWorkspace, parseWorkspaceJson, saveWorkspace, type MigrationFieldError } from "./persistence";
import { getActiveRevision } from "./estimateMath";
import type { Workspace } from "./types";

const STORAGE_KEY = "landscapeEstimateProWorkspace:v1";
const BACKUP_KEY = "landscapeEstimateProWorkspace:preMigrationBackup";

const legacyV1Workspace = {
  version: 1,
  business: {
    loadedLaborRate: 30,
    overheadPercent: 12,
    targetMarginPercent: 30,
    defaultDeliveryCost: 100,
    minimumProjectPrice: 400,
    roundDisplayTo: "cent",
  },
  materials: [],
  equipment: [],
  assemblies: [],
  projects: [
    {
      id: "legacy-proj",
      name: "Old Job",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
      status: "won",
      serviceLines: [],
      equipmentLines: [],
      deliveryCost: 0,
      extraCosts: [],
      overheadPercent: 12,
      targetMarginPercent: 30,
      quotedPrice: 850,
    },
  ],
  templates: [],
};

const legacyV2Workspace = {
  version: 2,
  business: {
    loadedLaborRate: 32,
    overheadPercent: 15,
    targetMarginPercent: 35,
    defaultDeliveryCost: 150,
    minimumProjectPrice: 500,
    roundingIncrement: 1,
    taxRatePercent: 0,
  },
  materials: [],
  equipment: [],
  assemblies: [],
  projects: [
    {
      id: "v2-proj",
      name: "V2 Job",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
      status: "won",
      serviceLines: [],
      equipmentLines: [],
      deliveryCost: 0,
      extraCosts: [],
      overheadPercent: 15,
      targetMarginPercent: 35,
      taxRatePercent: 0,
      quoteSnapshot: {
        id: "snap-1",
        createdAt: "2025-06-01T00:00:00.000Z",
        schemaVersion: 2,
        roundingIncrement: 1,
        serviceLines: [],
        equipmentLines: [],
        deliveryCost: 0,
        extraCosts: [],
        loadedLaborRate: 32,
        overheadPercent: 15,
        targetMarginPercent: 35,
        taxRatePercent: 0,
        directCost: 300,
        overheadAmount: 45,
        trueCost: 345,
        exactRequiredSellingPrice: 530.77,
        displayPrice: 531,
        taxAmount: 0,
        customerTotal: 531,
        grossProfit: 186,
        achievedMargin: 35.03,
      },
    },
  ],
  templates: [],
};

/** A fully dollar-denominated v4 workspace (pre-cents-migration shape),
 * exercising every money field the v4->v5 step must convert — including a
 * material priced at $1.005 to prove the documented HALF-UP cent-rounding
 * rule (Decimal.js ROUND_HALF_UP), never a raw `Math.round(dollars * 100)`. */
const legacyV4Workspace = {
  version: 4,
  business: {
    loadedLaborRate: 32,
    laborRateBasis: "already-loaded",
    overheadPercent: 15,
    targetMarginPercent: 35,
    defaultDeliveryCost: 150,
    minimumProjectPrice: 500,
    roundingIncrement: 1,
    taxRatePercent: 0,
    representativeMinimumJobTrueCost: 200,
  },
  materials: [{ id: "m1", name: "Test Material", unitCost: 1.005, unit: "each" }],
  equipment: [{ id: "e1", name: "Test Equipment", rate: 45, rateType: "hour" }],
  assemblies: [
    {
      id: "a1",
      name: "Test Assembly",
      unit: "each",
      materials: [],
      laborInputMode: "person-hours-per-unit",
      laborPersonHoursPerUnit: 0.5,
      equipment: [],
      otherCostPerUnit: 2.5,
      currentRate: 10,
    },
  ],
  projects: [
    {
      id: "p1",
      name: "V4 Job",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
      status: "won",
      serviceLines: [],
      equipmentLines: [],
      deliveryCost: 25,
      extraCosts: [{ id: "ex1", label: "Fee", amount: 5 }],
      overheadPercent: 15,
      targetMarginPercent: 35,
      taxRatePercent: 0,
      quoteRevisions: [
        {
          id: "rev-v4",
          projectId: "p1",
          revisionNumber: 1,
          previousRevisionId: null,
          createdAt: "2025-06-01T00:00:00.000Z",
          calculationSchemaVersion: 3,
          roundingIncrement: 1,
          serviceLines: [
            {
              assemblyId: "a1",
              assemblyName: "Test Assembly",
              unit: "each",
              quantity: 4,
              taxable: true,
              materialCostPerUnit: 10,
              laborCostPerUnit: 16,
              laborPersonHoursPerUnit: 0.5,
              equipmentCostPerUnit: 0,
              otherCostPerUnit: 2.5,
            },
          ],
          equipmentLines: [{ equipmentId: "e1", equipmentName: "Test Equipment", quantity: 2, taxable: true, rate: 45, rateType: "hour" }],
          deliveryCost: 25,
          deliveryTaxable: true,
          extraCosts: [{ id: "ex1", label: "Fee", amount: 5 }],
          loadedLaborRate: 32,
          laborRateBasis: "already-loaded",
          overheadPercent: 15,
          targetMarginPercent: 35,
          taxRatePercent: 0,
          directCost: 200,
          overheadAmount: 30,
          trueCost: 230,
          exactRequiredPrice: 353.85,
          roundedRecommendedPrice: 354,
          actualQuotedPrice: 354,
          taxableSubtotal: 354,
          taxAmount: 0,
          customerTotal: 354,
          grossProfit: 124,
          achievedMargin: 35.03,
          historicalCostBasisStatus: "known",
          revenueAllocation: [{ key: "service:0", label: "Test Assembly", taxable: true, directCost: 200, allocatedSellingPrice: 354 }],
        },
      ],
      activeQuoteRevisionId: "rev-v4",
    },
  ],
  templates: [{ id: "t1", name: "Template One", serviceLines: [], equipmentLines: [], deliveryCost: 10, extraCosts: [] }],
};

/** Asserts a migration outcome is a structured failure and returns its
 * errors, so tests can inspect them without repeating the `ok` narrowing. */
function expectFailure(json: unknown): MigrationFieldError[] {
  const outcome = migrateWorkspace(json);
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("expected failure"); // narrows for TS
  return outcome.errors;
}

/** Asserts a migration outcome succeeded and returns the workspace. */
function expectSuccess(json: unknown): Workspace {
  const outcome = migrateWorkspace(json);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error(`expected success, got errors: ${JSON.stringify(outcome.errors)}`);
  return outcome.workspace;
}

describe("persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns a sample workspace when nothing is stored yet", () => {
    const result = loadWorkspace();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.workspace.version).toBe(5);
    expect(result.workspace.materials.length).toBeGreaterThan(0);
  });

  it("round-trips a saved workspace exactly", () => {
    const workspace = createSampleWorkspace();
    workspace.business.targetMarginPercent = 42;
    saveWorkspace(workspace);
    const loaded = loadWorkspace();
    expect(loaded.status).toBe("ok");
    if (loaded.status !== "ok") throw new Error("unreachable");
    expect(loaded.workspace.business.targetMarginPercent).toBe(42);
    expect(loaded.workspace.materials).toEqual(workspace.materials);
  });

  it("never throws on corrupted JSON, and never silently substitutes sample data for it — surfaces needs-correction/unparseable instead (DEF-04)", () => {
    const rawBlob = "{not valid json";
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    expect(() => loadWorkspace()).not.toThrow();
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.reason.kind).toBe("unparseable");
    expect(result.rawOriginal).toBe(rawBlob);
    // The raw stored bytes are completely untouched by the failed read.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBlob);
  });

  it("a shape-implausible blob (materials isn't even an array) surfaces as needs-correction, never silently replaced with sample data — a SHAPE problem is still real data at risk", () => {
    const rawBlob = JSON.stringify({ version: 1, business: {}, materials: "not an array" });
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.reason.kind).toBe("invalid-shape");
    expect(result.rawOriginal).toBe(rawBlob);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBlob); // untouched
  });

  it("a shape-plausible v1 record with an EMPTY business object surfaces as needs-correction, not a silent default — loadedLaborRate is required in every schema version", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, business: {}, materials: [], equipment: [], assemblies: [], projects: [], templates: [] }));
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.reason.kind).toBe("field-errors");
    if (result.reason.kind !== "field-errors") throw new Error("unreachable");
    expect(result.reason.errors.some((e) => e.field === "loadedLaborRate")).toBe(true);
  });

  it("rejects a schema version newer than this build understands, rather than guessing — surfaces as needs-correction, never a silent sample-data substitution", () => {
    const rawBlob = JSON.stringify({ ...createSampleWorkspace(), version: 99 });
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.reason.kind).toBe("invalid-shape");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBlob); // untouched
  });

  it("migrates a valid legacy (v1) record all the way to v5: roundDisplayTo -> roundingIncrementCents, and a bare quotedPrice -> a flagged legacy revision in cents", () => {
    const migrated = expectSuccess(legacyV1Workspace);
    expect(migrated.version).toBe(5);
    expect(migrated.business.roundingIncrementCents).toBe(1); // $0.01 -> 1 cent
    expect(migrated.business.taxRatePercent).toBe(0);
    const project = migrated.projects[0];
    expect(project.taxRatePercent).toBe(0);
    const revision = getActiveRevision(project);
    expect(revision).not.toBeNull();
    expect(revision!.actualQuotedPriceCents).toBe(85000); // $850.00 -> 85000 cents
    expect(revision!.isLegacyMigration).toBe(true);
    expect(revision!.historicalCostBasisStatus).toBe("unknown"); // nothing fabricated
    expect(revision!.revisionNumber).toBe(1);
    expect((project as unknown as { quotedPrice?: number }).quotedPrice).toBeUndefined();
  });

  it("migrates a legacy quoted-price-only record without fabricating a cost basis", () => {
    const migrated = expectSuccess(legacyV1Workspace);
    const revision = getActiveRevision(migrated.projects[0])!;
    expect(revision.serviceLines).toEqual([]); // never invented line items
    expect(revision.achievedMargin).toBeNull(); // never invented a margin from a fabricated cost
  });

  it("migrates a v2 record (single QuoteSnapshot) into revision 1 in cents, preserving its real captured figures", () => {
    const migrated = expectSuccess(legacyV2Workspace);
    expect(migrated.version).toBe(5);
    const project = migrated.projects[0];
    expect(project.quoteRevisions).toHaveLength(1);
    const revision = project.quoteRevisions[0];
    expect(revision.actualQuotedPriceCents).toBe(53100); // $531.00
    expect(revision.trueCostCents).toBe(34500); // $345.00 — real captured figure carried forward, not discarded
    expect(revision.directCostCents).toBe(30000); // $300.00
    expect(project.activeQuoteRevisionId).toBe(revision.id);
  });

  it("migrates v3 -> v4: an assembly with only a bare laborPersonHoursPerUnit gets laborInputMode = 'person-hours-per-unit', with the hours value UNCHANGED", () => {
    const v3WithLegacyAssembly = {
      ...legacyV2Workspace,
      version: 3,
      assemblies: [
        {
          id: "asm-legacy",
          name: "Legacy Service",
          unit: "yd3",
          materials: [],
          laborPersonHoursPerUnit: 0.4,
          equipment: [],
          otherCostPerUnit: 0,
        },
      ],
      projects: [],
    };
    const migrated = expectSuccess(v3WithLegacyAssembly);
    expect(migrated.version).toBe(5);
    expect(migrated.assemblies[0].laborInputMode).toBe("person-hours-per-unit");
    expect(migrated.assemblies[0].laborPersonHoursPerUnit).toBe(0.4); // exact, never recalculated
    expect(migrated.assemblies[0].otherCostPerUnitCents).toBe(0);
  });

  it("v3 -> v4 assembly migration is idempotent — an assembly that already has laborInputMode is left untouched by that step", () => {
    const v3WithModernAssembly = {
      ...legacyV2Workspace,
      version: 3,
      assemblies: [
        { id: "asm-modern", name: "Modern Service", unit: "yd3", materials: [], laborInputMode: "production-rate", laborProductionRate: 2.5, laborPersonHoursPerUnit: 0.4, equipment: [], otherCostPerUnit: 0 },
      ],
      projects: [],
    };
    const migrated = expectSuccess(v3WithModernAssembly);
    // The v4 step leaves it alone; the v5 step still converts its money field.
    expect(migrated.assemblies[0].laborInputMode).toBe("production-rate");
    expect(migrated.assemblies[0].laborProductionRate).toBe(2.5);
    expect(migrated.assemblies[0].otherCostPerUnitCents).toBe(0);
  });

  it("rejects a corrupt record (not an object) safely, falling back to a sample workspace rather than crashing", () => {
    expect(() => migrateWorkspace(null)).not.toThrow();
    const outcome = migrateWorkspace(null);
    expect(outcome.ok).toBe(true);
  });

  it("rejects an unsupported/malformed backup via parseWorkspaceJson rather than committing it", () => {
    const result = parseWorkspaceJson(JSON.stringify({ version: 1, business: {}, materials: "not an array" }));
    expect(result.ok).toBe(false);
  });

  it("migration is idempotent — migrating an already-current (v5) workspace is a no-op", () => {
    const workspace = createSampleWorkspace();
    const migratedOnce = expectSuccess(workspace);
    const migratedTwice = expectSuccess(migratedOnce);
    expect(migratedTwice).toEqual(migratedOnce);
  });

  it("migration is idempotent when run twice from the ORIGINAL legacy (v1) blob — proves migrating is safe to repeat, not just a passthrough on v5", () => {
    const firstRun = expectSuccess(legacyV1Workspace);
    const secondRun = expectSuccess(legacyV1Workspace);
    expect(secondRun).toEqual(firstRun);
    // And migrating the already-migrated result again changes nothing further
    // — byte-for-byte identical, satisfying "repeated migration produces
    // identical data."
    const thirdRun = expectSuccess(firstRun);
    expect(thirdRun).toEqual(firstRun);
  });

  it("migration is idempotent when run twice from the ORIGINAL v4 (dollar-denominated) blob — the money-conversion step specifically is safe to repeat", () => {
    const firstRun = expectSuccess(legacyV4Workspace);
    const secondRun = expectSuccess(legacyV4Workspace);
    expect(secondRun).toEqual(firstRun);
    const thirdRun = expectSuccess(firstRun);
    expect(thirdRun).toEqual(firstRun);
  });

  describe("v4 -> v5: every legacy dollar field converts to the correct integer cents", () => {
    const migrated = expectSuccess(legacyV4Workspace);

    it("bumps the schema version to 5", () => {
      expect(migrated.version).toBe(5);
    });

    it("converts Material.unitCost, including the $1.005 half-up rounding edge case", () => {
      expect(migrated.materials[0].unitCostCents).toBe(101); // $1.005 -> 100.5 cents -> half-up -> 101
    });

    it("converts Equipment.rate", () => {
      expect(migrated.equipment[0].rateCents).toBe(4500);
    });

    it("converts Assembly.otherCostPerUnit and Assembly.currentRate", () => {
      expect(migrated.assemblies[0].otherCostPerUnitCents).toBe(250);
      expect(migrated.assemblies[0].currentRateCents).toBe(1000);
    });

    it("converts every BusinessSettings money field and the dollar rounding increment to its cents equivalent", () => {
      expect(migrated.business.loadedLaborRateCents).toBe(3200);
      expect(migrated.business.defaultDeliveryCostCents).toBe(15000);
      expect(migrated.business.minimumProjectPriceCents).toBe(50000);
      expect(migrated.business.representativeMinimumJobTrueCostCents).toBe(20000);
      expect(migrated.business.roundingIncrementCents).toBe(100); // $1 -> 100 cents
    });

    it("converts Project.deliveryCost and ProjectExtraCost.amount", () => {
      const project = migrated.projects[0];
      expect(project.deliveryCostCents).toBe(2500);
      expect(project.extraCosts[0].amountCents).toBe(500);
    });

    it("converts ProjectTemplate.deliveryCost", () => {
      expect(migrated.templates[0].deliveryCostCents).toBe(1000);
    });

    it("gives every project an empty laborLines array by default (crew-duration is new — nothing to migrate)", () => {
      expect(migrated.projects[0].laborLines).toEqual([]);
    });

    it("converts every QuoteRevision money field, its per-line costs, its equipment-line rate, and its revenue allocation", () => {
      const revision = migrated.projects[0].quoteRevisions[0];
      expect(revision.deliveryCostCents).toBe(2500);
      expect(revision.loadedLaborRateCents).toBe(3200);
      expect(revision.directCostCents).toBe(20000);
      expect(revision.overheadAmountCents).toBe(3000);
      expect(revision.trueCostCents).toBe(23000);
      expect(revision.exactRequiredPriceCents).toBe(35385);
      expect(revision.roundedRecommendedPriceCents).toBe(35400);
      expect(revision.actualQuotedPriceCents).toBe(35400);
      expect(revision.taxableSubtotalCents).toBe(35400);
      expect(revision.taxAmountCents).toBe(0);
      expect(revision.customerTotalCents).toBe(35400);
      expect(revision.grossProfitCents).toBe(12400);
      expect(revision.roundingIncrementCents).toBe(100);
      expect(revision.laborLines).toEqual([]);

      const [serviceLine] = revision.serviceLines;
      expect(serviceLine.materialCostPerUnitCents).toBe(1000);
      expect(serviceLine.laborCostPerUnitCents).toBe(1600);
      expect(serviceLine.equipmentCostPerUnitCents).toBe(0);
      expect(serviceLine.otherCostPerUnitCents).toBe(250);

      const [equipmentLine] = revision.equipmentLines;
      expect(equipmentLine.rateCents).toBe(4500);

      const [allocation] = revision.revenueAllocation;
      expect(allocation.directCostCents).toBe(20000);
      expect(allocation.allocatedSellingPriceCents).toBe(35400);
    });

    it("no field on the migrated workspace is a non-integer floating-point number where a MoneyCents integer is expected", () => {
      const revision = migrated.projects[0].quoteRevisions[0];
      const centsValues = [
        migrated.materials[0].unitCostCents,
        migrated.equipment[0].rateCents,
        migrated.assemblies[0].otherCostPerUnitCents,
        migrated.assemblies[0].currentRateCents,
        migrated.business.loadedLaborRateCents,
        migrated.projects[0].deliveryCostCents,
        revision.directCostCents,
        revision.trueCostCents,
        revision.actualQuotedPriceCents,
      ];
      for (const value of centsValues) {
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });

  it("safely handles a partially-migrated record — a project already on the revision-based shape (has quoteRevisions) is left as-is by the v1->v3 step, then still gets its money fields converted by v5", () => {
    const partiallyMigrated = {
      ...legacyV1Workspace,
      version: 1,
      projects: [
        {
          id: "partial-proj",
          name: "Partial",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-06-01T00:00:00.000Z",
          status: "won",
          serviceLines: [],
          equipmentLines: [],
          deliveryCost: 12,
          extraCosts: [],
          overheadPercent: 12,
          targetMarginPercent: 30,
          taxRatePercent: 0,
          // Already has quoteRevisions (as if a prior migration ran partway) —
          // migrateProject's idempotency check must recognize this and skip
          // re-deriving a legacy revision from a (now-absent) quotedPrice.
          quoteRevisions: [],
        },
      ],
    };
    expect(() => migrateWorkspace(partiallyMigrated)).not.toThrow();
    const migrated = expectSuccess(partiallyMigrated);
    expect(migrated.version).toBe(5);
    expect(migrated.projects[0].deliveryCostCents).toBe(1200);
  });

  // -- Item 1: malformed money must NEVER become zero, and migration is atomic --

  describe("REGRESSION: a malformed (present but non-numeric) monetary field is reported and blocks migration — it is never replaced by zero or any other invented number", () => {
    it("a malformed v1 quoted price fails migration, rather than silently becoming an un-quoted draft (data loss) or $0", () => {
      const withBadQuotedPrice = {
        ...legacyV1Workspace,
        projects: [{ ...legacyV1Workspace.projects[0], quotedPrice: "eight-fifty" }],
      };
      const errors = expectFailure(withBadQuotedPrice);
      expect(errors).toContainEqual(
        expect.objectContaining({ recordId: "legacy-proj", field: "quotedPrice", originalValue: "eight-fifty", sourceSchemaVersion: 1, targetSchemaVersion: 3 })
      );
    });

    it("a malformed v4 material cost fails migration — the material's unitCostCents is never silently set to 0", () => {
      const withBadMaterial = {
        ...legacyV4Workspace,
        materials: [{ id: "m1", name: "Bad Material", unitCost: "not a number", unit: "each" }],
      };
      const errors = expectFailure(withBadMaterial);
      expect(errors).toContainEqual(expect.objectContaining({ recordId: "m1", field: "unitCost", originalValue: "not a number", sourceSchemaVersion: 4, targetSchemaVersion: 5 }));
    });

    it("a malformed v4 loaded labor rate fails migration — never silently becomes $0/hr", () => {
      const withBadLaborRate = {
        ...legacyV4Workspace,
        business: { ...legacyV4Workspace.business, loadedLaborRate: NaN },
      };
      const errors = expectFailure(withBadLaborRate);
      expect(errors).toContainEqual(expect.objectContaining({ recordId: "business", field: "loadedLaborRate", sourceSchemaVersion: 4, targetSchemaVersion: 5 }));
    });

    it("a malformed v1 business loaded labor rate ALSO fails migration — the same rule applies at every schema layer, not only v4", () => {
      const withBadLaborRate = {
        ...legacyV1Workspace,
        business: { ...legacyV1Workspace.business, loadedLaborRate: "thirty" },
      };
      const errors = expectFailure(withBadLaborRate);
      expect(errors).toContainEqual(expect.objectContaining({ recordId: "business", field: "loadedLaborRate", originalValue: "thirty", sourceSchemaVersion: 1, targetSchemaVersion: 3 }));
    });

    it("a malformed actual cost on a completed job fails migration — never silently becomes $0 spent", () => {
      const withBadActuals = {
        ...legacyV4Workspace,
        projects: [
          {
            ...legacyV4Workspace.projects[0],
            actual: {
              actualLaborPersonHours: 3,
              actualMaterialsCost: Infinity,
              actualEquipmentCost: 0,
              actualDeliveryCost: 0,
              actualOtherCost: 0,
              finalSellingPrice: 354,
              completedAt: "2025-07-01",
            },
          },
        ],
      };
      const errors = expectFailure(withBadActuals);
      expect(errors).toContainEqual(expect.objectContaining({ field: "actualMaterialsCost", originalValue: Infinity, sourceSchemaVersion: 4, targetSchemaVersion: 5 }));
    });

    it("a malformed quote-revision trueCost fails migration — never silently becomes $0 of true cost", () => {
      const bad = structuredClone(legacyV4Workspace);
      (bad.projects[0].quoteRevisions[0] as unknown as Record<string, unknown>).trueCost = "$230";
      const errors = expectFailure(bad);
      expect(errors).toContainEqual(expect.objectContaining({ field: "trueCost", originalValue: "$230", sourceSchemaVersion: 4, targetSchemaVersion: 5 }));
    });

    it("an undefined REQUIRED money field is treated the same as malformed — never a legitimate blank state", () => {
      const withMissingRate = { ...legacyV4Workspace, equipment: [{ id: "e1", name: "Test Equipment", rateType: "hour" }] };
      const errors = expectFailure(withMissingRate);
      expect(errors).toContainEqual(expect.objectContaining({ recordId: "e1", field: "rate", originalValue: undefined, sourceSchemaVersion: 4, targetSchemaVersion: 5 }));
    });

    it("a genuinely OPTIONAL money field left blank is NOT an error, and does not become zero — it stays absent", () => {
      const withoutCurrentRate = structuredClone(legacyV4Workspace);
      delete (withoutCurrentRate.assemblies[0] as unknown as Record<string, unknown>).currentRate;
      const migrated = expectSuccess(withoutCurrentRate);
      expect(migrated.assemblies[0].currentRateCents).toBeUndefined();
    });

    it("a malformed (present but non-numeric) OPTIONAL money field IS still an error — optional excuses blank, never garbage", () => {
      const withBadCurrentRate = { ...legacyV4Workspace, assemblies: [{ ...legacyV4Workspace.assemblies[0], currentRate: "ten dollars" }] };
      const errors = expectFailure(withBadCurrentRate);
      expect(errors).toContainEqual(expect.objectContaining({ recordId: "a1", field: "currentRate", originalValue: "ten dollars" }));
    });

    it("every reported error carries the exact structured shape: record id, field, original (untouched) value, and both schema versions", () => {
      const withBadMaterial = { ...legacyV4Workspace, materials: [{ id: "mat-x", name: "Bad", unitCost: NaN, unit: "each" }] };
      const errors = expectFailure(withBadMaterial);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({ recordId: "mat-x", field: "unitCost", originalValue: NaN, sourceSchemaVersion: 4, targetSchemaVersion: 5 });
    });

    it("collects errors for MULTIPLE malformed fields across different records in one pass, rather than stopping at the first", () => {
      const withMultipleBadFields = {
        ...legacyV4Workspace,
        materials: [{ id: "m1", name: "Bad Material", unitCost: "abc", unit: "each" }],
        equipment: [{ id: "e1", name: "Bad Equipment", rate: Infinity, rateType: "hour" }],
      };
      const errors = expectFailure(withMultipleBadFields);
      expect(errors.some((e) => e.recordId === "m1" && e.field === "unitCost")).toBe(true);
      expect(errors.some((e) => e.recordId === "e1" && e.field === "rate")).toBe(true);
    });
  });

  describe("REGRESSION: atomic migration — no workspace is EVER partially committed, and the original stays fully recoverable", () => {
    it("a single malformed field anywhere blocks the ENTIRE workspace migration — no other, otherwise-valid records are silently migrated and saved", () => {
      const mixed = {
        ...legacyV4Workspace,
        materials: [
          { id: "good-material", name: "Good", unitCost: 10, unit: "each" },
          { id: "bad-material", name: "Bad", unitCost: "garbage", unit: "each" },
        ],
      };
      const outcome = migrateWorkspace(mixed);
      expect(outcome.ok).toBe(false);
      // Critically: this is not a "Workspace" at all on failure — there is no
      // partial result containing the good material and omitting the bad one.
      expect((outcome as { workspace?: unknown }).workspace).toBeUndefined();
    });

    it("loadWorkspace() reports needs-correction and does NOT overwrite the original stored blob when migration fails", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] }));
      const before = window.localStorage.getItem(STORAGE_KEY);
      const result = loadWorkspace();
      expect(result.status).toBe("needs-correction");
      const after = window.localStorage.getItem(STORAGE_KEY);
      // The original, unmigrated blob is untouched — byte-for-byte.
      expect(after).toBe(before);
    });

    it("loadWorkspace() surfaces the exact field errors so the record can be identified and corrected", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] }));
      const result = loadWorkspace();
      expect(result.status).toBe("needs-correction");
      if (result.status !== "needs-correction") throw new Error("unreachable");
      expect(result.reason.kind).toBe("field-errors");
      if (result.reason.kind !== "field-errors") throw new Error("unreachable");
      expect(result.reason.errors).toContainEqual(expect.objectContaining({ recordId: "m1", field: "unitCost" }));
    });

    it("saveWorkspace is never called with a failed migration's output — there is nothing to save on failure (workspace is absent from the outcome type)", () => {
      const outcome = migrateWorkspace({ ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: NaN, unit: "each" }] });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error("unreachable");
      // ok:false carries only `errors` — there is no `workspace` field to
      // accidentally persist, by construction of the MigrationOutcome type.
      expect("workspace" in outcome).toBe(false);
    });

    it("loadWorkspace()'s rawOriginal is the EXACT stored string, byte-for-byte — a 'download original workspace' action must hand back precisely what was there, never a re-serialized stand-in", () => {
      const badWorkspaceJson = JSON.stringify({ ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] }, null, 2); // pretty-printed, with specific whitespace
      window.localStorage.setItem(STORAGE_KEY, badWorkspaceJson);
      const result = loadWorkspace();
      expect(result.status).toBe("needs-correction");
      if (result.status !== "needs-correction") throw new Error("unreachable");
      expect(result.rawOriginal).toBe(badWorkspaceJson); // exact string equality, not a semantic/parsed comparison
      expect(result.rawOriginal).toBe(window.localStorage.getItem(STORAGE_KEY));
    });

    it("REGRESSION: retrying migration (calling loadWorkspace() again) after ANOTHER failure never modifies the original storage — repeated failed attempts are all equally non-destructive", () => {
      const badWorkspaceJson = JSON.stringify({ ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] });
      window.localStorage.setItem(STORAGE_KEY, badWorkspaceJson);
      const firstAttempt = loadWorkspace();
      const afterFirst = window.localStorage.getItem(STORAGE_KEY);
      // Simulate a "Retry migration" click without the user having actually
      // fixed anything — the data is still bad.
      const secondAttempt = loadWorkspace();
      const afterSecond = window.localStorage.getItem(STORAGE_KEY);

      expect(firstAttempt.status).toBe("needs-correction");
      expect(secondAttempt.status).toBe("needs-correction");
      expect(afterFirst).toBe(badWorkspaceJson);
      expect(afterSecond).toBe(badWorkspaceJson); // still untouched after the second failed attempt
      if (firstAttempt.status !== "needs-correction" || secondAttempt.status !== "needs-correction") throw new Error("unreachable");
      expect(secondAttempt.reason).toEqual(firstAttempt.reason); // consistent, not degrading or duplicating
    });

    it("REGRESSION: retrying migration AFTER the underlying data is fixed succeeds and produces a fully valid workspace — proving retry actually re-reads storage rather than replaying a cached failure", () => {
      const badWorkspaceJson = JSON.stringify({ ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] });
      window.localStorage.setItem(STORAGE_KEY, badWorkspaceJson);
      const failedAttempt = loadWorkspace();
      expect(failedAttempt.status).toBe("needs-correction");

      // Simulate the user hand-correcting the field via devtools, then
      // clicking "Retry migration" (which re-reads storage from scratch).
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyV4Workspace));
      const retryResult = loadWorkspace();
      expect(retryResult.status).toBe("ok");
      if (retryResult.status !== "ok") throw new Error("unreachable");
      expect(retryResult.workspace.materials[0].unitCostCents).toBe(101);
    });

    it("a successful restore-from-backup (parseWorkspaceJson) replaces data ONLY after the backup fully validates — a valid backup round-trips exactly", () => {
      const validBackup = createSampleWorkspace();
      const json = exportWorkspaceJson(validBackup);
      const result = parseWorkspaceJson(json);
      expect(result.ok).toBe(true);
      expect(result.workspace).toEqual(validBackup);
    });

    it("a restore-from-backup attempt with a malformed money field changes NOTHING — parseWorkspaceJson returns ok:false with no workspace to accidentally apply", () => {
      const invalidBackup = { ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] };
      const result = parseWorkspaceJson(JSON.stringify(invalidBackup));
      expect(result.ok).toBe(false);
      expect(result.workspace).toBeUndefined();
      expect(result.fieldErrors?.length).toBeGreaterThan(0);
    });
  });

  it("a malformed money field during migration is reported and safely blocks migration rather than throwing or overwriting the rest of the record", () => {
    const withBadMoney = {
      ...legacyV4Workspace,
      materials: [{ id: "m1", name: "Bad Material", unitCost: "not a number", unit: "each" }],
    };
    expect(() => migrateWorkspace(withBadMoney)).not.toThrow();
    const errors = expectFailure(withBadMoney);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("export -> parseWorkspaceJson round-trips a valid backup, preserving every cent exactly", () => {
    const workspace = createSampleWorkspace();
    const json = exportWorkspaceJson(workspace);
    const result = parseWorkspaceJson(json);
    expect(result.ok).toBe(true);
    expect(result.workspace?.materials.length).toBe(workspace.materials.length);
    expect(result.workspace?.materials).toEqual(workspace.materials);
    expect(result.workspace?.business.loadedLaborRateCents).toBe(workspace.business.loadedLaborRateCents);
  });

  it("a legacy backup file imported via parseWorkspaceJson comes back fully migrated to cents", () => {
    const result = parseWorkspaceJson(JSON.stringify(legacyV1Workspace));
    expect(result.ok).toBe(true);
    expect(result.workspace?.version).toBe(5);
    expect(getActiveRevision(result.workspace!.projects[0])?.actualQuotedPriceCents).toBe(85000);
  });

  it("a v4 (dollar-denominated) backup file imported via parseWorkspaceJson comes back fully migrated to cents", () => {
    const result = parseWorkspaceJson(JSON.stringify(legacyV4Workspace));
    expect(result.ok).toBe(true);
    expect(result.workspace?.version).toBe(5);
    expect(result.workspace?.materials[0].unitCostCents).toBe(101);
    expect(getActiveRevision(result.workspace!.projects[0])?.actualQuotedPriceCents).toBe(35400);
  });

  it("a backup file with a malformed money field is rejected by parseWorkspaceJson with field-level errors, and nothing is imported", () => {
    const badBackup = { ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] };
    const result = parseWorkspaceJson(JSON.stringify(badBackup));
    expect(result.ok).toBe(false);
    expect(result.workspace).toBeUndefined();
    expect(result.fieldErrors).toContainEqual(expect.objectContaining({ recordId: "m1", field: "unitCost" }));
  });

  it("rejects a backup file that isn't valid JSON", () => {
    const result = parseWorkspaceJson("not json at all");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a JSON file that isn't a plausible workspace", () => {
    const result = parseWorkspaceJson(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
  });

  it("stashes a recoverable pre-migration backup in localStorage when an actual (successful) migration occurs", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyV1Workspace));
    loadWorkspace();
    const backup = window.localStorage.getItem(BACKUP_KEY);
    expect(backup).not.toBeNull();
    expect(JSON.parse(backup!).version).toBe(1);
  });

  it("also stashes a backup copy when migration FAILS, for inspection — without ever touching the original STORAGE_KEY blob", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...legacyV4Workspace, materials: [{ id: "m1", name: "Bad", unitCost: "abc", unit: "each" }] }));
    loadWorkspace();
    const backup = window.localStorage.getItem(BACKUP_KEY);
    expect(backup).not.toBeNull();
    expect(JSON.parse(backup!).materials[0].unitCost).toBe("abc");
  });

  it("does NOT overwrite the backup key when loading data that's already current (nothing to migrate)", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createSampleWorkspace()));
    loadWorkspace();
    expect(window.localStorage.getItem(BACKUP_KEY)).toBeNull();
  });

  it("round-trips a Workspace type-check: the sample workspace satisfies the current Workspace shape end to end", () => {
    const workspace: Workspace = createSampleWorkspace();
    expect(workspace.version).toBe(5);
  });

  // -- Item 3: percentage representation is unambiguous through migration too --

  describe("percent fields (targetMarginPercent, overheadPercent, taxRatePercent) migrate as the SAME whole number at every schema step — never divided or multiplied by 100 anywhere in the pipeline", () => {
    it("a v1 business's 30% overhead / 30% target margin survive to v5 as 30, not 0.3 or 3000", () => {
      const migrated = expectSuccess(legacyV1Workspace);
      expect(migrated.business.overheadPercent).toBe(12); // legacyV1Workspace's actual value
      expect(migrated.business.targetMarginPercent).toBe(30);
    });

    it("a v4 business's 35% target margin and 15% overhead survive to v5 unchanged, and a v4 quote revision's frozen 35%/15%/0% also survive unchanged", () => {
      const migrated = expectSuccess(legacyV4Workspace);
      expect(migrated.business.overheadPercent).toBe(15);
      expect(migrated.business.targetMarginPercent).toBe(35);
      const revision = migrated.projects[0].quoteRevisions[0];
      expect(revision.overheadPercent).toBe(15);
      expect(revision.targetMarginPercent).toBe(35);
      expect(revision.taxRatePercent).toBe(0);
    });

    it("REGRESSION: a percent field is never conflated with a decimal fraction across migration — 35 stored as targetMarginPercent must never come back as 0.35, and must never be inflated to 3500", () => {
      const migrated = expectSuccess(legacyV4Workspace);
      expect(migrated.business.targetMarginPercent).not.toBeCloseTo(0.35, 5);
      expect(migrated.business.targetMarginPercent).not.toBe(3500);
      expect(migrated.business.targetMarginPercent).toBe(35);
    });
  });
});
