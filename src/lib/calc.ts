/**
 * Pure, unit-tested calculation engine for Landscape Estimate Pro.
 *
 * No CRM/scheduling/engineering logic lives here — only quantity, cost, and
 * pricing math: materials → labor → equipment → overhead → true cost →
 * target margin → required selling price.
 *
 * Every money value that enters or leaves this module is an integer number
 * of cents (`MoneyCents`, from `money.ts`) — never a floating-point dollar
 * amount. Every internal calculation runs through Decimal.js
 * (arbitrary-precision), and money is rounded only at the explicit
 * boundaries documented on each function; nothing here divides or
 * multiplies a percent by 100 except `percentToFraction`/`fractionToPercent`
 * below — no other function in this codebase should do that inline.
 */
import Decimal from "decimal.js";
import { fromDecimalToCents, roundUpCentsToIncrement, safe as safeCents, type DecimalRate, type MoneyCents } from "./money";
import type { DirectLaborInput, LaborInput, LaborResult, ProjectCostInputsCents, ProjectCostResultCents, RoundingIncrementCents } from "./types";

/** Clamp NaN/Infinity/negative to 0 — financially conservative: a bad input
 * never becomes a negative cost or an exploded price, it just contributes
 * nothing until the contractor fixes it. Used for plain quantities/rates;
 * money values should go through `money.ts`'s own guards instead. */
function safeD(n: number): Decimal {
  if (!Number.isFinite(n) || n < 0) return new Decimal(0);
  return new Decimal(n);
}

export function safe(n: number): number {
  return safeD(n).toNumber();
}

// -- Percent ⇄ decimal-fraction conversion — THE canonical conversion point -

/**
 * Every percent field in this codebase (`targetMarginPercent`,
 * `overheadPercent`, `taxRatePercent`, ...) is a WHOLE NUMBER — 35 means
 * 35%, never 0.35 — this is the persisted `PercentValue` representation (see
 * `types.ts`). This is the ONLY function that turns one of those into a
 * `DecimalRate` (a branded, normalized 0–1 fraction) for use in a
 * calculation; no other function in this codebase should divide a percent
 * by 100 inline, and no function that does rate math should accept a plain
 * `Decimal`/`number` rate — see `DecimalRate`'s doc comment in `money.ts`.
 * Clamped to [0, 100] — NaN/Infinity become 0.
 */
export function percentToFraction(percent: number): DecimalRate {
  if (!Number.isFinite(percent)) return new Decimal(0) as DecimalRate;
  const clamped = Math.min(Math.max(percent, 0), 100);
  return new Decimal(clamped).dividedBy(100) as DecimalRate;
}

/** The inverse of `percentToFraction` — a normalized 0–1 rate back to a
 * whole-number percent (0.35 → 35). The ONLY function that multiplies a
 * rate by 100 inline. Accepts a plain `Decimal`/`number` too (not just
 * `DecimalRate`) since it's also used to report a plain ratio that was
 * never itself derived from a persisted percent field (e.g. a
 * margin/markup conversion) — the ambiguity `DecimalRate` guards against is
 * one-directional (a raw percent silently used as a fraction), not this. */
export function fractionToPercent(fraction: Decimal | number): number {
  const d = fraction instanceof Decimal ? fraction : new Decimal(fraction);
  return d.times(100).toNumber();
}

// -- Labor ----------------------------------------------------------------

export function calculateLabor(input: LaborInput): LaborResult {
  const rate = new Decimal(safeCents(input.loadedRateCents));

  if (input.mode === "direct") {
    const { crewSize, hours } = input as DirectLaborInput;
    const personHours = safeD(crewSize).times(safeD(hours));
    return {
      personHours: personHours.toNumber(),
      laborCostCents: fromDecimalToCents(personHours.times(rate)),
    };
  }

  // Production-rate mode: person-hours = quantity ÷ production rate.
  // The contractor supplies the production rate — this engine never assumes one.
  const quantity = safeD(input.quantity);
  const rateOfWork = safeD(input.productionRate);
  if (rateOfWork.isZero()) {
    return { personHours: 0, laborCostCents: 0 as MoneyCents };
  }
  const personHours = quantity.dividedBy(rateOfWork);
  return {
    personHours: personHours.toNumber(),
    laborCostCents: fromDecimalToCents(personHours.times(rate)),
  };
}

