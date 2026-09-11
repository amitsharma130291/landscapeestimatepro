/**
 * Unit-relationship classifier for the Assembly editor (DEF-08 fix).
 *
 * This module NEVER validates, blocks, or corrects anything. `quantityPerUnit`
 * (entered by the contractor on an AssemblyMaterialLine/AssemblyEquipmentLine)
 * remains the single source of truth for how much of a resource an assembly
 * consumes — this module only describes, for the UI's benefit, how a
 * resource's own unit relates to the assembly's output unit, so a mismatch
 * can be surfaced instead of silently ignored. Nothing here rejects a save,
 * clamps a number, or fabricates a "converted" quantityPerUnit.
 *
 * Pure, dependency-free — no React, no app types imported (works on the raw
 * unit strings so it can classify both MaterialUnit and EquipmentRateType
 * values without a circular import on types.ts).
 */

/**
 * The physical dimension a concrete unit string belongs to. Two units in
 * different dimensions can never have an automatic conversion — that's a
 * structural fact about the physical world, not a missing feature.
 *
 * "ton", "bag", and "pallet" are each their OWN dimension (not one shared
 * "discrete-packaging" bucket) because a ton and a bag are not
 * interconvertible without a material-specific density/count fact this app
 * doesn't have (a "bag" of mulch and a "bag" of gravel don't weigh the same,
 * and neither does a "pallet"). Treating them as the same dimension would
 * silently claim a relationship that isn't universally true.
 */
export type UnitDimension =
  | "area"
  | "volume"
  | "length"
  | "count"
  | "discrete-packaging:ton"
  | "discrete-packaging:bag"
  | "discrete-packaging:pallet"
  | "time"
  | "job"
  | "custom";

/**
 * Maps every concrete unit string (MaterialUnit or EquipmentRateType) to its
 * physical dimension category. Falls back to "custom" for any unrecognized
 * string (defensive — should not happen for a value that actually came from
 * MaterialUnit/EquipmentRateType, but this function takes a bare `string` so
 * it never throws on unexpected input).
 */
export function classifyUnitDimension(unit: string): UnitDimension {
  switch (unit) {
    case "sqft":
      return "area";
    case "yd3":
    case "ft3":
      return "volume";
    case "linear-ft":
      return "length";
    case "each":
      return "count";
    case "ton":
      return "discrete-packaging:ton";
    case "bag":
      return "discrete-packaging:bag";
    case "pallet":
      return "discrete-packaging:pallet";
    case "hour":
    case "day":
      return "time";
    case "job":
      return "job";
    case "custom":
      return "custom";
    default:
      return "custom";
  }
}

/** One universal, always-true physical conversion this app is willing to
 * state as fact. Deliberately NOT a general unit-conversion table — see the
 * module-level and KNOWN_CONVERSIONS doc comments for why hour<->day and any
 * discrete-packaging pair are excluded. */
export interface KnownConversion {
  factor: number;
  fromUnit: string;
  toUnit: string;
  description: string;
}

/**
 * The ONLY unit pairs this app knows a safe, universal physical conversion
 * for. Keep this list short and only include facts that are true by
 * definition (not business convention). 1 yd³ = 27 ft³ is always true
 * everywhere, for everything — that's why it's here. By contrast, 1 "day" =
 * 8 or 24 "hours" depends on the contractor's own workday convention, so
 * hour<->day is deliberately NOT in this table (see "ambiguous" below).
 */
const KNOWN_CONVERSIONS: KnownConversion[] = [
  { factor: 27, fromUnit: "yd3", toUnit: "ft3", description: "1 yd³ = 27 ft³" },
];

/**
 * Looks up the known conversion between two units, in either direction.
 * Returns null when no universal factor is known for this pair — this is
 * the common case, and callers must never fabricate a factor when this
 * returns null.
 */
export function findKnownConversion(unitA: string, unitB: string): KnownConversion | null {
  if (unitA === unitB) return null;
  for (const conversion of KNOWN_CONVERSIONS) {
    if (conversion.fromUnit === unitA && conversion.toUnit === unitB) return conversion;
    if (conversion.fromUnit === unitB && conversion.toUnit === unitA) {
      return {
        factor: 1 / conversion.factor,
        fromUnit: unitB,
        toUnit: unitA,
        description: conversion.description,
      };
    }
  }
  return null;
}

/**
 * How a resource's unit (a Material's `unit` or an Equipment's `rateType`)
 * relates to the assembly's own output unit. Never carries a "converted
 * value" — only describes the relationship, so the UI can decide what
 * label/hint/warning to show. The caller's `quantityPerUnit` is never read
 * or touched by this module.
 */
export type UnitRelationship =
  | { kind: "same-unit" }
  | { kind: "known-conversion"; conversion: KnownConversion }
  | { kind: "ambiguous"; reason: string }
  | { kind: "incompatible"; resourceDimension: UnitDimension; assemblyDimension: UnitDimension };

/**
 * The single entry point the UI calls: how does `resourceUnit` (a material's
 * unit or an equipment's rate type) relate to `assemblyUnit` (the assembly's
 * own output unit)? Purely descriptive — see the module doc comment.
 */
export function describeUnitRelationship(resourceUnit: string, assemblyUnit: string): UnitRelationship {
  if (resourceUnit === assemblyUnit) return { kind: "same-unit" };

  if (resourceUnit === "custom" || assemblyUnit === "custom") {
    return {
      kind: "ambiguous",
      reason: "A custom unit's real-world meaning isn't known to this app, so it can't be compared to another unit.",
    };
  }

  const conversion = findKnownConversion(resourceUnit, assemblyUnit);
  if (conversion) return { kind: "known-conversion", conversion };

  const resourceDimension = classifyUnitDimension(resourceUnit);
  const assemblyDimension = classifyUnitDimension(assemblyUnit);

  if (resourceDimension === assemblyDimension) {
    // Same broad dimension family, but no safe universal factor was found
    // above (e.g. "hour" vs "day" — both "time", but the hours-per-day
    // convention is the contractor's own, not a physical constant).
    return {
      kind: "ambiguous",
      reason: `Both are ${resourceDimension} units, but this app doesn't have a fixed conversion between them.`,
    };
  }

  return { kind: "incompatible", resourceDimension, assemblyDimension };
}
