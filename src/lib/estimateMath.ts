/**
 * Assembly, project-estimate, Service Rate Health, and Minimum Job Audit math.
 * Built on top of the primitives in calc.ts — see that file for the core
 * safe()/margin/required-price rules this module relies on.
 */
import Decimal from "decimal.js";
import { calculateMargin, calculateProjectCost, calculateRequiredSellingPrice, safe } from "./calc";
import type {
  Assembly,
  AssemblyCostResult,
  BusinessSettings,
  Equipment,
  Material,
  Project,
  ProjectEstimateResult,
  ProjectTemplate,
  RateHealthResult,
  RateHealthStatus,
} from "./types";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentDiff(actual: number, estimated: number): number | null {
  if (estimated <= 0) return null;
  return ((actual - estimated) / estimated) * 100;
}

function safeD(n: number): Decimal {
  if (!Number.isFinite(n) || n < 0) return new Decimal(0);
  return new Decimal(n);
}

/** Look up the per-unit cost basis for one unit of an equipment line, given
 * its rate type. Equipment billed "per job" or "per day" still contributes a
 * flat amount per assembly unit if the contractor says so (e.g. 0.1 jobs of
 * a dump trailer per shrub) — the engine doesn't second-guess the ratio. */
function equipmentUnitCost(equipment: Equipment, quantityPerUnit: number): number {
  return safeD(equipment.rate).times(safeD(quantityPerUnit)).toNumber();
}

/** Resolve an assembly (materials + labor + equipment + other, per one unit)
 * into a fully-costed per-unit breakdown, given the current material/equipment
 * catalogs and the business's loaded labor rate. */
export function calculateAssemblyCost(
  assembly: Assembly,
  materials: Material[],
  equipment: Equipment[],
  loadedLaborRate: number
): AssemblyCostResult {
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  let materialCost = new Decimal(0);
  for (const line of assembly.materials) {
    const material = materialById.get(line.materialId);
    if (!material) continue;
    materialCost = materialCost.plus(safeD(material.unitCost).times(safeD(line.quantityPerUnit)));
  }

  let equipmentCost = new Decimal(0);
  for (const line of assembly.equipment) {
    const item = equipmentById.get(line.equipmentId);
    if (!item) continue;
    equipmentCost = equipmentCost.plus(equipmentUnitCost(item, line.quantityPerUnit));
  }

  const laborCost = safeD(assembly.laborPersonHoursPerUnit).times(safeD(loadedLaborRate));
  const otherCost = safeD(assembly.otherCostPerUnit);
  const trueCostPerUnit = materialCost.plus(laborCost).plus(equipmentCost).plus(otherCost);

  return {
    materialCostPerUnit: materialCost.toNumber(),
    laborCostPerUnit: laborCost.toNumber(),
    equipmentCostPerUnit: equipmentCost.toNumber(),
    otherCostPerUnit: otherCost.toNumber(),
    trueCostPerUnit: trueCostPerUnit.toNumber(),
  };
}

/**
 * Service Rate Health: compares what the contractor currently charges for a
 * service against the price required to hit their target margin.
 *
 * Status thresholds (gap = requiredRate − currentRate, as a % of requiredRate):
 *  - healthy: current rate meets or exceeds the required rate
 *  - attention: below required rate by up to 15%
 *  - critical: below required rate by more than 15%
 */
export function evaluateRateHealth(
  trueCostPerUnit: number,
  currentRate: number,
  targetMarginPercent: number
): RateHealthResult {
  const requiredRate = calculateRequiredSellingPrice(trueCostPerUnit, targetMarginPercent);
  const currentMargin = calculateMargin(currentRate, trueCostPerUnit);
  const gapPerUnit = safe(requiredRate) - safe(currentRate);

  let status: RateHealthStatus = "healthy";
  if (gapPerUnit > 0 && requiredRate > 0) {
    const gapPercentOfRequired = (gapPerUnit / requiredRate) * 100;
    status = gapPercentOfRequired > 15 ? "critical" : "attention";
  }

  return {
    trueCostPerUnit: safe(trueCostPerUnit),
    currentRate: safe(currentRate),
    currentMargin,
    requiredRate,
    gapPerUnit,
    status,
  };
}