/**
 * Resolves an assembly's per-unit labor figure from its explicit input mode.
 * The two per-unit modes are exact reciprocals of each other — this is the
 * ONLY place that conversion happens, and it never invents a value from a
 * zero or invalid input (returns `null` instead, so the caller can show a
 * validation error rather than silently storing a wrong number).
 */
export function resolvePersonHoursPerUnit(
  mode: "production-rate" | "person-hours-per-unit",
  productionRate: number | undefined,
  personHoursPerUnit: number | undefined
): number | null {
  if (mode === "person-hours-per-unit") {
    if (personHoursPerUnit === undefined || !Number.isFinite(personHoursPerUnit) || personHoursPerUnit < 0) return null;
    return personHoursPerUnit;
  }
  // production-rate mode: person-hours-per-unit = 1 ÷ production rate.
  if (productionRate === undefined || !Number.isFinite(productionRate) || productionRate <= 0) return null;
  return new Decimal(1).dividedBy(productionRate).toNumber();
}

// -- Direct cost → true cost ------------------------------------------------

export function calculateProjectCostCents(inputs: ProjectCostInputsCents): ProjectCostResultCents {
  const materials = new Decimal(safeCents(inputs.materialsCostCents));
  const labor = new Decimal(safeCents(inputs.laborCostCents));
  const equipment = new Decimal(safeCents(inputs.equipmentCostCents));
  const delivery = new Decimal(safeCents(inputs.deliveryCostCents));
  const other = new Decimal(safeCents(inputs.otherCostCents));

  const directCost = materials.plus(labor).plus(equipment).plus(delivery).plus(other);
  const overheadFraction = percentToFraction(inputs.overheadPercent);
  const overheadAmount = directCost.times(overheadFraction);
  const trueCost = directCost.plus(overheadAmount);

  return {
    directCostCents: fromDecimalToCents(directCost),
    overheadAmountCents: fromDecimalToCents(overheadAmount),
    trueCostCents: fromDecimalToCents(trueCost),
  };
}

// -- Margin vs markup vs required price --------------------------------------

/**
 * Margin = (price − cost) ÷ price. Unit-invariant — works identically
 * whether `sellingPriceCents`/`trueCostCents` are cents or dollars, as long
 * as both arguments share the same unit (this app always passes cents).
 * Returns `null` (not 0) when sellingPriceCents is 0/unset — "unpriced" is a
 * distinct state from "0% margin" and callers should treat it that way
 * (e.g. suppress a below-target warning rather than falsely flagging it).
 */
export function calculateMargin(sellingPriceCents: number, trueCostCents: number): number | null {
  const price = safeD(sellingPriceCents);
  if (price.isZero()) return null;
  const cost = safeD(trueCostCents);
  return fractionToPercent(price.minus(cost).dividedBy(price));
}

/** Markup = (price − cost) ÷ cost. Returns `null` when trueCostCents is
 * 0/unset. Unit-invariant, same as calculateMargin. */
export function calculateMarkup(sellingPriceCents: number, trueCostCents: number): number | null {
  const cost = safeD(trueCostCents);
  if (cost.isZero()) return null;
  const price = safeD(sellingPriceCents);
  return fractionToPercent(price.minus(cost).dividedBy(cost));
}

/**
 * Required selling price (in cents) so that margin (profit ÷ price) equals
 * the target — NOT the same as cost × (1 + target). Returns the UNROUNDED
 * exact Decimal — money is rounded only at an explicit boundary, and this
 * value must stay exact until `roundUpCentsToIncrement` (for the customer
 * price) or a one-time HALF-UP rounding (for reporting-only display) is
 * applied by the caller. A target margin of 100% or more is mathematically
 * undefined (it would require an infinite price) and returns `null` — a
 * genuine blocked state, never silently clamped to something-close-enough.
 */
