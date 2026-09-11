import type { MoneyCents } from "./money";
import type { Assembly, Equipment, Material, Workspace } from "./types";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";

export const SAMPLE_MATERIALS: Material[] = [
  { id: "mat-mulch", name: "Mulch", unitCostCents: 4200 as MoneyCents, unit: "yd3" },
  { id: "mat-topsoil", name: "Topsoil", unitCostCents: 3800 as MoneyCents, unit: "yd3" },
  { id: "mat-gravel", name: "Gravel", unitCostCents: 5500 as MoneyCents, unit: "ton" },
  { id: "mat-shrub", name: "Shrub", unitCostCents: 2800 as MoneyCents, unit: "each" },
  { id: "mat-paver", name: "Paver", unitCostCents: 420 as MoneyCents, unit: "sqft" },
];

export const SAMPLE_EQUIPMENT: Equipment[] = [
  { id: "eq-skidsteer", name: "Skid Steer", rateCents: 4500 as MoneyCents, rateType: "hour" },
  { id: "eq-dumptrailer", name: "Dump Trailer", rateCents: 7500 as MoneyCents, rateType: "job" },
  { id: "eq-miniexcavator", name: "Mini Excavator", rateCents: 5500 as MoneyCents, rateType: "hour" },
  { id: "eq-compactor", name: "Plate Compactor", rateCents: 6500 as MoneyCents, rateType: "day" },
];

export const SAMPLE_ASSEMBLIES: Assembly[] = [
  {
    id: "asm-mulch-install",
    name: "Mulch Installation",
    unit: "yd3",
    materials: [{ materialId: "mat-mulch", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit",
    laborPersonHoursPerUnit: 0.4,
    equipment: [],
    otherCostPerUnitCents: 0 as MoneyCents,
    currentRateCents: 9500 as MoneyCents,
  },
  {
    id: "asm-topsoil-install",
    name: "Topsoil Installation",
    unit: "yd3",
    materials: [{ materialId: "mat-topsoil", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit",
    laborPersonHoursPerUnit: 0.35,
    equipment: [],
    otherCostPerUnitCents: 0 as MoneyCents,
    currentRateCents: 8500 as MoneyCents,
  },
  {
    id: "asm-edging",
    name: "Edging",
    unit: "linear-ft",
    materials: [],
    laborInputMode: "person-hours-per-unit",
    laborPersonHoursPerUnit: 0.025,
    equipment: [],
    otherCostPerUnitCents: 40 as MoneyCents,
    currentRateCents: 225 as MoneyCents,
  },
  {
    id: "asm-shrub-install",
    name: "Shrub Installation",
    unit: "each",
    materials: [{ materialId: "mat-shrub", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit",
    laborPersonHoursPerUnit: 0.45,
    equipment: [],
    otherCostPerUnitCents: 0 as MoneyCents,
    currentRateCents: 6750 as MoneyCents,
  },
];

export function createSampleWorkspace(): Workspace {
  return {
    version: 5,
    business: DEFAULT_BUSINESS_SETTINGS,
    materials: SAMPLE_MATERIALS,
    equipment: SAMPLE_EQUIPMENT,
    assemblies: SAMPLE_ASSEMBLIES,
    projects: [],
    templates: [],
  };
}
