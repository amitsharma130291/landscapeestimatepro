/**
 * Pure, unit-tested calculation engine for Landscape Estimate Pro.
 *
 * No CRM/scheduling/engineering logic lives here — only quantity, cost, and
 * pricing math: materials → labor → equipment → overhead → true cost →
 * target margin → required selling price.
 *
 * Every internal calculation runs through Decimal.js (arbitrary-precision)
 * rather than raw IEEE-754 doubles, so repeated percentage/division chains
 * (overhead %, margin %, per-unit rates) never accumulate floating-point
 * drift. Public function signatures are unchanged — every function still
 * accepts and returns plain `number`.
 */
import Decimal from "decimal.js";
import type {
  DirectLaborInput,
  LaborInput,
  LaborResult,
  ProjectCostInputs,
  ProjectCostResult,
} from "./types";

/** Clamp NaN/Infinity/negative to 0 — financially conservative: a bad input
 * never becomes a negative cost or an exploded price, it just contributes
 * nothing until the contractor fixes it. */
function safeD(n: number): Decimal {
  if (!Number.isFinite(n) || n < 0) return new Decimal(0);
  return new Decimal(n);
}

export function safe(n: number): number {
  return safeD(n).toNumber();
}

/** Percent input (e.g. 35 for 35%) → Decimal fraction (0.35), clamped to [0, 100]. */
function percentToFraction(percent: number): Decimal {
  if (!Number.isFinite(percent)) return new Decimal(0);
  const clamped = Math.min(Math.max(percent, 0), 100);
  return new Decimal(clamped).dividedBy(100);
}

// -- Labor ----------------------------------------------------------------

export function calculateLabor(input: LaborInput): LaborResult {
  const rate = safeD(input.loadedRate);

  if (input.mode === "direct") {
    const { crewSize, hours } = input as DirectLaborInput;
    const personHours = safeD(crewSize).times(safeD(hours));
    return {
      personHours: personHours.toNumber(),
      laborCost: personHours.times(rate).toNumber(),
    };
  }

  // Production-rate mode: person-hours = quantity ÷ production rate.
  // The contractor supplies the production rate — this engine never assumes one.
  const quantity = safeD(input.quantity);
  const rateOfWork = safeD(input.productionRate);
  if (rateOfWork.isZero()) {
    return { personHours: 0, laborCost: 0 };
  }
  const personHours = quantity.dividedBy(rateOfWork);
  return {
    personHours: personHours.toNumber(),
    laborCost: personHours.times(rate).toNumber(),
  };
}

// -- Direct cost → true cost ------------------------------------------------

export function calculateProjectCost(inputs: ProjectCostInputs): ProjectCostResult {
  const materials = safeD(inputs.materialsCost);
  const labor = safeD(inputs.laborCost);
  const equipment = safeD(inputs.equipmentCost);
  const delivery = safeD(inputs.deliveryCost);
  const other = safeD(inputs.otherCost);

  const directCost = materials.plus(labor).plus(equipment).plus(delivery).plus(other);
  const overheadFraction = percentToFraction(inputs.overheadPercent);
  const overheadAmount = directCost.times(overheadFraction);
  const trueCost = directCost.plus(overheadAmount);

  return {
    directCost: directCost.toNumber(),
    overheadAmount: overheadAmount.toNumber(),
    trueCost: trueCost.toNumber(),
  };
}

// -- Margin vs markup vs required price --------------------------------------

/**
 * Margin = (price − cost) ÷ price.
 * Returns `null` (not 0) when sellingPrice is 0/unset — "unpriced" is a
 * distinct state from "0% margin" and callers should treat it that way
 * (e.g. suppress a below-target warning rather than falsely flagging it).
 */
export function calculateMargin(sellingPrice: number, trueCost: number): number | null {
  const price = safeD(sellingPrice);
  if (price.isZero()) return null;
  const cost = safeD(trueCost);
  return price.minus(cost).dividedBy(price).times(100).toNumber();
}

/** Markup = (price − cost) ÷ cost. Returns `null` when trueCost is 0/unset. */
export function calculateMarkup(sellingPrice: number, trueCost: number): number | null {
  const cost = safeD(trueCost);
  if (cost.isZero()) return null;
  const price = safeD(sellingPrice);
  return price.minus(cost).dividedBy(cost).times(100).toNumber();
}

/**
 * Required selling price so that margin (profit ÷ price) equals the target —
 * NOT the same as cost × (1 + target). A target margin of 100% is undefined
 * (division by zero) and is clamped to 99.99% to avoid Infinity.
 */
export function calculateRequiredSellingPrice(trueCost: number, targetMarginPercent: number): number {
  const cost = safeD(trueCost);
  const clampedMargin = Math.min(Math.max(targetMarginPercent, 0), 99.99);
  const remainder = new Decimal(1).minus(percentToFraction(clampedMargin));
  if (remainder.isZero()) return 0;
  return cost.dividedBy(remainder).toNumber();
}

/** Price that applies a flat markup to cost: price = cost × (1 + markup%). */
export function calculatePriceFromMarkup(trueCost: number, markupPercent: number): number {
  const cost = safeD(trueCost);
  const factor = new Decimal(1).plus(percentToFraction(markupPercent));
  return cost.times(factor).toNumber();
}

/** Round a display price according to the contractor's rounding preference. */
export function roundDisplayPrice(value: number, roundTo: "dollar" | "cent" = "dollar"): number {
  const v = safeD(value);
  if (roundTo === "cent") return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  return v.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

// -- Quote pricing (rounded true cost → required price) ---------------------

export interface QuotePricing {
  /** True cost rounded to the contractor's display precision — this is the
   * figure the price is actually solved from, since overhead is already an
   * allocation/estimate and carrying fractional cents into a customer quote
   * is false precision. */
  trueCostRounded: number;
  /** Required selling price to hit the target margin, to the cent. */
  requiredSellingPrice: number;
  /** Required selling price rounded to the contractor's display precision. */
  displayPrice: number;
  expectedGrossProfit: number;
  effectiveMargin: number | null;
}

export function calculateQuotePricing(
  trueCost: number,
  targetMarginPercent: number,
  roundTo: "dollar" | "cent" = "dollar"
): QuotePricing {
  const trueCostRounded = roundDisplayPrice(trueCost, roundTo);
  const requiredSellingPriceExact = calculateRequiredSellingPrice(trueCostRounded, targetMarginPercent);
  const requiredSellingPrice = roundDisplayPrice(requiredSellingPriceExact, "cent");
  const displayPrice = roundDisplayPrice(requiredSellingPriceExact, roundTo);
  const expectedGrossProfit = safe(displayPrice - trueCostRounded);
  const effectiveMargin = calculateMargin(displayPrice, trueCostRounded);

  return { trueCostRounded, requiredSellingPrice, displayPrice, expectedGrossProfit, effectiveMargin };
}

// -- Formatting -------------------------------------------------------------

export function formatCurrency(value: number, opts?: { cents?: boolean }): string {
  const v = safe(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  }).format(v);
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatUnitLabel(unit: string, customLabel?: string): string {
  if (unit === "custom") return customLabel?.trim() || "unit";
  const labels: Record<string, string> = {
    each: "each",
    sqft: "sq ft",
    "linear-ft": "linear ft",
    yd3: "yd³",
    ton: "ton",
    bag: "bag",
    pallet: "pallet",
    hour: "hour",
    job: "job",
  };
  return labels[unit] ?? unit;
}
