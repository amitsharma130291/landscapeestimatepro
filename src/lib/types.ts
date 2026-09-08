// Shared domain types for the estimating/job-costing engine. Pure data — no logic here.

export type MaterialUnit =
  | "each"
  | "sqft"
  | "linear-ft"
  | "yd3"
  | "ton"
  | "bag"
  | "pallet"
  | "hour"
  | "job"
  | "custom";

export type EquipmentRateType = "hour" | "day" | "job" | "custom";

export interface Material {
  id: string;
  name: string;
  unitCost: number;
  unit: MaterialUnit;
  customUnitLabel?: string;
  archived?: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  rate: number;
  rateType: EquipmentRateType;
  customUnitLabel?: string;
  archived?: boolean;
}

/** Business-wide assumptions the contractor sets once and reuses everywhere. */
export interface BusinessSettings {
  loadedLaborRate: number; // $ per person-hour
  overheadPercent: number; // % of direct cost
  targetMarginPercent: number; // % of selling price
  defaultDeliveryCost: number;
  minimumProjectPrice: number;
  roundDisplayTo: "dollar" | "cent";
  businessName?: string;
  businessLogoDataUrl?: string; // small logo, stored inline (no backend) for branded estimates
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  loadedLaborRate: 32,
  overheadPercent: 15,
  targetMarginPercent: 35,
  defaultDeliveryCost: 150,
  minimumProjectPrice: 500,
  roundDisplayTo: "dollar",
};

// -- Labor -------------------------------------------------------------

export type LaborMode = "direct" | "production";

export interface DirectLaborInput {
  mode: "direct";
  crewSize: number;
  hours: number;
  loadedRate: number;
}

export interface ProductionLaborInput {
  mode: "production";
  quantity: number; // units of work (e.g. 8 yd3, 220 linear ft)
  productionRate: number; // units per person-hour
  loadedRate: number;
}

export type LaborInput = DirectLaborInput | ProductionLaborInput;

export interface LaborResult {
  personHours: number;
  laborCost: number;
}

// -- Project cost roll-up ------------------------------------------------

export interface ProjectCostInputs {
  materialsCost: number;
  laborCost: number;
  equipmentCost: number;
  deliveryCost: number;
  otherCost: number;
  overheadPercent: number;
}

export interface ProjectCostResult {
  directCost: number;
  overheadAmount: number;
  trueCost: number;
}

export interface PricingResult {
  trueCost: number;
  targetMarginPercent: number;
  requiredSellingPrice: number;
  displayPrice: number;
  expectedGrossProfit: number;
}

// -- Assemblies (reusable services) --------------------------------------

export interface AssemblyMaterialLine {
  materialId: string;
  quantityPerUnit: number;
}

export interface AssemblyEquipmentLine {
  equipmentId: string;
  quantityPerUnit: number; // hours/days/jobs per unit of the assembly, depending on rateType
}

export interface Assembly {
  id: string;
  name: string;
  unit: MaterialUnit;
  materials: AssemblyMaterialLine[];
  laborPersonHoursPerUnit: number;
  equipment: AssemblyEquipmentLine[];
  otherCostPerUnit: number;
  currentRate?: number; // $ the contractor currently charges per unit, for Rate Health
  archived?: boolean;
}

export interface AssemblyCostResult {
  materialCostPerUnit: number;
  laborCostPerUnit: number;
  equipmentCostPerUnit: number;
  otherCostPerUnit: number;
  trueCostPerUnit: number;
}

export type RateHealthStatus = "healthy" | "attention" | "critical";

export interface RateHealthResult {
  trueCostPerUnit: number;
  currentRate: number;
  currentMargin: number | null;
  requiredRate: number;
  gapPerUnit: number; // requiredRate - currentRate (positive = underpriced)
  status: RateHealthStatus;
}

// -- Projects / estimates -------------------------------------------------

export interface ProjectServiceLine {
  id: string;
  assemblyId: string;
  quantity: number;
}

export interface ProjectExtraCost {
  id: string;
  label: string;
  amount: number;
}

export interface Project {
  id: string;
  name: string;
  customerName?: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "sent" | "won" | "lost" | "archived";
  serviceLines: ProjectServiceLine[];
  equipmentLines: { equipmentId: string; quantity: number }[];
  deliveryCost: number;
  extraCosts: ProjectExtraCost[];
  overheadPercent: number;
  targetMarginPercent: number;
  notes?: string;
  actual?: ProjectActuals;
  /** The price actually communicated to the customer, captured once (when
   * the project first moves out of "draft") and never silently recomputed
   * afterward — a draft's price re-solves live as costs change, but a
   * quoted price shouldn't drift out from under a customer who already has
   * it in hand. This is what makes "is this open estimate now below target
   * margin" a meaningful question after a cost change, rather than
   * tautologically always "no" (calc.ts always re-solves a draft's price to
   * hit its own target). */
  quotedPrice?: number;
}

/** Per-service-line actual, recorded when a job wraps up — this is what makes
 * historical material/labor variance possible (brief killer features #20/21):
 * comparing what a service was estimated to need vs. what it actually took,
 * broken down by assembly rather than lumped into one project-wide number. */
export interface ServiceLineActual {
  assemblyId: string;
  estimatedQuantity: number;
  actualQuantity: number;
  actualLaborHours: number;
}

export interface ProjectActuals {
  actualLaborPersonHours: number;
  actualMaterialsCost: number;
  actualEquipmentCost: number;
  actualDeliveryCost: number;
  actualOtherCost: number;
  finalSellingPrice: number;
  completedAt: string;
  serviceLineActuals?: ServiceLineActual[];
}

export interface ProjectEstimateResult {
  materialsCost: number;
  laborCost: number;
  laborPersonHours: number;
  equipmentCost: number;
  deliveryCost: number;
  otherCost: number;
  directCost: number;
  overheadAmount: number;
  trueCost: number;
  requiredSellingPrice: number;
  displayPrice: number;
  expectedMargin: number | null;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  serviceLines: { assemblyId: string; quantity: number }[];
  equipmentLines: { equipmentId: string; quantity: number }[];
  deliveryCost: number;
  extraCosts: ProjectExtraCost[];
}

export interface Workspace {
  version: 1;
  business: BusinessSettings;
  materials: Material[];
  equipment: Equipment[];
  assemblies: Assembly[];
  projects: Project[];
  templates: ProjectTemplate[];
}
