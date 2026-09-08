import { describe, expect, it } from "vitest";
import {
  buildProjectCsvRows,
  calculateAssemblyCost,
  calculateAssemblyVariance,
  calculateProfitabilitySummary,
  evaluateActualVsEstimate,
  evaluateMinimumJob,
  evaluateProject,
  evaluateRateHealth,
  snapshotCostImpact,
} from "./estimateMath";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { Assembly, Equipment, Material, Project, ProjectTemplate } from "./types";

const materials: Material[] = [
  { id: "mulch", name: "Mulch", unitCost: 42, unit: "yd3" },
  { id: "shrub", name: "Shrub", unitCost: 28, unit: "each" },
];

const equipment: Equipment[] = [{ id: "skidsteer", name: "Skid Steer", rate: 45, rateType: "hour" }];

describe("calculateAssemblyCost — shrub installation", () => {
  const assembly: Assembly = {
    id: "shrub-install",
    name: "Shrub Installation",
    unit: "each",
    materials: [{ materialId: "shrub", quantityPerUnit: 1 }],
    laborPersonHoursPerUnit: 0.45,
    equipment: [],
    otherCostPerUnit: 0,
  };

  it("computes the reference $48-ish true cost per unit from materials + labor", () => {
    const result = calculateAssemblyCost(assembly, materials, equipment, 32);
    expect(result.materialCostPerUnit).toBe(28);
    expect(result.laborCostPerUnit).toBeCloseTo(14.4, 10); // 0.45 * 32
    expect(result.trueCostPerUnit).toBeCloseTo(42.4, 10);
  });

  it("ignores an equipment line that references an unknown id rather than throwing", () => {
    const withBadEquipment: Assembly = {
      ...assembly,
      equipment: [{ equipmentId: "does-not-exist", quantityPerUnit: 1 }],
    };
    expect(() => calculateAssemblyCost(withBadEquipment, materials, equipment, 32)).not.toThrow();
  });
});

describe("evaluateRateHealth — shrub installation reference example", () => {
  // Current rate $67.50, true cost $48.00, target margin 35% → required $73.85, gap $6.35, "attention".
  it("computes a $73.85 required rate and a $6.35 gap", () => {
    const result = evaluateRateHealth(48, 67.5, 35);
    expect(result.requiredRate).toBeCloseTo(73.846153846, 4);
    expect(result.gapPerUnit).toBeCloseTo(6.346153846, 4);
    expect(result.status).toBe("attention");
  });

  it("flags healthy when the current rate already meets the required rate", () => {
    const result = evaluateRateHealth(48, 80, 35);
    expect(result.status).toBe("healthy");
    expect(result.gapPerUnit).toBeLessThanOrEqual(0);
  });

  it("flags critical when the gap exceeds 15% of the required rate", () => {
    const result = evaluateRateHealth(48, 40, 35);
    expect(result.status).toBe("critical");
  });
});

describe("evaluateMinimumJob — reference example", () => {
  it("matches the brief: $500 minimum, $390 true cost → 22% margin, $600 required minimum", () => {
    const result = evaluateMinimumJob(500, 390, 35);
    expect(result.currentMargin).toBeCloseTo(22, 10);
    expect(result.requiredMinimum).toBeCloseTo(600, 10);
    expect(result.isBelowTarget).toBe(true);
  });

  it("is not flagged below target once the minimum meets the required minimum", () => {
    const result = evaluateMinimumJob(600, 390, 35);
    expect(result.isBelowTarget).toBe(false);
  });
});

describe("evaluateProject — Smith Residence, full project roll-up", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnit: 0,
  };

  const project: Project = {
    id: "smith-residence",
    name: "Smith Residence",
    customerName: "Smith Residence",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "draft",
    serviceLines: [{ id: "line-1", assemblyId: "mulch-install", quantity: 8 }],
    equipmentLines: [{ equipmentId: "skidsteer", quantity: 4 }],
    deliveryCost: 180,
    extraCosts: [{ id: "extra-1", label: "Other", amount: 100 }],
    overheadPercent: 15,
    targetMarginPercent: 35,
  };

  const result = evaluateProject(project, [mulchAssembly], materials, equipment, 32);

  it("rolls up materials, labor, equipment, delivery and extras into a direct cost", () => {
    expect(result.materialsCost).toBeCloseTo(336, 10); // 8 * 42
    expect(result.laborCost).toBeCloseTo(102.4, 10); // 8 * 0.4 * 32
    expect(result.equipmentCost).toBeCloseTo(180, 10); // 4 * 45
    expect(result.deliveryCost).toBe(180);
    expect(result.otherCost).toBe(100);
  });

  it("produces a positive true cost and a required price above true cost", () => {
    expect(result.trueCost).toBeGreaterThan(result.directCost);
    expect(result.requiredSellingPrice).toBeGreaterThan(result.trueCost);
  });
});