export function calculateExactRequiredPriceCentsDecimal(trueCostCents: number, targetMarginPercent: number): Decimal | null {
  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 100) return null;
  const cost = safeD(trueCostCents);
  const remainder = new Decimal(1).minus(percentToFraction(targetMarginPercent));
  return cost.dividedBy(remainder);
}

/** Reporting-only convenience over `calculateExactRequiredPriceCentsDecimal`
 * — rounds HALF-UP to a whole cent so it can be stored/displayed as a
 * `MoneyCents` integer (e.g. Service Rate Health's "required rate", the
 * Minimum Job Audit). Never used to derive `roundedRecommendedPriceCents`
 * on an actual quote — that always ceiling-rounds the unrounded Decimal
 * directly; see `calculateQuotePricingCents`. */
export function calculateRequiredPriceCents(trueCostCents: number, targetMarginPercent: number): MoneyCents | null {
  const exact = calculateExactRequiredPriceCentsDecimal(trueCostCents, targetMarginPercent);
  if (exact === null) return null;
  return fromDecimalToCents(exact);
}

/** Converts a margin percent to the equivalent markup percent (same price,
 * same cost — just expressed against the other base). A 35% margin is a
 * ~53.85% markup: markup = margin ÷ (1 − margin). Returns `null` (not
 * Infinity) at exactly 100% margin, since no finite markup produces a
 * 100%-margin price — this is a genuine division-by-zero boundary, not one
 * to silently clamp away. */
export function markupFromMargin(marginPercent: number): number | null {
  const fraction = percentToFraction(marginPercent);
  const remainder = new Decimal(1).minus(fraction);
  if (remainder.isZero()) return null;
  return fractionToPercent(fraction.dividedBy(remainder));
}

/** Converts a markup percent to the equivalent margin percent:
 * margin = markup ÷ (1 + markup). */
export function marginFromMarkup(markupPercent: number): number {
  const fraction = percentToFraction(markupPercent);
  return fractionToPercent(fraction.dividedBy(new Decimal(1).plus(fraction)));
}

/** Price (in cents) that applies a flat markup to cost: price = cost × (1 +
 * markup%). Rounded HALF-UP to the nearest cent — a reporting/comparison
 * figure (e.g. "what would a flat markup have produced"), not part of the
 * quote-pricing chain. */
export function calculatePriceFromMarkupCents(trueCostCents: number, markupPercent: number): MoneyCents {
  const cost = safeD(trueCostCents);
  const factor = new Decimal(1).plus(percentToFraction(markupPercent));
  return fromDecimalToCents(cost.times(factor));
}

// -- Quote pricing (exact true cost → required price, rounded UP) -----------

export interface QuotePricingCents {
  /** True cost, rounded to the nearest cent for reporting — never
   * pre-rounded before this point in the calculation chain. */
  exactTrueCostCents: MoneyCents;
  /** Required selling price, rounded HALF-UP to the nearest cent for
   * reporting only — see calculateRequiredPriceCents. `null` when
   * targetMarginPercent is invalid (≥100% or negative). When null, every
   * other field here is also null: there is no price to round, no profit,
   * and no achieved margin. */
  exactRequiredPriceCents: MoneyCents | null;
  /** The UNROUNDED required price, ceiling-rounded directly to the chosen
   * increment — the system's recommendation, NOT necessarily what the
   * contractor actually charges. See QuoteRevision for actualQuotedPrice. */
  roundedRecommendedPriceCents: MoneyCents | null;
  /** roundedRecommendedPriceCents − exactTrueCostCents. */
  expectedGrossProfitCents: MoneyCents | null;
  /** The margin actually achieved at roundedRecommendedPriceCents against
   * the exact true cost — recomputed from the rounded price, not assumed to
   * equal the target (rounding up means this is always ≥ the target). */
  achievedMargin: number | null;
}

