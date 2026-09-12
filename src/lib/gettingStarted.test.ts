import { describe, expect, it } from "vitest";
import { deriveGettingStartedProgress } from "./gettingStarted";
import { createSampleWorkspace, SAMPLE_EQUIPMENT, SAMPLE_MATERIALS } from "./sampleData";
import { DEFAULT_BUSINESS_SETTINGS, type Assembly, type Equipment, type Material, type Project, type Workspace } from "./types";
import type { MoneyCents } from "./money";

function emptyWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    version: 5,
    business: { ...DEFAULT_BUSINESS_SETTINGS },
    materials: [],
    equipment: [],
    assemblies: [],
    projects: [],
    templates: [],
    ...overrides,
  };
}

const REAL_MATERIAL: Material = { id: "user-mat-1", name: "Mulch", unitCostCents: 4000 as MoneyCents, unit: "yd3" };
const REAL_EQUIPMENT: Equipment = { id: "user-eq-1", name: "Mower", rateCents: 5000 as MoneyCents, rateType: "hour" };
const REAL_ASSEMBLY: Assembly = {
  id: "user-asm-1",
  name: "Mulch install",
  unit: "yd3",
  materials: [{ materialId: "user-mat-1", quantityPerUnit: 1 }],
  laborInputMode: "person-hours-per-unit",
  laborPersonHoursPerUnit: 0.4,
  equipment: [],
  otherCostPerUnitCents: 0 as MoneyCents,
};

function readyProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    name: "Smith backyard",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "draft",
    serviceLines: [],
    equipmentLines: [],
    laborLines: [],
    // Non-zero so a bare fixture project isn't itself blocked by
    // getQuoteBlockingErrors' "add at least one cost line" rule — tests that
    // want a genuinely blocked project override a DIFFERENT field instead.
    deliveryCostCents: 5000 as MoneyCents,
    extraCosts: [],
    overheadPercent: 15,
    targetMarginPercent: 35,
    taxRatePercent: 0,
    quoteRevisions: [],
    ...overrides,
  };
}

const FULLY_SET_UP_BUSINESS = {
  ...DEFAULT_BUSINESS_SETTINGS,
  businessName: "Evergreen Lawns",
  loadedLaborRateCents: 4500 as MoneyCents,
  overheadPercent: 18,
  targetMarginPercent: 30,
  minimumProjectPriceCents: 60000 as MoneyCents,
};