describe("buildProjectCsvRows", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnit: 0,
  };
  const project: Project = {
    id: "smith-residence",
    name: "Smith Residence",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "draft",
    serviceLines: [{ id: "line-1", assemblyId: "mulch-install", quantity: 8 }],
    equipmentLines: [{ equipmentId: "skidsteer", quantity: 4 }],
    deliveryCost: 180,
    extraCosts: [{ id: "extra-1", label: "Other", amount: 100 }],
    overheadPercent: 15,
    targetMarginPercent: 35,
  };

  it("produces one row per resource, matching the brief's CSV shape", () => {
    const rows = buildProjectCsvRows(project, [mulchAssembly], materials, equipment, 32);
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

describe("evaluateActualVsEstimate", () => {
  it("shows a lower actual margin when the completed job cost more than estimated", () => {
    const estimate = {
      materialsCost: 1250,
      laborCost: 768,
      laborPersonHours: 24,
      equipmentCost: 180,
      deliveryCost: 180,
      otherCost: 100,
      directCost: 2478,
      overheadAmount: 371.7,
      trueCost: 2850,
      requiredSellingPrice: 4384.62,
      displayPrice: 4385,
      expectedMargin: 35,
    };
    // Actual direct cost of $3,345 roughly matches the brief's estimate-vs-actual example.
    const result = evaluateActualVsEstimate(estimate, 2909, 15);
    expect(result.actualTrueCost).toBeCloseTo(3345.35, 1);
    expect(result.actualMargin).not.toBeNull();
    expect(result.actualMargin as number).toBeLessThan(result.expectedMargin as number);
    expect(result.costVariance).toBeGreaterThan(0);
  });
});

describe("calculateAssemblyVariance — brief reference examples", () => {
  function completedProjectWithLine(assemblyId: string, estimatedQuantity: number, actualQuantity: number, actualLaborHours: number, index: number): Project {
    return {
      id: `proj-${assemblyId}-${index}`,
      name: `Job ${index}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "won",
      serviceLines: [{ id: "line-1", assemblyId, quantity: estimatedQuantity }],
      equipmentLines: [],
      deliveryCost: 0,
      extraCosts: [],
      overheadPercent: 15,
      targetMarginPercent: 35,
      actual: {
        actualLaborPersonHours: actualLaborHours,
        actualMaterialsCost: 0,
        actualEquipmentCost: 0,
        actualDeliveryCost: 0,
        actualOtherCost: 0,
        finalSellingPrice: 0,
        completedAt: "2026-02-01T00:00:00.000Z",
        serviceLineActuals: [{ assemblyId, estimatedQuantity, actualQuantity, actualLaborHours }],
      },
    };
  }

  it("matches the brief's shrub-installation labor variance: 9.2 est hrs -> 10.8 actual -> +17.4%", () => {
    const shrubAssembly: Assembly = {
      id: "shrub-install",
      name: "Shrub Installation",
      unit: "each",
      materials: [],
      laborPersonHoursPerUnit: 0.46, // 20 units * 0.46 = 9.2 estimated hours
      equipment: [],
      otherCostPerUnit: 0,
    };
    const projects = Array.from({ length: 18 }, (_, i) => completedProjectWithLine("shrub-install", 20, 20, 10.8, i));

    const [result] = calculateAssemblyVariance(projects, [shrubAssembly]);
    expect(result.completedCount).toBe(18);
    expect(result.avgEstimatedLaborHours).toBeCloseTo(9.2, 10);
    expect(result.avgActualLaborHours).toBeCloseTo(10.8, 10);
    expect(result.laborVariancePercent).toBeCloseTo(17.4, 1);
  });

  it("matches the brief's mulch material variance: 7.8 yd3 est -> 8.7 actual -> +11.5%", () => {
    const mulchAssembly: Assembly = {
      id: "mulch-install",
      name: "Mulch Installation",
      unit: "yd3",
      materials: [],
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnit: 0,
    };
    const projects = Array.from({ length: 24 }, (_, i) => completedProjectWithLine("mulch-install", 7.8, 8.7, 3, i));

    const [result] = calculateAssemblyVariance(projects, [mulchAssembly]);
    expect(result.completedCount).toBe(24);
    expect(result.avgEstimatedQuantity).toBeCloseTo(7.8, 10);
    expect(result.avgActualQuantity).toBeCloseTo(8.7, 10);
    expect(result.materialVariancePercent).toBeCloseTo(11.5, 1);
  });

  it("omits assemblies with no completed jobs", () => {
    const assembly: Assembly = {
      id: "unused",
      name: "Unused Service",
      unit: "each",
      materials: [],
      laborPersonHoursPerUnit: 0.1,
      equipment: [],
      otherCostPerUnit: 0,
    };
    expect(calculateAssemblyVariance([], [assembly])).toEqual([]);
  });
});

describe("calculateProfitabilitySummary", () => {
  it("returns nulls and a zero count when nothing is completed", () => {
    const summary = calculateProfitabilitySummary([], [], [], [], 32);
    expect(summary.completedCount).toBe(0);
    expect(summary.avgExpectedMargin).toBeNull();
    expect(summary.avgActualMargin).toBeNull();
  });

  it("averages expected vs actual margin across completed jobs", () => {
    const mulchAssembly: Assembly = {
      id: "mulch-install",
      name: "Mulch Installation",
      unit: "yd3",
      materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
      laborPersonHoursPerUnit: 0.4,
      equipment: [],
      otherCostPerUnit: 0,
    };
    const project: Project = {
      id: "p1",
      name: "Job 1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "won",
      serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }],
      equipmentLines: [],
      deliveryCost: 0,
      extraCosts: [],
      overheadPercent: 15,
      targetMarginPercent: 35,
      actual: {
        actualLaborPersonHours: 4,
        actualMaterialsCost: 400,
        actualEquipmentCost: 0,
        actualDeliveryCost: 0,
        actualOtherCost: 0,
        finalSellingPrice: 0,
        completedAt: "2026-02-01T00:00:00.000Z",
      },
    };
    const summary = calculateProfitabilitySummary([project], [mulchAssembly], materials, [], 32);
    expect(summary.completedCount).toBe(1);
    expect(summary.avgExpectedMargin).not.toBeNull();
    expect(summary.avgActualMargin).not.toBeNull();
  });
});

describe("snapshotCostImpact — brief killer features #16-18", () => {
  const mulchAssembly: Assembly = {
    id: "mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnit: 0,
    currentRate: 95,
  };
  const edgingAssembly: Assembly = {
    id: "edging",
    name: "Edging",
    unit: "linear-ft",
    materials: [],
    laborPersonHoursPerUnit: 0.025,
    equipment: [],
    otherCostPerUnit: 0.4,
    currentRate: 2.25,
  };
  const assemblies = [mulchAssembly, edgingAssembly];
  const template: ProjectTemplate = {
    id: "tmpl-1",
    name: "Mulch refresh",
    serviceLines: [{ assemblyId: "mulch-install", quantity: 8 }],
    equipmentLines: [],
    deliveryCost: 0,
    extraCosts: [],
  };
  const lowMarginProject: Project = {
    id: "proj-1",
    name: "Low margin job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "sent",
    serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }],
    equipmentLines: [],
    deliveryCost: 0,
    extraCosts: [],
    overheadPercent: 15,
    targetMarginPercent: 35,
    // Quoted back when mulch was cheap; a price increase after quoting is
    // exactly the scenario killer feature #16 describes.
    quotedPrice: 400,
  };
  const workspace = {
    assemblies,
    templates: [template],
    projects: [lowMarginProject],
    materials,
    equipment,
    business: DEFAULT_BUSINESS_SETTINGS,
  };

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
});