export function calculateQuotePricingCents(
  trueCostCents: number,
  targetMarginPercent: number,
  roundingIncrementCents: RoundingIncrementCents = 100
): QuotePricingCents {
  const exactTrueCostCents = safeCents(trueCostCents);
  const exactRequiredDecimal = calculateExactRequiredPriceCentsDecimal(exactTrueCostCents, targetMarginPercent);
  if (exactRequiredDecimal === null) {
    return {
      exactTrueCostCents,
      exactRequiredPriceCents: null,
      roundedRecommendedPriceCents: null,
      expectedGrossProfitCents: null,
      achievedMargin: null,
    };
  }
  const exactRequiredPriceCents = fromDecimalToCents(exactRequiredDecimal);
  const roundedRecommendedPriceCents = roundUpCentsToIncrement(exactRequiredDecimal, roundingIncrementCents as MoneyCents);
  const expectedGrossProfitCents = safeCents(roundedRecommendedPriceCents - exactTrueCostCents);
  const achievedMargin = calculateMargin(roundedRecommendedPriceCents, exactTrueCostCents);

  return { exactTrueCostCents, exactRequiredPriceCents, roundedRecommendedPriceCents, expectedGrossProfitCents, achievedMargin };
}

// -- Exact pricing chain (no premature rounding before the ceiling step) ----

/**
 * The single authoritative path from direct-cost inputs to a customer-facing
 * price. Unlike `calculateProjectCostCents` + `calculateQuotePricingCents`
 * chained together, this never rounds `overheadAmount` or `trueCost` to a
 * whole cent before dividing by the margin remainder — a `MoneyCents`
 * (integer) `trueCostCents` is a valid ACCOUNTING figure, but overhead
 * (`directCost × overheadFraction`) and the resulting true cost can be
 * genuinely fractional-cent values in exact arithmetic, and rounding them to
 * an integer before computing the required price throws away real precision
 * the ceiling-rounding step needs — it can shift `roundedRecommendedPriceCents`
 * by a whole increment and, at the boundary, let the achieved margin fall
 * fractionally short of target. Every quote-pricing call site in this app
 * (evaluateProject, buildQuoteRevision, and the marketing calculators) must
 * go through this function, not the two-step legacy path.
 */
export interface ExactPricingChainCents {
  /** Sum of already-integer inputs — exact, no rounding needed. */
  directCostCents: MoneyCents;
  /** Unrounded overhead, for chaining into further exact math — never persist
   * or display this directly; round to `overheadAmountCents` first. */
  exactOverheadAmountCentsDecimal: Decimal;
  /** Overhead rounded HALF-UP to the nearest cent, for reporting/storage only. */
  overheadAmountCents: MoneyCents;
  /** Unrounded true cost (`directCost + exact overhead`) — the value the
   * required-price division must use, never the rounded `trueCostCents`. */
  exactTrueCostCentsDecimal: Decimal;
  /** True cost rounded HALF-UP to the nearest cent, for reporting/storage only. */
  trueCostCents: MoneyCents;
  /** Unrounded required price, computed from the UNROUNDED true cost —
   * `null` when `targetMarginPercent` is invalid (≥100% or negative). */
  exactRequiredPriceCentsDecimal: Decimal | null;
  /** Required price rounded HALF-UP to the nearest cent, for reporting only —
   * never used to derive `roundedRecommendedPriceCents` below. */
  exactRequiredPriceCents: MoneyCents | null;
  /** The customer-facing recommendation: `exactRequiredPriceCentsDecimal`
   * ceiling-rounded DIRECTLY to the rounding increment — never derived from
   * `exactRequiredPriceCents` or `trueCostCents` (both already-rounded
   * reporting figures). This is the only price a locked quote may use. */
  roundedRecommendedPriceCents: MoneyCents | null;
  /** `roundedRecommendedPriceCents − exactTrueCostCentsDecimal`, rounded
   * HALF-UP — computed from the exact true cost so a fractional cent of
   * overhead isn't silently dropped from the profit figure either. */
  expectedGrossProfitCents: MoneyCents | null;
  /** Margin actually achieved at `roundedRecommendedPriceCents` against the
   * rounded `trueCostCents` — always ≥ target, since ceiling rounding from
   * the exact (unrounded) required price can only push the price up. */
  achievedMargin: number | null;
}

