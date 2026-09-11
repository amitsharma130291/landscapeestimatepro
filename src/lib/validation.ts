/**
 * Field-level validation (a message to show next to an input) AND
 * domain-level validation (a list of reasons a whole record can't be
 * saved/used) for every place a bad value doesn't just look wrong — it
 * silently breaks the pricing math (e.g. a zero production rate makes
 * `calculateLabor` divide by zero, or a negative unit cost makes a service's
 * "true cost" understate what a job actually costs).
 *
 * These functions never clamp or silently fix a bad value — a rejected
 * value must block save/use, not get coerced to zero and passed through.
 * Field-level validators (`validate*`) return a message string or `null`;
 * domain-level validators (`get*ValidationErrors`) return an array of
 * messages (empty = valid) so a whole record can be checked before it's
 * persisted or consumed by an estimate.
 */
import { fromDollarInputToCents, MoneyError } from "./money";
import type { Assembly, Equipment, Material, ProjectActuals, ProjectLaborLine } from "./types";

/** A target margin of 100% or more is mathematically undefined (price would
 * need to be infinite); the UI caps input at 95% so a typo doesn't produce a
 * silently-clamped, wildly wrong price. */
export const MAX_TARGET_MARGIN_PERCENT = 95;

export function validateTargetMarginPercent(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value < 0) return "Target margin can't be negative.";
  if (value >= 100) return "Target margin must be under 100% — at 100% or above, no selling price could ever satisfy it.";
  if (value > MAX_TARGET_MARGIN_PERCENT) return `Target margin above ${MAX_TARGET_MARGIN_PERCENT}% usually signals a typo — double-check this.`;
  return null;
}

export function validateProductionRate(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value <= 0) return "Production rate must be greater than 0 — labor hours are quantity ÷ rate, so 0 would divide by zero.";
  return null;
}

export function validatePersonHoursPerUnit(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value <= 0) return "Person-hours per unit must be greater than 0.";
  return null;
}

export function validateCrewSize(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value <= 0) return "Crew size must be at least 1.";
  return null;
}

export function validateElapsedHours(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value < 0) return "Elapsed hours can't be negative.";
  return null;
}

export function validateOverheadPercent(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value < 0) return "Overhead can't be negative.";
  return null;
}

export function validateTaxRatePercent(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value < 0 || value > 100) return "Tax rate must be between 0% and 100%.";
  return null;
}

/** A plain (non-money) quantity — material quantity-per-unit, equipment
 * usage-per-unit, a project service line's quantity, etc. Zero is allowed
 * (a line that costs nothing is still a valid line); negative and
 * non-finite are not. */
export function validateQuantity(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number.";
  if (value < 0) return "Quantity can't be negative.";
  return null;
}

/**
 * Validates a RAW dollar string as typed by a contractor (unit cost,
 * equipment rate, loaded labor rate, current selling rate, an actual cost,
 * an actual-quoted-price override — every dollar-denominated field in the
 * app funnels through this one function) before it's converted to
 * `MoneyCents`. Rejects blank input, malformed/non-numeric text, negative
 * amounts, and anything that would overflow a safe-integer cents value —
 * never silently clamps to zero and lets a bad entry through.
 */
export function validateDollarInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "Enter an amount.";
  let cents: number;
  try {
    cents = fromDollarInputToCents(trimmed);
  } catch (err) {
    if (err instanceof MoneyError) return "Enter a valid dollar amount.";
    throw err;
  }
  if (cents < 0) return "Amount can't be negative.";
  return null;
}

/** Defensive check on a value that's already `MoneyCents`-shaped (e.g. one
 * read back out of storage) — not a substitute for `validateDollarInput` at
 * the text-input boundary, but a last line of defense before a record is
 * saved or an estimate consumes it. */
export function validateMoneyCentsValue(cents: number): string | null {
  if (!Number.isFinite(cents)) return "Amount must be a finite number.";
  if (!Number.isInteger(cents)) return "Amount must be a whole number of cents.";
  if (cents < 0) return "Amount can't be negative.";
  if (!Number.isSafeInteger(cents)) return "Amount is too large to store exactly.";
  return null;
}

// -- Domain-level: whole-record validation before save/use ------------------

