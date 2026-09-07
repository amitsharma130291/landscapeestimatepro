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
  Equipment,
  Material,
  Project,
  ProjectEstimateResult,
  RateHealthResult,
  RateHealthStatus,
} from "./types";

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
