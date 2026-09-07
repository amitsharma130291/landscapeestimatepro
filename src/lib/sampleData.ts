import type { Assembly, Equipment, Material, Workspace } from "./types";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";

export const SAMPLE_MATERIALS: Material[] = [
  { id: "mat-mulch", name: "Mulch", unitCost: 42, unit: "yd3" },
  { id: "mat-topsoil", name: "Topsoil", unitCost: 38, unit: "yd3" },
  { id: "mat-gravel", name: "Gravel", unitCost: 55, unit: "ton" },
  { id: "mat-shrub", name: "Shrub", unitCost: 28, unit: "each" },
  { id: "mat-paver", name: "Paver", unitCost: 4.2, unit: "sqft" },
];

export const SAMPLE_EQUIPMENT: Equipment[] = [
  { id: "eq-skidsteer", name: "Skid Steer", rate: 45, rateType: "hour" },
  { id: "eq-dumptrailer", name: "Dump Trailer", rate: 75, rateType: "job" },
  { id: "eq-miniexcavator", name: "Mini Excavator", rate: 55, rateType: "hour" },
  { id: "eq-compactor", name: "Plate Compactor", rate: 65, rateType: "day" },
];

export const SAMPLE_ASSEMBLIES: Assembly[] = [
  {
    id: "asm-mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mat-mulch", quantityPerUnit: 1 }],
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnit: 0,
    currentRate: 95,
  },
  {
    id: "asm-topsoil-install",
    name: "Topsoil Installation",
    unit: "yd3",
    materials: [{ materialId: "mat-topsoil", quantityPerUnit: 1 }],
    laborPersonHoursPerUnit: 0.35,
    equipment: [],
    otherCostPerUnit: 0,
    currentRate: 85,
  },
  {
    id: "asm-edging",
    name: "Edging",
    unit: "linear-ft",
    materials: [],
    laborPersonHoursPerUnit: 0.025,
    equipment: [],
    otherCostPerUnit: 0.4,
    currentRate: 2.25,
  },
  {
    id: "asm-shrub-install",
    name: "Shrub Installation",
    unit: "each",
    materials: [{ materialId: "mat-shrub", quantityPerUnit: 1 }],
    laborPersonHoursPerUnit: 0.45,
    equipment: [],
    otherCostPerUnit: 0,
    currentRate: 67.5,
  },
];

export function createSampleWorkspace(): Workspace {
  return {
    version: 1,
    business: DEFAULT_BUSINESS_SETTINGS,
    materials: SAMPLE_MATERIALS,
    equipment: SAMPLE_EQUIPMENT,
    assemblies: SAMPLE_ASSEMBLIES,
    projects: [],
    templates: [],
  };
}