export interface MinimumJobAuditResult {
  currentMinimum: number;
  typicalTrueCost: number;
  currentMargin: number | null;
  requiredMinimum: number;
  isBelowTarget: boolean;
}

export function evaluateMinimumJob(
  currentMinimum: number,
  typicalTrueCost: number,
  targetMarginPercent: number
): MinimumJobAuditResult {
  const currentMargin = calculateMargin(currentMinimum, typicalTrueCost);
  const requiredMinimum = calculateRequiredSellingPrice(typicalTrueCost, targetMarginPercent);
  return {
    currentMinimum: safe(currentMinimum),
    typicalTrueCost: safe(typicalTrueCost),
    currentMargin,
    requiredMinimum,
    isBelowTarget: currentMargin !== null && currentMargin < targetMarginPercent,
  };
}

/** Full cost + pricing roll-up for a saved Project, using its service lines
 * (assembly × quantity), equipment lines, delivery, and extra costs. */
export function evaluateProject(
  project: Project,
  assemblies: Assembly[],
  materials: Material[],
  equipment: Equipment[],
  loadedLaborRate: number
): ProjectEstimateResult {
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  let materialsCost = new Decimal(0);
  let laborCost = new Decimal(0);
  let laborPersonHours = new Decimal(0);
  let assemblyEquipmentCost = new Decimal(0);
  let otherCost = new Decimal(0);

  for (const line of project.serviceLines) {
    const assembly = assemblyById.get(line.assemblyId);
    if (!assembly) continue;
    const perUnit = calculateAssemblyCost(assembly, materials, equipment, loadedLaborRate);
    const qty = safeD(line.quantity);
    materialsCost = materialsCost.plus(safeD(perUnit.materialCostPerUnit).times(qty));
    laborCost = laborCost.plus(safeD(perUnit.laborCostPerUnit).times(qty));
    laborPersonHours = laborPersonHours.plus(
      safeD(assembly.laborPersonHoursPerUnit).times(qty)
    );
    assemblyEquipmentCost = assemblyEquipmentCost.plus(safeD(perUnit.equipmentCostPerUnit).times(qty));
    otherCost = otherCost.plus(safeD(perUnit.otherCostPerUnit).times(qty));
  }

  let standaloneEquipmentCost = new Decimal(0);
  for (const line of project.equipmentLines) {
    const item = equipmentById.get(line.equipmentId);
    if (!item) continue;
    standaloneEquipmentCost = standaloneEquipmentCost.plus(equipmentUnitCost(item, line.quantity));
  }

  for (const extra of project.extraCosts) {
    otherCost = otherCost.plus(safeD(extra.amount));
  }

  const equipmentCost = assemblyEquipmentCost.plus(standaloneEquipmentCost);
  const deliveryCost = safeD(project.deliveryCost);

  const { directCost, overheadAmount, trueCost } = calculateProjectCost({
    materialsCost: materialsCost.toNumber(),
    laborCost: laborCost.toNumber(),
    equipmentCost: equipmentCost.toNumber(),
    deliveryCost: deliveryCost.toNumber(),
    otherCost: otherCost.toNumber(),
    overheadPercent: project.overheadPercent,
  });

  const requiredSellingPrice = calculateRequiredSellingPrice(trueCost, project.targetMarginPercent);
  const displayPrice = Math.round(requiredSellingPrice);
  const expectedMargin = calculateMargin(displayPrice, trueCost);

  return {
    materialsCost: materialsCost.toNumber(),
    laborCost: laborCost.toNumber(),
    laborPersonHours: laborPersonHours.toNumber(),
    equipmentCost: equipmentCost.toNumber(),
    deliveryCost: deliveryCost.toNumber(),
    otherCost: otherCost.toNumber(),
    directCost,
    overheadAmount,
    trueCost,
    requiredSellingPrice,
    displayPrice,
    expectedMargin,
  };
}