describe("deriveGettingStartedProgress", () => {
  it("1. a fresh, empty workspace has 0 of 5 steps complete", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace());
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(5);
    expect(progress.steps.every((s) => s.status === "not-started")).toBe(true);
  });

  it("2. an untouched sample workspace does not falsely report any step complete", () => {
    const progress = deriveGettingStartedProgress(createSampleWorkspace());
    // The sample workspace ships with materials, equipment, and assemblies —
    // this is the exact defect the selector must avoid: none of that seeded
    // content may count as the contractor having done anything.
    expect(progress.completed).toBe(0);
    expect(progress.steps.find((s) => s.id === "add-costs")!.status).toBe("not-started");
    expect(progress.steps.find((s) => s.id === "build-service")!.status).toBe("not-started");
  });

  it("3. a fully and validly set-up business completes step 1", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace({ business: FULLY_SET_UP_BUSINESS }));
    expect(progress.steps.find((s) => s.id === "business-setup")!.status).toBe("complete");
  });

  it("4a. an out-of-range target margin prevents step 1 completion even though it differs from the default", () => {
    const workspace = emptyWorkspace({ business: { ...FULLY_SET_UP_BUSINESS, targetMarginPercent: 150 } });
    expect(deriveGettingStartedProgress(workspace).steps.find((s) => s.id === "business-setup")!.status).not.toBe("complete");
  });

  it("4b. a negative loaded labor rate prevents step 1 completion even though it differs from the default", () => {
    const workspace = emptyWorkspace({ business: { ...FULLY_SET_UP_BUSINESS, loadedLaborRateCents: -100 as MoneyCents } });
    expect(deriveGettingStartedProgress(workspace).steps.find((s) => s.id === "business-setup")!.status).not.toBe("complete");
  });

  it("business setup is 'in-progress' once started but not every required field is set", () => {
    const workspace = emptyWorkspace({ business: { ...DEFAULT_BUSINESS_SETTINGS, businessName: "Evergreen Lawns" } });
    expect(deriveGettingStartedProgress(workspace).steps.find((s) => s.id === "business-setup")!.status).toBe("in-progress");
  });

  it("5. a single valid, non-sample material completes the catalog step", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace({ materials: [REAL_MATERIAL] }));
    expect(progress.steps.find((s) => s.id === "add-costs")!.status).toBe("complete");
  });

  it("6. a single valid, non-sample equipment item completes the catalog step", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace({ equipment: [REAL_EQUIPMENT] }));
    expect(progress.steps.find((s) => s.id === "add-costs")!.status).toBe("complete");
  });

  it("7. an incomplete catalog draft (blank name / zero-ish invalid cost) does not count", () => {
    const draftMaterial: Material = { id: "user-mat-2", name: "", unitCostCents: 0 as MoneyCents, unit: "each" };
    const progress = deriveGettingStartedProgress(emptyWorkspace({ materials: [draftMaterial] }));
    expect(progress.steps.find((s) => s.id === "add-costs")!.status).toBe("not-started");
  });

  it("an edited SAMPLE material (same id, changed cost) counts as real customization", () => {
    const editedSampleMaterial: Material = { ...SAMPLE_MATERIALS[0], unitCostCents: (SAMPLE_MATERIALS[0].unitCostCents + 500) as MoneyCents };
    const progress = deriveGettingStartedProgress(
      emptyWorkspace({ materials: [editedSampleMaterial, ...SAMPLE_MATERIALS.slice(1)], equipment: SAMPLE_EQUIPMENT })
    );
    expect(progress.steps.find((s) => s.id === "add-costs")!.status).toBe("complete");
  });

  it("8. a valid, non-sample assembly completes the service step", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace({ materials: [REAL_MATERIAL], assemblies: [REAL_ASSEMBLY] }));
    expect(progress.steps.find((s) => s.id === "build-service")!.status).toBe("complete");
  });

  it("9a. an assembly with an invalid field (blank name) does not count", () => {
    const invalidAssembly: Assembly = { ...REAL_ASSEMBLY, name: "" };
    const progress = deriveGettingStartedProgress(emptyWorkspace({ materials: [REAL_MATERIAL], assemblies: [invalidAssembly] }));
    expect(progress.steps.find((s) => s.id === "build-service")!.status).toBe("not-started");
  });

  it("9b. an assembly referencing a material that no longer exists in the catalog does not count", () => {
    const brokenAssembly: Assembly = { ...REAL_ASSEMBLY, materials: [{ materialId: "does-not-exist", quantityPerUnit: 1 }] };
    const progress = deriveGettingStartedProgress(emptyWorkspace({ assemblies: [brokenAssembly] })); // catalog is empty
    expect(progress.steps.find((s) => s.id === "build-service")!.status).toBe("not-started");
  });

  it("10. a saved project that still has blocking calculation errors produces 'in-progress', not 'complete'", () => {
    const blockedProject = readyProject({ targetMarginPercent: 150 }); // >=100% is a blocking error
    const progress = deriveGettingStartedProgress(emptyWorkspace({ projects: [blockedProject] }));
    expect(progress.steps.find((s) => s.id === "first-estimate")!.status).toBe("in-progress");
  });

  it("11. a saved project with no blocking errors completes the estimate step", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace({ projects: [readyProject()] }));
    expect(progress.steps.find((s) => s.id === "first-estimate")!.status).toBe("complete");
  });

  it("12. a project with blocking errors alone never reports the estimate step complete", () => {
    const blockedProject = readyProject({ overheadPercent: -5 });
    const progress = deriveGettingStartedProgress(emptyWorkspace({ projects: [blockedProject] }));
    expect(progress.steps.find((s) => s.id === "first-estimate")!.status).not.toBe("complete");
  });

  it("13. a project with saved actuals completes the compare-actuals step", () => {
    const wonProject = readyProject({
      status: "won",
      actual: {
        actualLaborPersonHours: 4,
        actualMaterialsCostCents: 10000 as MoneyCents,
        actualEquipmentCostCents: 0 as MoneyCents,
        actualDeliveryCostCents: 0 as MoneyCents,
        actualOtherCostCents: 0 as MoneyCents,
        finalSellingPriceCents: 20000 as MoneyCents,
        completedAt: new Date().toISOString(),
      },
    });
    const progress = deriveGettingStartedProgress(emptyWorkspace({ projects: [wonProject] }));
    expect(progress.steps.find((s) => s.id === "compare-actuals")!.status).toBe("complete");
  });

  it("compare-actuals is never required before the other steps — a fresh workspace doesn't block on it", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace());
    expect(progress.steps.find((s) => s.id === "compare-actuals")!.status).toBe("not-started");
    expect(progress.nextStepId).toBe("business-setup"); // not compare-actuals — it's last, not first
  });

  it("14. deleting the qualifying material reverses the catalog step back to not-started", () => {
    const withMaterial = deriveGettingStartedProgress(emptyWorkspace({ materials: [REAL_MATERIAL] }));
    expect(withMaterial.steps.find((s) => s.id === "add-costs")!.status).toBe("complete");
    const afterDelete = deriveGettingStartedProgress(emptyWorkspace({ materials: [] }));
    expect(afterDelete.steps.find((s) => s.id === "add-costs")!.status).toBe("not-started");
  });

  it("15. progress reflects each new snapshot of the workspace independently", () => {
    const before = deriveGettingStartedProgress(emptyWorkspace());
    const after = deriveGettingStartedProgress(emptyWorkspace({ materials: [REAL_MATERIAL], equipment: [REAL_EQUIPMENT] }));
    expect(before.completed).toBe(0);
    expect(after.completed).toBe(1);
  });

  it("16. nextStepId selects the first incomplete step in declared order", () => {
    const workspace = emptyWorkspace({ business: FULLY_SET_UP_BUSINESS, materials: [REAL_MATERIAL] });
    const progress = deriveGettingStartedProgress(workspace);
    expect(progress.steps.find((s) => s.id === "business-setup")!.status).toBe("complete");
    expect(progress.steps.find((s) => s.id === "add-costs")!.status).toBe("complete");
    expect(progress.nextStepId).toBe("build-service");
  });

  it("17. a workspace with all five steps satisfied reports the finished state", () => {
    const wonProject = readyProject({
      status: "won",
      actual: {
        actualLaborPersonHours: 4,
        actualMaterialsCostCents: 10000 as MoneyCents,
        actualEquipmentCostCents: 0 as MoneyCents,
        actualDeliveryCostCents: 0 as MoneyCents,
        actualOtherCostCents: 0 as MoneyCents,
        finalSellingPriceCents: 20000 as MoneyCents,
        completedAt: new Date().toISOString(),
      },
    });
    const workspace = emptyWorkspace({
      business: FULLY_SET_UP_BUSINESS,
      materials: [REAL_MATERIAL],
      assemblies: [REAL_ASSEMBLY],
      projects: [wonProject],
    });
    const progress = deriveGettingStartedProgress(workspace);
    expect(progress.completed).toBe(5);
    expect(progress.nextStepId).toBeNull();
    expect(progress.steps.every((s) => s.status === "complete")).toBe(true);
  });

  it("never mutates the workspace it's given", () => {
    const workspace = createSampleWorkspace();
    const snapshot = JSON.parse(JSON.stringify(workspace));
    deriveGettingStartedProgress(workspace);
    expect(workspace).toEqual(snapshot);
  });

  it("every step links to its real destination route", () => {
    const progress = deriveGettingStartedProgress(emptyWorkspace());
    expect(progress.steps.find((s) => s.id === "business-setup")!.href).toBe("/app/settings/");
    expect(progress.steps.find((s) => s.id === "add-costs")!.href).toBe("/app/catalog/");
    expect(progress.steps.find((s) => s.id === "build-service")!.href).toBe("/app/templates/");
    expect(progress.steps.find((s) => s.id === "first-estimate")!.href).toBe("/app/estimates/");
    expect(progress.steps.find((s) => s.id === "compare-actuals")!.href).toBe("/app/actuals/");
  });
});