export function getMaterialValidationErrors(material: Pick<Material, "name" | "unitCostCents">): string[] {
  const errors: string[] = [];
  if (!material.name.trim()) errors.push("Material name is required.");
  const costError = validateMoneyCentsValue(material.unitCostCents);
  if (costError) errors.push(`Unit cost: ${costError}`);
  return errors;
}

export function getEquipmentValidationErrors(equipment: Pick<Equipment, "name" | "rateCents">): string[] {
  const errors: string[] = [];
  if (!equipment.name.trim()) errors.push("Equipment name is required.");
  const rateError = validateMoneyCentsValue(equipment.rateCents);
  if (rateError) errors.push(`Rate: ${rateError}`);
  return errors;
}

/**
 * Full domain-level check for a reusable Assembly (service) — covers every
 * Catalog field an estimate actually reads: material/equipment usage
 * quantities, the active labor mode's own input (person-hours-per-unit or
 * production rate — whichever mode is selected, never both), other cost per
 * unit, and the optional current selling rate used by Service Rate Health.
 * An assembly failing this must not be saved, and evaluateProject/
 * buildQuoteRevision must not consume it (getQuoteBlockingErrors in
 * estimateMath.ts skips/flags service lines whose assembly can't be found —
 * the caller is responsible for never letting an invalid assembly be saved
 * in the first place, which this function exists to enforce).
 */
export function getAssemblyValidationErrors(assembly: Assembly): string[] {
  const errors: string[] = [];
  if (!assembly.name.trim()) errors.push("Service name is required.");

  for (const line of assembly.materials) {
    const error = validateQuantity(line.quantityPerUnit);
    if (error) errors.push(`Material quantity per unit: ${error}`);
  }
  for (const line of assembly.equipment) {
    const error = validateQuantity(line.quantityPerUnit);
    if (error) errors.push(`Equipment usage per unit: ${error}`);
  }

  if (assembly.laborInputMode === "person-hours-per-unit") {
    const error = validatePersonHoursPerUnit(assembly.laborPersonHoursPerUnit);
    if (error) errors.push(`Person-hours per unit: ${error}`);
  } else if (assembly.laborInputMode === "production-rate") {
    const error = validateProductionRate(assembly.laborProductionRate ?? NaN);
    if (error) errors.push(`Production rate: ${error}`);
  }

  const otherCostError = validateMoneyCentsValue(assembly.otherCostPerUnitCents);
  if (otherCostError) errors.push(`Other cost per unit: ${otherCostError}`);

  if (assembly.currentRateCents !== undefined) {
    const currentRateError = validateMoneyCentsValue(assembly.currentRateCents);
    if (currentRateError) errors.push(`Current selling rate: ${currentRateError}`);
  }

  return errors;
}

export function getProjectLaborLineValidationErrors(line: Pick<ProjectLaborLine, "crewSize" | "elapsedHours" | "loadedRateCents">): string[] {
  const errors: string[] = [];
  const crewSizeError = validateCrewSize(line.crewSize);
  if (crewSizeError) errors.push(`Crew size: ${crewSizeError}`);
  const elapsedHoursError = validateElapsedHours(line.elapsedHours);
  if (elapsedHoursError) errors.push(`Elapsed hours: ${elapsedHoursError}`);
  const rateError = validateMoneyCentsValue(line.loadedRateCents);
  if (rateError) errors.push(`Loaded rate: ${rateError}`);
  return errors;
}

/** Every recorded actual cost/hours field for a completed job — reject a
 * negative or non-finite entry rather than letting it silently corrupt
 * profitability and variance reporting. */
export function getActualsValidationErrors(
  actual: Pick<ProjectActuals, "actualMaterialsCostCents" | "actualEquipmentCostCents" | "actualDeliveryCostCents" | "actualOtherCostCents" | "actualLaborPersonHours">
): string[] {
  const errors: string[] = [];
  const centsFields: [string, number][] = [
    ["Actual materials cost", actual.actualMaterialsCostCents],
    ["Actual equipment cost", actual.actualEquipmentCostCents],
    ["Actual delivery cost", actual.actualDeliveryCostCents],
    ["Actual other cost", actual.actualOtherCostCents],
  ];
  for (const [label, value] of centsFields) {
    const error = validateMoneyCentsValue(value);
    if (error) errors.push(`${label}: ${error}`);
  }
  const hoursError = validateQuantity(actual.actualLaborPersonHours);
  if (hoursError) errors.push(`Actual labor hours: ${hoursError}`);
  return errors;
}