export interface ProjectCsvRow {
  item: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

/** Breaks a project down into resource-level CSV rows (one row per material,
 * one for labor, one per equipment line) — matching the brief's reference
 * CSV shape rather than one opaque row per assembly. */
export function buildProjectCsvRows(
  project: Project,
  assemblies: Assembly[],
  materials: Material[],
  equipment: Equipment[],
  loadedLaborRate: number
): ProjectCsvRow[] {
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const rows: ProjectCsvRow[] = [];

  for (const line of project.serviceLines) {
    const assembly = assemblyById.get(line.assemblyId);
    if (!assembly) continue;
    const qty = safe(line.quantity);

    for (const materialLine of assembly.materials) {
      const material = materialById.get(materialLine.materialId);
      if (!material) continue;
      const materialQty = qty * safe(materialLine.quantityPerUnit);
      rows.push({
        item: material.name.toLowerCase(),
        quantity: materialQty,
        unit: material.unit,
        unitCost: material.unitCost,
        total: materialQty * material.unitCost,
      });
    }

    if (assembly.laborPersonHoursPerUnit > 0) {
      const laborHours = qty * safe(assembly.laborPersonHoursPerUnit);
      rows.push({
        item: `${assembly.name.toLowerCase()} labor`,
        quantity: laborHours,
        unit: "person-hour",
        unitCost: safe(loadedLaborRate),
        total: laborHours * safe(loadedLaborRate),
      });
    }

    for (const equipmentLine of assembly.equipment) {
      const item = equipmentById.get(equipmentLine.equipmentId);
      if (!item) continue;
      const equipmentQty = qty * safe(equipmentLine.quantityPerUnit);
      rows.push({
        item: item.name.toLowerCase(),
        quantity: equipmentQty,
        unit: item.rateType,
        unitCost: item.rate,
        total: equipmentQty * item.rate,
      });
    }
  }

  for (const line of project.equipmentLines) {
    const item = equipmentById.get(line.equipmentId);
    if (!item) continue;
    rows.push({
      item: item.name.toLowerCase(),
      quantity: safe(line.quantity),
      unit: item.rateType,
      unitCost: item.rate,
      total: safe(line.quantity) * item.rate,
    });
  }

  if (project.deliveryCost > 0) {
    rows.push({ item: "delivery", quantity: 1, unit: "job", unitCost: project.deliveryCost, total: project.deliveryCost });
  }

  for (const extra of project.extraCosts) {
    rows.push({ item: extra.label.toLowerCase(), quantity: 1, unit: "job", unitCost: extra.amount, total: extra.amount });
  }

  return rows;
}

export interface ActualVsEstimateResult {
  estimatedTrueCost: number;
  actualTrueCost: number;
  quotedPrice: number;
  expectedMargin: number | null;
  actualMargin: number | null;
  costVariance: number;
  costVariancePercent: number | null;
}

export function evaluateActualVsEstimate(
  estimate: ProjectEstimateResult,
  actualDirectCost: number,
  overheadPercent: number
): ActualVsEstimateResult {
  const actualOverhead = safeD(actualDirectCost).times(
    Math.min(Math.max(overheadPercent, 0), 100) / 100
  );
  const actualTrueCost = safeD(actualDirectCost).plus(actualOverhead).toNumber();
  const quotedPrice = estimate.displayPrice;
  const expectedMargin = calculateMargin(quotedPrice, estimate.trueCost);
  const actualMargin = calculateMargin(quotedPrice, actualTrueCost);
  const costVariance = actualTrueCost - estimate.trueCost;
  const costVariancePercent =
    estimate.trueCost > 0 ? (costVariance / estimate.trueCost) * 100 : null;

  return {
    estimatedTrueCost: estimate.trueCost,
    actualTrueCost,
    quotedPrice,
    expectedMargin,
    actualMargin,
    costVariance,
    costVariancePercent,
  };
}

// -- Historical variance & profitability (brief killer features #20-22) -----

export interface AssemblyVarianceResult {
  assemblyId: string;
  assemblyName: string;
  unit: string;
  completedCount: number;
  avgEstimatedQuantity: number;
  avgActualQuantity: number;
  materialVariancePercent: number | null;
  avgActualLaborHours: number;
  /** Hours the estimate implied, given the assembly's current production
   * rate applied to the ORIGINALLY ESTIMATED quantity — i.e. "what we
   * expected labor to be," compared against what it actually took. */
  avgEstimatedLaborHours: number;
  laborVariancePercent: number | null;
}

/** Groups every completed project's per-service actuals by assembly, so a
 * contractor can see e.g. "shrub installs run 17% more labor than planned"
 * across their job history — not just one project at a time. Assemblies with
 * no completed jobs yet are omitted (nothing to report). */
export function calculateAssemblyVariance(
  projects: Project[],
  assemblies: Assembly[]
): AssemblyVarianceResult[] {
  const byAssembly = new Map<string, { estQty: number[]; actQty: number[]; actHours: number[]; estHours: number[] }>();

  for (const project of projects) {
    const lineActuals = project.actual?.serviceLineActuals;
    if (!lineActuals) continue;
    for (const line of lineActuals) {
      const assembly = assemblies.find((a) => a.id === line.assemblyId);
      if (!assembly) continue;
      const bucket = byAssembly.get(line.assemblyId) ?? { estQty: [], actQty: [], actHours: [], estHours: [] };
      bucket.estQty.push(safe(line.estimatedQuantity));
      bucket.actQty.push(safe(line.actualQuantity));
      bucket.actHours.push(safe(line.actualLaborHours));
      bucket.estHours.push(safe(line.estimatedQuantity) * safe(assembly.laborPersonHoursPerUnit));
      byAssembly.set(line.assemblyId, bucket);
    }
  }

  const results: AssemblyVarianceResult[] = [];
  for (const [assemblyId, bucket] of byAssembly) {
    const assembly = assemblies.find((a) => a.id === assemblyId);
    if (!assembly) continue;
    const avgEstimatedQuantity = average(bucket.estQty) ?? 0;
    const avgActualQuantity = average(bucket.actQty) ?? 0;
    const avgActualLaborHours = average(bucket.actHours) ?? 0;
    const avgEstimatedLaborHours = average(bucket.estHours) ?? 0;
    results.push({
      assemblyId,
      assemblyName: assembly.name,
      unit: assembly.unit,
      completedCount: bucket.estQty.length,
      avgEstimatedQuantity,
      avgActualQuantity,
      materialVariancePercent: percentDiff(avgActualQuantity, avgEstimatedQuantity),
      avgActualLaborHours,
      avgEstimatedLaborHours,
      laborVariancePercent: percentDiff(avgActualLaborHours, avgEstimatedLaborHours),
    });
  }
  return results;
}

export interface ProfitabilitySummary {
  completedCount: number;
  avgExpectedMargin: number | null;
  avgActualMargin: number | null;
}

/** Aggregate expected-vs-actual margin across every completed job. This is a
 * whole-project rollup rather than a per-service-type breakdown: a project's
 * margin is computed for the project as a whole (materials+labor+equipment
 * from every service line together), so splitting profit by individual
 * service within a multi-service project isn't something the pricing model
 * supports without attributing overhead/margin per line — deliberately not
 * done here rather than faking precision the data doesn't have. */
export function calculateProfitabilitySummary(
  projects: Project[],
  assemblies: Assembly[],
  materials: Material[],
  equipment: Equipment[],
  loadedLaborRate: number
): ProfitabilitySummary {
  const completed = projects.filter((p) => p.actual);
  const expectedMargins: number[] = [];
  const actualMargins: number[] = [];

  for (const project of completed) {
    const estimate = evaluateProject(project, assemblies, materials, equipment, loadedLaborRate);
    const actualDirectCost =
      project.actual!.actualMaterialsCost +
      project.actual!.actualLaborPersonHours * loadedLaborRate +
      project.actual!.actualEquipmentCost +
      project.actual!.actualDeliveryCost +
      project.actual!.actualOtherCost;
    // A won job sold at whatever was quoted (if locked in), not necessarily
    // at today's live-recalculated price.
    const estimateForComparison = { ...estimate, displayPrice: project.quotedPrice ?? estimate.displayPrice };
    const comparison = evaluateActualVsEstimate(estimateForComparison, actualDirectCost, project.overheadPercent);
    if (comparison.expectedMargin !== null) expectedMargins.push(comparison.expectedMargin);
    if (comparison.actualMargin !== null) actualMargins.push(comparison.actualMargin);
  }

  return {
    completedCount: completed.length,
    avgExpectedMargin: average(expectedMargins),
    avgActualMargin: average(actualMargins),
  };
}

// -- Cost-impact scenarios (brief killer features #16-18) -------------------

export type CostImpactKind = "material" | "equipment" | "labor";

/** A labor-rate change affects every assembly that bills any labor at all;
 * a material/equipment change affects only assemblies that actually use
 * that specific item. */
export function findAffectedAssemblies(
  assemblies: Assembly[],
  kind: CostImpactKind,
  itemId?: string
): Assembly[] {
  if (kind === "labor") return assemblies.filter((a) => a.laborPersonHoursPerUnit > 0);
  if (kind === "material") return assemblies.filter((a) => a.materials.some((m) => m.materialId === itemId));
  return assemblies.filter((a) => a.equipment.some((e) => e.equipmentId === itemId));
}

export interface CostImpactWorkspace {
  assemblies: Assembly[];
  templates: ProjectTemplate[];
  projects: Project[];
  materials: Material[];
  equipment: Equipment[];
  business: BusinessSettings;
}

export interface CostImpactSnapshot {
  affectedAssemblyIds: string[];
  affectedTemplateIds: string[];
  affectedProjectIds: string[];
  belowTargetProjectIds: string[];
}

/** Captures which assemblies/templates/open estimates a rate change touches,
 * and which of those open estimates are currently below their own target
 * margin — call once before a rate edit and once after to see exactly what
 * changed (brief killer features #16-18: "6 estimates now below target"). */
export function snapshotCostImpact(
  kind: CostImpactKind,
  itemId: string | undefined,
  workspace: CostImpactWorkspace
): CostImpactSnapshot {
  const affected = findAffectedAssemblies(workspace.assemblies, kind, itemId);
  const affectedIds = new Set(affected.map((a) => a.id));

  const affectedTemplateIds = workspace.templates
    .filter((t) => t.serviceLines.some((l) => affectedIds.has(l.assemblyId)))
    .map((t) => t.id);

  const openProjects = workspace.projects.filter(
    (p) => p.status !== "archived" && p.serviceLines.some((l) => affectedIds.has(l.assemblyId))
  );

  // Only a project with a price already quoted to the customer can
  // meaningfully be "below target" — a plain draft always re-solves its own
  // price to hit target, so it's never behind by construction.
  const belowTargetProjectIds = openProjects
    .filter((p) => {
      if (p.quotedPrice === undefined) return false;
      const result = evaluateProject(p, workspace.assemblies, workspace.materials, workspace.equipment, workspace.business.loadedLaborRate);
      const marginAtQuotedPrice = calculateMargin(p.quotedPrice, result.trueCost);
      return marginAtQuotedPrice !== null && marginAtQuotedPrice < p.targetMarginPercent;
    })
    .map((p) => p.id);

  return {
    affectedAssemblyIds: [...affectedIds],
    affectedTemplateIds,
    affectedProjectIds: openProjects.map((p) => p.id),
    belowTargetProjectIds,
  };
}