export function calculateExactPricingChainCents(
  inputs: ProjectCostInputsCents,
  targetMarginPercent: number,
  roundingIncrementCents: RoundingIncrementCents = 100
): ExactPricingChainCents {
  const materials = new Decimal(safeCents(inputs.materialsCostCents));
  const labor = new Decimal(safeCents(inputs.laborCostCents));
  const equipment = new Decimal(safeCents(inputs.equipmentCostCents));
  const delivery = new Decimal(safeCents(inputs.deliveryCostCents));
  const other = new Decimal(safeCents(inputs.otherCostCents));
  const directCostDecimal = materials.plus(labor).plus(equipment).plus(delivery).plus(other);
  const directCostCents = fromDecimalToCents(directCostDecimal); // exact — sum of integers

  const overheadFraction = percentToFraction(inputs.overheadPercent);
  const exactOverheadAmountCentsDecimal = directCostDecimal.times(overheadFraction);
  const exactTrueCostCentsDecimal = directCostDecimal.plus(exactOverheadAmountCentsDecimal);
  const overheadAmountCents = fromDecimalToCents(exactOverheadAmountCentsDecimal);
  const trueCostCents = fromDecimalToCents(exactTrueCostCentsDecimal);

  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 100) {
    return {
      directCostCents,
      exactOverheadAmountCentsDecimal,
      overheadAmountCents,
      exactTrueCostCentsDecimal,
      trueCostCents,
      exactRequiredPriceCentsDecimal: null,
      exactRequiredPriceCents: null,
      roundedRecommendedPriceCents: null,
      expectedGrossProfitCents: null,
      achievedMargin: null,
    };
  }

  const marginRemainder = new Decimal(1).minus(percentToFraction(targetMarginPercent));
  // Divides the UNROUNDED exact true cost — this is the fix: the old two-step
  // path rounded true cost to a whole cent first, here it stays exact.
  const exactRequiredPriceCentsDecimal = exactTrueCostCentsDecimal.dividedBy(marginRemainder);
  const exactRequiredPriceCents = fromDecimalToCents(exactRequiredPriceCentsDecimal);
  const roundedRecommendedPriceCents = roundUpCentsToIncrement(exactRequiredPriceCentsDecimal, roundingIncrementCents as MoneyCents);
  const expectedGrossProfitCents = fromDecimalToCents(new Decimal(roundedRecommendedPriceCents).minus(exactTrueCostCentsDecimal));
  const achievedMargin = calculateMargin(roundedRecommendedPriceCents, trueCostCents);

  return {
    directCostCents,
    exactOverheadAmountCentsDecimal,
    overheadAmountCents,
    exactTrueCostCentsDecimal,
    trueCostCents,
    exactRequiredPriceCentsDecimal,
    exactRequiredPriceCents,
    roundedRecommendedPriceCents,
    expectedGrossProfitCents,
    achievedMargin,
  };
}

/** Every increment a customer-facing quote can be rounded UP to, in cents —
 * drives the Settings tab's "Round quotes up to" dropdown. */
export const ROUNDING_INCREMENTS: RoundingIncrementCents[] = [1, 100, 500, 1000, 2500, 5000];

// -- Formatting -------------------------------------------------------------

export { formatCents as formatCurrency } from "./money";

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
    ft3: "ft³",
    ton: "ton",
    bag: "bag",
    pallet: "pallet",
    hour: "hour",
    job: "job",
  };
  return labels[unit] ?? unit;
}
