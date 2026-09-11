/**
 * Assembly, project-estimate, Service Rate Health, Minimum Job Audit,
 * quote-revision, cost-impact, and profitability math. Built on top of the
 * primitives in calc.ts — see that file for the core safe()/margin/
 * required-price rules this module relies on.
 *
 * Every money value in this module is an integer number of cents
 * (`MoneyCents`) — never a floating-point dollar amount. Draft previews
 * (`evaluateProject`) and locked quotes (`buildQuoteRevision`) share the
 * exact same roll-up, pricing, and revenue-allocation functions — there is
 * no separate approximate tax engine for drafts.
 */
import Decimal from "decimal.js";
import { calculateExactPricingChainCents, calculateExactRequiredPriceCentsDecimal, calculateMargin, fractionToPercent, percentToFraction, safe } from "./calc";
import { allocateCents, fromDecimalToCents, MoneyError, safe as safeCents, sumCents, type MoneyCents } from "./money";
import { getAssemblyValidationErrors, getEquipmentValidationErrors, getMaterialValidationErrors, getProjectLaborLineValidationErrors } from "./validation";
import type {
  Assembly,
  AssemblyCostResult,
  BusinessSettings,
  Equipment,
  LaborMode,
  Material,
  Project,
  ProjectActuals,
  ProjectEstimateResult,
  ProjectTemplate,
  QuoteRevision,
  QuoteRevisionEquipmentLine,
  QuoteRevisionLaborLine,
  QuoteRevisionServiceLine,
  RateHealthResult,
  RateHealthStatus,
  RevenueAllocationLine,
} from "./types";
import { QUOTE_REVISION_SCHEMA_VERSION } from "./types";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
 * a dump trailer per shrub) — the engine doesn't second-guess the ratio.
 * Returns cents, rounded HALF-UP (a fractional-quantity × cents-rate
 * product can produce a fractional cent, which must be resolved here). */
function equipmentUnitCostCents(equipment: Equipment, quantityPerUnit: number): MoneyCents {
  return fromDecimalToCents(new Decimal(safeCents(equipment.rateCents)).times(safeD(quantityPerUnit)));
}

/**
 * Resolve an assembly (materials + labor + equipment + other, per one unit)
 * into a fully-costed per-unit breakdown, given the current material/
 * equipment catalogs, the business's loaded labor rate, and the overhead
 * rate that applies to it.
 *
 * `trueCostPerUnitCents` on the result INCLUDES overhead — a prior version
 * of this function omitted overhead here and still called the result "true
 * cost," which understated every Service Rate Health required-rate figure.
 * `directCostPerUnitCents` is exposed separately for callers (like
 * evaluateProject's line roll-up) that must apply overhead exactly once at
 * the whole-project level, not per line — using `trueCostPerUnitCents`
 * there would double-count it.
 */
export function calculateAssemblyCost(
  assembly: Assembly,
  materials: Material[],
  equipment: Equipment[],
  loadedLaborRateCents: number,
  overheadPercent: number
): AssemblyCostResult {
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  let materialCost = new Decimal(0);
  for (const line of assembly.materials) {
    const material = materialById.get(line.materialId);
    if (!material) continue;
    materialCost = materialCost.plus(new Decimal(safeCents(material.unitCostCents)).times(safeD(line.quantityPerUnit)));
  }

  let equipmentCost = new Decimal(0);
  for (const line of assembly.equipment) {
    const item = equipmentById.get(line.equipmentId);
    if (!item) continue;
    equipmentCost = equipmentCost.plus(equipmentUnitCostCents(item, line.quantityPerUnit));
  }

  const laborCost = safeD(assembly.laborPersonHoursPerUnit).times(new Decimal(safeCents(loadedLaborRateCents)));
  const otherCost = new Decimal(safeCents(assembly.otherCostPerUnitCents));
  const directCostPerUnit = materialCost.plus(laborCost).plus(equipmentCost).plus(otherCost);
  const overheadFraction = percentToFraction(overheadPercent);
  const overheadPerUnit = directCostPerUnit.times(overheadFraction);
  const trueCostPerUnit = directCostPerUnit.plus(overheadPerUnit);

  return {
    materialCostPerUnitCents: fromDecimalToCents(materialCost),
    laborCostPerUnitCents: fromDecimalToCents(laborCost),
    equipmentCostPerUnitCents: fromDecimalToCents(equipmentCost),
    otherCostPerUnitCents: fromDecimalToCents(otherCost),
    directCostPerUnitCents: fromDecimalToCents(directCostPerUnit),
    overheadPerUnitCents: fromDecimalToCents(overheadPerUnit),
    trueCostPerUnitCents: fromDecimalToCents(trueCostPerUnit),
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
 *  - invalid: the target margin itself is ≥100%/negative — no required rate
 *    can be computed, so health can't be assessed (never silently guessed).
 *
 * `trueCostPerUnitCents` here MUST already include overhead — pass
 * calculateAssemblyCost's `trueCostPerUnitCents`, not `directCostPerUnitCents`.
 */
export function evaluateRateHealth(trueCostPerUnitCents: number, currentRateCents: number, targetMarginPercent: number): RateHealthResult {
  const requiredExact = calculateExactRequiredPriceCentsDecimal(trueCostPerUnitCents, targetMarginPercent);
  const currentMargin = calculateMargin(currentRateCents, trueCostPerUnitCents);

  if (requiredExact === null) {
    return {
      trueCostPerUnitCents: safeCents(trueCostPerUnitCents),
      currentRateCents: safeCents(currentRateCents),
      currentMargin,
      requiredRateCents: null,
      gapPerUnitCents: null,
      status: "invalid",
    };
  }

  const requiredRateCents = fromDecimalToCents(requiredExact);
  const gapPerUnitCents = requiredRateCents - safeCents(currentRateCents);
  let status: RateHealthStatus = "healthy";
  if (gapPerUnitCents > 0 && requiredRateCents > 0) {
    const gapPercentOfRequired = (gapPerUnitCents / requiredRateCents) * 100;
    status = gapPercentOfRequired > 15 ? "critical" : "attention";
  }

  return {
    trueCostPerUnitCents: safeCents(trueCostPerUnitCents),
    currentRateCents: safeCents(currentRateCents),
    currentMargin,
    requiredRateCents,
    gapPerUnitCents,
    status,
  };
}

export interface MinimumJobAuditResult {
  currentMinimumCents: MoneyCents;
  typicalTrueCostCents: MoneyCents;
  currentMargin: number | null;
  requiredMinimumCents: MoneyCents | null;
  isBelowTarget: boolean;
}

/**
 * `typicalTrueCostCents` must be one explicit representative job cost the
 * contractor designates (BusinessSettings.representativeMinimumJobTrueCostCents),
 * never the average true cost across every saved project — averaging in a
 * handful of large jobs silently inflates what "typical small job" means and
 * defeats the point of a minimum-price floor. See RateHealthTab, which
 * surfaces "insufficient data" rather than falling back to an average when
 * the contractor hasn't set one.
 */
export function evaluateMinimumJob(currentMinimumCents: number, typicalTrueCostCents: number, targetMarginPercent: number): MinimumJobAuditResult {
  const currentMargin = calculateMargin(currentMinimumCents, typicalTrueCostCents);
  const requiredExact = calculateExactRequiredPriceCentsDecimal(typicalTrueCostCents, targetMarginPercent);
  const requiredMinimumCents = requiredExact === null ? null : fromDecimalToCents(requiredExact);
  return {
    currentMinimumCents: safeCents(currentMinimumCents),
    typicalTrueCostCents: safeCents(typicalTrueCostCents),
    currentMargin,
    requiredMinimumCents,
    isBelowTarget: currentMargin !== null && currentMargin < targetMarginPercent,
  };
}

/** Whether a project line counts toward taxable revenue. Undefined is
 * treated as taxable — the historical default before per-line tax status
 * existed, and the common case (most lines on most quotes are taxable). */
function isTaxable(taxable: boolean | undefined): boolean {
  return taxable ?? true;
}

interface RevenueRow {
  key: string;
  label: string;
  taxable: boolean;
  directCostCents: MoneyCents;
}

export class QuoteBlockedError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(`Cannot create a quote revision: ${errors.join("; ")}`);
    this.name = "QuoteBlockedError";
    this.errors = errors;
  }
}

/**
 * Allocates `quotedPriceCents` exactly across every revenue-bearing row
 * (service lines, equipment lines, labor lines, delivery, extra costs) in
 * proportion to each row's direct-cost weight, using allocateCents'
 * deterministic largest-remainder method — the sum of every
 * allocatedSellingPriceCents always equals quotedPriceCents exactly. Throws
 * QuoteBlockedError (never a silently-invented even split) when every row
 * has zero direct cost but the price is non-zero.
 *
 * THIS is the single allocation function both a live draft preview
 * (evaluateProject) and a locked quote (buildQuoteRevision) call — there is
 * no separate approximate/ratio-based tax path for drafts.
 */
export function allocateRevenue(quotedPriceCents: MoneyCents, rows: RevenueRow[]): RevenueAllocationLine[] {
  if (rows.length === 0) {
    if (quotedPriceCents !== 0) throw new QuoteBlockedError(["Cannot allocate a non-zero quoted price across zero lines."]);
    return [];
  }
  const weights = rows.map((r) => Math.max(0, r.directCostCents));
  try {
    const allocated = allocateCents(
      quotedPriceCents,
      weights,
      rows.map((r) => r.key)
    );
    return rows.map((r, i) => ({ key: r.key, label: r.label, taxable: r.taxable, directCostCents: r.directCostCents, allocatedSellingPriceCents: allocated[i] }));
  } catch (err) {
    if (err instanceof MoneyError) {
      throw new QuoteBlockedError([
        "Cannot allocate the quoted price across this project's lines — every line has zero direct cost. Add a costed line, or set an explicit price for each line (not yet supported in this UI).",
      ]);
    }
    throw err;
  }
}

/** Computes tax from an exact revenue allocation — taxable subtotal is the
 * sum of every taxable row's allocated cents, and tax rounds HALF-UP to the
 * nearest cent at that boundary. Never computed from direct cost, true
 * cost, or any tax-inclusive figure. */
function computeTaxFromAllocation(revenueAllocation: RevenueAllocationLine[], taxRatePercent: number): { taxableSubtotalCents: MoneyCents; taxAmountCents: MoneyCents } {
  const taxableSubtotalCents = sumCents(revenueAllocation.filter((r) => r.taxable).map((r) => r.allocatedSellingPriceCents));
  const taxFraction = percentToFraction(taxRatePercent);
  const taxAmountCents = fromDecimalToCents(new Decimal(taxableSubtotalCents).times(taxFraction));
  return { taxableSubtotalCents, taxAmountCents };
}

interface ProjectRollup {
  materialsCostCents: MoneyCents;
  laborCostCents: MoneyCents;
  laborPersonHours: number;
  equipmentCostCents: MoneyCents;
  otherCostCents: MoneyCents;
  deliveryCostCents: MoneyCents;
  directCostCents: MoneyCents;
  revenueRows: RevenueRow[];
  resolvedServiceLines: { assembly: Assembly | undefined; perUnit: AssemblyCostResult; quantity: number; taxable: boolean }[];
  resolvedLaborLines: { label: string; taxable: boolean; personHours: number; laborCostCents: MoneyCents; crewSize: number; elapsedHours: number; loadedRateCents: MoneyCents }[];
}

/** Rolls up every cost-bearing line of a project (service lines, standalone
 * equipment, ad-hoc crew-duration labor lines, delivery, extra costs) into
 * one direct-cost total AND a row-by-row breakdown suitable for revenue
 * allocation. Shared by evaluateProject (live draft) and buildQuoteRevision
 * (locked quote) so both use identical roll-up logic. */
function rollUpProject(project: Project, assemblies: Assembly[], materials: Material[], equipment: Equipment[], loadedLaborRateCents: number, overheadPercentForPerUnit: number): ProjectRollup {
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  let materialsCost = new Decimal(0);
  let laborCost = new Decimal(0);
  let laborPersonHours = new Decimal(0);
  let equipmentCost = new Decimal(0);
  let otherCost = new Decimal(0);
  const revenueRows: RevenueRow[] = [];
  const resolvedServiceLines: ProjectRollup["resolvedServiceLines"] = [];

  project.serviceLines.forEach((line, i) => {
    const assembly = assemblyById.get(line.assemblyId);
    // overheadPercentForPerUnit is passed through only so callers that need
    // the per-unit true cost (e.g. buildQuoteRevision's snapshot) can get it
    // from the same call — it plays NO role in this function's own directCost
    // total, which applies overhead exactly once, below, at the project level.
    const perUnit = assembly
      ? calculateAssemblyCost(assembly, materials, equipment, loadedLaborRateCents, overheadPercentForPerUnit)
      : ({ materialCostPerUnitCents: 0, laborCostPerUnitCents: 0, equipmentCostPerUnitCents: 0, otherCostPerUnitCents: 0, directCostPerUnitCents: 0, overheadPerUnitCents: 0, trueCostPerUnitCents: 0 } as AssemblyCostResult);
    const qty = safeD(line.quantity);
    materialsCost = materialsCost.plus(new Decimal(safeCents(perUnit.materialCostPerUnitCents)).times(qty));
    laborCost = laborCost.plus(new Decimal(safeCents(perUnit.laborCostPerUnitCents)).times(qty));
    laborPersonHours = laborPersonHours.plus(safeD(assembly?.laborPersonHoursPerUnit ?? 0).times(qty));
    equipmentCost = equipmentCost.plus(new Decimal(safeCents(perUnit.equipmentCostPerUnitCents)).times(qty));
    otherCost = otherCost.plus(new Decimal(safeCents(perUnit.otherCostPerUnitCents)).times(qty));
    const lineDirectCents = fromDecimalToCents(new Decimal(safeCents(perUnit.directCostPerUnitCents)).times(qty));
    revenueRows.push({ key: `service:${i}`, label: assembly?.name ?? "Unknown service", taxable: isTaxable(line.taxable), directCostCents: lineDirectCents });
    resolvedServiceLines.push({ assembly, perUnit, quantity: safe(line.quantity), taxable: isTaxable(line.taxable) });
  });

  project.equipmentLines.forEach((line, i) => {
    const item = equipmentById.get(line.equipmentId);
    const lineCostCents = item ? equipmentUnitCostCents(item, line.quantity) : (0 as MoneyCents);
    equipmentCost = equipmentCost.plus(lineCostCents);
    revenueRows.push({ key: `equipment:${i}`, label: item?.name ?? "Unknown equipment", taxable: isTaxable(line.taxable), directCostCents: lineCostCents });
  });

  const resolvedLaborLines: ProjectRollup["resolvedLaborLines"] = [];
  (project.laborLines ?? []).forEach((line, i) => {
    const personHours = safeD(line.crewSize).times(safeD(line.elapsedHours));
    const lineCostCents = fromDecimalToCents(personHours.times(new Decimal(safeCents(line.loadedRateCents))));
    laborCost = laborCost.plus(lineCostCents);
    laborPersonHours = laborPersonHours.plus(personHours);
    revenueRows.push({ key: `labor:${i}`, label: line.label, taxable: isTaxable(line.taxable), directCostCents: lineCostCents });
    resolvedLaborLines.push({
      label: line.label,
      taxable: isTaxable(line.taxable),
      personHours: personHours.toNumber(),
      laborCostCents: lineCostCents,
      crewSize: safe(line.crewSize),
      elapsedHours: safe(line.elapsedHours),
      loadedRateCents: safeCents(line.loadedRateCents),
    });
  });

  project.extraCosts.forEach((extra, i) => {
    const amountCents = safeCents(extra.amountCents);
    otherCost = otherCost.plus(amountCents);
    revenueRows.push({ key: `extra:${i}`, label: extra.label, taxable: isTaxable(extra.taxable), directCostCents: amountCents });
  });

  const deliveryCostCents = safeCents(project.deliveryCostCents);
  revenueRows.push({ key: "delivery", label: "Delivery", taxable: isTaxable(project.deliveryTaxable), directCostCents: deliveryCostCents });

  const directCostCents = sumCents([
    fromDecimalToCents(materialsCost),
    fromDecimalToCents(laborCost),
    fromDecimalToCents(equipmentCost),
    deliveryCostCents,
    fromDecimalToCents(otherCost),
  ]);

  return {
    materialsCostCents: fromDecimalToCents(materialsCost),
    laborCostCents: fromDecimalToCents(laborCost),
    laborPersonHours: laborPersonHours.toNumber(),
    equipmentCostCents: fromDecimalToCents(equipmentCost),
    otherCostCents: fromDecimalToCents(otherCost),
    deliveryCostCents,
    directCostCents,
    revenueRows,
    resolvedServiceLines,
    resolvedLaborLines,
  };
}

/** Full cost + pricing roll-up for a saved Project. Pricing always goes
 * through calculateExactPricingChainCents (exact — fractional-cent-preserving
 * — overhead → true cost → required price → rounded UP to the business's
 * rounding increment, with no premature rounding before the ceiling step) so
 * this is the single source of truth every part of the app prices from — the
 * free calculator on the marketing site uses the same function.
 *
 * This is the LIVE, unlocked calculation for a project that hasn't been
 * quoted yet (or is being re-evaluated for a cost-impact "what if" scan). It
 * always uses TODAY's catalog costs and business settings, AND uses the
 * SAME exact allocateRevenue()-based tax computation buildQuoteRevision()
 * uses — there is no separate approximate draft tax engine, so the number
 * shown here immediately before locking a quote equals the number stored in
 * the resulting revision, provided no input changes in between. Once a
 * project has an actual quote revision, historical reporting must read that
 * revision's frozen figures instead — never re-run this function and treat
 * the result as if it were history.
 */
export function evaluateProject(
  project: Project,
  assemblies: Assembly[],
  materials: Material[],
  equipment: Equipment[],
  business: Pick<BusinessSettings, "loadedLaborRateCents" | "roundingIncrementCents">
): ProjectEstimateResult {
  const rollup = rollUpProject(project, assemblies, materials, equipment, business.loadedLaborRateCents, 0);

  const pricing = calculateExactPricingChainCents(
    {
      materialsCostCents: rollup.materialsCostCents,
      laborCostCents: rollup.laborCostCents,
      equipmentCostCents: rollup.equipmentCostCents,
      deliveryCostCents: rollup.deliveryCostCents,
      otherCostCents: rollup.otherCostCents,
      overheadPercent: project.overheadPercent,
    },
    project.targetMarginPercent,
    business.roundingIncrementCents
  );

  if (pricing.roundedRecommendedPriceCents === null) {
    return {
      materialsCostCents: rollup.materialsCostCents,
      laborCostCents: rollup.laborCostCents,
      laborPersonHours: rollup.laborPersonHours,
      equipmentCostCents: rollup.equipmentCostCents,
      deliveryCostCents: rollup.deliveryCostCents,
      otherCostCents: rollup.otherCostCents,
      directCostCents: pricing.directCostCents,
      overheadAmountCents: pricing.overheadAmountCents,
      trueCostCents: pricing.trueCostCents,
      requiredSellingPriceCents: null,
      displayPriceCents: null,
      expectedMargin: null,
      taxableSubtotalCents: null,
      taxAmountCents: null,
      customerTotalCents: null,
    };
  }

  // Same exact allocation function a locked revision uses — see
  // allocateRevenue()'s doc comment. A draft has no actualQuotedPrice yet, so
  // the live preview allocates against the system's own recommendation.
  let taxableSubtotalCents: MoneyCents;
  let taxAmountCents: MoneyCents;
  try {
    const allocation = allocateRevenue(pricing.roundedRecommendedPriceCents, rollup.revenueRows);
    ({ taxableSubtotalCents, taxAmountCents } = computeTaxFromAllocation(allocation, project.taxRatePercent ?? 0));
  } catch {
    // Every line has zero direct cost — nothing to allocate proportionally.
    // A live preview shouldn't throw on every keystroke of an empty project;
    // show zero tax rather than crash. buildQuoteRevision() still throws for
    // real, since an official quote MUST resolve this.
    taxableSubtotalCents = 0 as MoneyCents;
    taxAmountCents = 0 as MoneyCents;
  }
  const customerTotalCents = safeCents(pricing.roundedRecommendedPriceCents + taxAmountCents);

  return {
    materialsCostCents: rollup.materialsCostCents,
    laborCostCents: rollup.laborCostCents,
    laborPersonHours: rollup.laborPersonHours,
    equipmentCostCents: rollup.equipmentCostCents,
    deliveryCostCents: rollup.deliveryCostCents,
    otherCostCents: rollup.otherCostCents,
    directCostCents: pricing.directCostCents,
    overheadAmountCents: pricing.overheadAmountCents,
    trueCostCents: pricing.trueCostCents,
    requiredSellingPriceCents: pricing.exactRequiredPriceCents,
    displayPriceCents: pricing.roundedRecommendedPriceCents,
    expectedMargin: pricing.achievedMargin,
    taxableSubtotalCents,
    taxAmountCents,
    customerTotalCents,
  };
}

export interface TargetMarginCheck {
  /** True only when we have enough data to compare (a real price and a
   * finite target) AND the achieved margin is measurably below target. */
  isBelowTarget: boolean;
  achievedMargin: number | null;
  targetMarginPercent: number;
  /** Percentage points short of target (e.g. 1.5), or null when not below. */
  marginPointsShort: number | null;
  /** The extra revenue, at this same true cost, that would be needed to hit
   * the target margin exactly — i.e. requiredPriceAtTarget - actualPrice. */
  shortfallCents: MoneyCents | null;
}

/**
 * Compares a price actually being charged (a manual override, or a locked
 * revision's actualQuotedPriceCents) against the project's own target
 * margin — NOT against the system's recommended price, since a contractor
 * is always free to charge more or less than the recommendation. Used to
 * warn (not block) before locking in a materially under-target quote.
 */
export function evaluateQuoteAgainstTarget(
  actualPriceCents: MoneyCents,
  trueCostCents: MoneyCents,
  requiredSellingPriceCents: MoneyCents | null,
  targetMarginPercent: number
): TargetMarginCheck {
  const achievedMargin = calculateMargin(actualPriceCents, trueCostCents);
  if (achievedMargin === null || requiredSellingPriceCents === null || achievedMargin >= targetMarginPercent) {
    return { isBelowTarget: false, achievedMargin, targetMarginPercent, marginPointsShort: null, shortfallCents: null };
  }
  const shortfallCents = safeCents(Math.max(0, requiredSellingPriceCents - actualPriceCents));
  return {
    isBelowTarget: shortfallCents > 0,
    achievedMargin,
    targetMarginPercent,
    marginPointsShort: shortfallCents > 0 ? targetMarginPercent - achievedMargin : null,
    shortfallCents: shortfallCents > 0 ? shortfallCents : null,
  };
}

/** Everything that must be true before a project can become (or remain) an
 * official quote: converted into a QuoteRevision, exported as a customer
 * PDF, or otherwise treated as finalized. Returns a list of human-readable
 * errors (empty = valid) rather than a boolean, so the UI can show exactly
 * what to fix. Never silently clamps a bad value and proceeds — see
 * calc.ts's calculateExactRequiredPriceCentsDecimal, which returns `null`
 * rather than a clamped 99.99%-margin price for exactly this reason.
 *
 * Also enforces Catalog validity at the point of USE: a service line whose
 * assembly (or any material/equipment that assembly references) fails
 * `validation.ts`'s domain-level checks blocks quoting, and likewise for a
 * standalone equipment line — an invalid Catalog record can be edited freely
 * in the Catalog tab (where its own inline error shows immediately) but can
 * never be silently consumed by a quote. */
export function getQuoteBlockingErrors(project: Project, assemblies: Assembly[], materials: Material[], equipment: Equipment[]): string[] {
  const errors: string[] = [];
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  if (!Number.isFinite(project.targetMarginPercent)) {
    errors.push("Target margin: enter a number.");
  } else if (project.targetMarginPercent < 0) {
    errors.push("Target margin can't be negative.");
  } else if (project.targetMarginPercent >= 100) {
    errors.push("Target margin must be under 100% — at 100% or above, no selling price could ever satisfy it.");
  }

  if (!Number.isFinite(project.overheadPercent) || project.overheadPercent < 0) {
    errors.push("Overhead % must be zero or greater.");
  }

  if (project.taxRatePercent !== undefined && (!Number.isFinite(project.taxRatePercent) || project.taxRatePercent < 0 || project.taxRatePercent > 100)) {
    errors.push("Tax rate must be between 0% and 100%.");
  }

  if (!Number.isFinite(project.deliveryCostCents) || project.deliveryCostCents < 0) {
    errors.push("Delivery cost can't be negative.");
  }

  for (const line of project.serviceLines) {
    const assembly = assemblyById.get(line.assemblyId);
    const name = assembly?.name ?? "a service line";
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      errors.push(`Quantity for "${name}" must be zero or greater.`);
    }
    if (!assembly) {
      // The referenced assembly no longer exists in the catalog (deleted
      // after this project's service line was added). This must BLOCK
      // quoting rather than silently continue — continuing would drop the
      // line's entire cost out of the total with no indication anything is
      // wrong (DEF-09).
      errors.push(`This project references a service that no longer exists in your catalog — remove this line or restore the service before quoting.`);
      continue;
    }
    for (const error of getAssemblyValidationErrors(assembly)) {
      errors.push(`"${name}" — ${error}`);
    }
    for (const materialLine of assembly.materials) {
      const material = materialById.get(materialLine.materialId);
      if (!material) {
        errors.push(`"${name}" uses a material that no longer exists in your catalog — remove or replace it before quoting.`);
        continue;
      }
      for (const error of getMaterialValidationErrors(material)) {
        errors.push(`"${name}" uses material "${material.name}" — ${error}`);
      }
    }
    for (const equipmentLine of assembly.equipment) {
      const item = equipmentById.get(equipmentLine.equipmentId);
      if (!item) {
        errors.push(`"${name}" uses equipment that no longer exists in your catalog — remove or replace it before quoting.`);
        continue;
      }
      for (const error of getEquipmentValidationErrors(item)) {
        errors.push(`"${name}" uses equipment "${item.name}" — ${error}`);
      }
    }
  }

  for (const line of project.equipmentLines) {
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      errors.push("Equipment quantity can't be negative.");
    }
    const item = equipmentById.get(line.equipmentId);
    if (!item) {
      errors.push("This project references a piece of equipment that no longer exists in your catalog — remove or replace it before quoting.");
      continue;
    }
    for (const error of getEquipmentValidationErrors(item)) {
      errors.push(`Equipment "${item.name}" — ${error}`);
    }
  }

  for (const line of project.laborLines ?? []) {
    for (const error of getProjectLaborLineValidationErrors(line)) {
      errors.push(`"${line.label || "a labor line"}" — ${error}`);
    }
  }

  for (const extra of project.extraCosts) {
    if (!Number.isFinite(extra.amountCents) || extra.amountCents < 0) {
      errors.push(`"${extra.label || "Other cost"}" can't be negative.`);
    }
  }

  if (
    project.serviceLines.length === 0 &&
    project.equipmentLines.length === 0 &&
    (project.laborLines ?? []).length === 0 &&
    project.deliveryCostCents === 0 &&
    project.extraCosts.length === 0
  ) {
    errors.push("Add at least one service, equipment line, labor line, delivery cost, or other cost before quoting.");
  }

  return errors;
}

/**
 * Creates a new, immutable QuoteRevision for a project — the ONLY way a
 * project's price becomes official history. Never mutates or replaces an
 * earlier revision: `previousRevisionId` links backward, `revisionNumber`
 * increments, and every prior revision in `project.quoteRevisions` remains
 * exactly as it was. Refuses to create a revision at all (throws
 * QuoteBlockedError) when getQuoteBlockingErrors finds anything wrong —
 * callers MUST check that first and surface the errors rather than catching
 * this exception as a control-flow shortcut.
 *
 * Uses the SAME rollUpProject / calculateExactPricingChainCents / allocateRevenue
 * pipeline as evaluateProject — when actualQuotedPriceOverride is omitted,
 * the recommendation this locks in is byte-for-byte the same number
 * evaluateProject() was just showing in the live preview.
 */
export function buildQuoteRevision(
  project: Project,
  assemblies: Assembly[],
  materials: Material[],
  equipment: Equipment[],
  business: BusinessSettings,
  options?: { reason?: string; actualQuotedPriceOverrideCents?: number }
): QuoteRevision {
  const blockingErrors = getQuoteBlockingErrors(project, assemblies, materials, equipment);
  if (blockingErrors.length > 0) throw new QuoteBlockedError(blockingErrors);

  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const rollup = rollUpProject(project, assemblies, materials, equipment, business.loadedLaborRateCents, project.overheadPercent);

  const pricing = calculateExactPricingChainCents(
    {
      materialsCostCents: rollup.materialsCostCents,
      laborCostCents: rollup.laborCostCents,
      equipmentCostCents: rollup.equipmentCostCents,
      deliveryCostCents: rollup.deliveryCostCents,
      otherCostCents: rollup.otherCostCents,
      overheadPercent: project.overheadPercent,
    },
    project.targetMarginPercent,
    business.roundingIncrementCents
  );
  const { directCostCents, overheadAmountCents, trueCostCents } = pricing;
  // getQuoteBlockingErrors already guarantees a valid target margin, so this
  // is unreachable in practice.
  if (pricing.roundedRecommendedPriceCents === null) throw new QuoteBlockedError(["Could not compute a price for this project."]);

  const serviceLines: QuoteRevisionServiceLine[] = project.serviceLines.map((line, i): QuoteRevisionServiceLine => {
    const { assembly, perUnit } = rollup.resolvedServiceLines[i];
    const laborMode: LaborMode = assembly?.laborInputMode ?? "legacy-unknown";
    const laborOriginalValue =
      laborMode === "production-rate" ? (assembly?.laborProductionRate ?? null) : laborMode === "person-hours-per-unit" ? (assembly?.laborPersonHoursPerUnit ?? null) : null;
    const laborOriginalUnit =
      laborMode === "production-rate" ? `${assembly?.unit ?? "unit"}/person-hour` : laborMode === "person-hours-per-unit" ? "hrs/unit" : null;
    return {
      assemblyId: line.assemblyId,
      assemblyName: assembly?.name ?? "Unknown service",
      unit: assembly?.unit ?? "each",
      quantity: safe(line.quantity),
      taxable: isTaxable(line.taxable),
      materialCostPerUnitCents: perUnit.materialCostPerUnitCents,
      laborCostPerUnitCents: perUnit.laborCostPerUnitCents,
      laborPersonHoursPerUnit: safe(assembly?.laborPersonHoursPerUnit ?? 0),
      equipmentCostPerUnitCents: perUnit.equipmentCostPerUnitCents,
      otherCostPerUnitCents: perUnit.otherCostPerUnitCents,
      laborMode,
      laborOriginalValue,
      laborOriginalUnit,
    };
  });

  const equipmentLines: QuoteRevisionEquipmentLine[] = project.equipmentLines.map((line): QuoteRevisionEquipmentLine => {
    const item = equipmentById.get(line.equipmentId);
    return {
      equipmentId: line.equipmentId,
      equipmentName: item?.name ?? "Unknown equipment",
      quantity: safe(line.quantity),
      taxable: isTaxable(line.taxable),
      rateCents: safeCents(item?.rateCents ?? 0),
      rateType: item?.rateType ?? "job",
    };
  });

  const laborLines: QuoteRevisionLaborLine[] = rollup.resolvedLaborLines.map((line) => ({
    label: line.label,
    taxable: line.taxable,
    mode: "crew-duration",
    crewSize: line.crewSize,
    elapsedHours: line.elapsedHours,
    personHours: line.personHours,
    loadedRateCents: line.loadedRateCents,
    laborCostCents: line.laborCostCents,
  }));

  const previous = project.quoteRevisions[project.quoteRevisions.length - 1] ?? null;
  const actualQuotedPriceCents = safeCents(options?.actualQuotedPriceOverrideCents ?? pricing.roundedRecommendedPriceCents);
  const achievedMargin = calculateMargin(actualQuotedPriceCents, trueCostCents);

  // THE SAME allocateRevenue() a live draft preview uses — see
  // evaluateProject(). Allocated against actualQuotedPriceCents (the
  // override, if any — not the recommendation).
  const revenueAllocation = allocateRevenue(actualQuotedPriceCents, rollup.revenueRows);
  const { taxableSubtotalCents, taxAmountCents } = computeTaxFromAllocation(revenueAllocation, project.taxRatePercent ?? 0);
  const customerTotalCents = safeCents(actualQuotedPriceCents + taxAmountCents);

  return {
    id: crypto.randomUUID(),
    projectId: project.id,
    revisionNumber: (previous?.revisionNumber ?? 0) + 1,
    previousRevisionId: previous?.id ?? null,
    createdAt: new Date().toISOString(),
    reason: options?.reason,
    calculationSchemaVersion: QUOTE_REVISION_SCHEMA_VERSION,
    roundingIncrementCents: business.roundingIncrementCents,
    serviceLines,
    equipmentLines,
    laborLines,
    deliveryCostCents: safeCents(project.deliveryCostCents),
    deliveryTaxable: isTaxable(project.deliveryTaxable),
    extraCosts: project.extraCosts,
    loadedLaborRateCents: safeCents(business.loadedLaborRateCents),
    laborRateBasis: business.laborRateBasis,
    overheadPercent: safe(project.overheadPercent),
    targetMarginPercent: safe(project.targetMarginPercent),
    taxRatePercent: safe(project.taxRatePercent ?? 0),
    directCostCents,
    overheadAmountCents,
    trueCostCents,
    exactRequiredPriceCents: pricing.exactRequiredPriceCents as MoneyCents,
    roundedRecommendedPriceCents: pricing.roundedRecommendedPriceCents,
    actualQuotedPriceCents,
    taxableSubtotalCents,
    taxAmountCents,
    customerTotalCents,
    grossProfitCents: safeCents(actualQuotedPriceCents - trueCostCents),
    achievedMargin,
    historicalCostBasisStatus: "known",
    revenueAllocation,
  };
}

/** The currently-active revision for a project, or null if it's never been
 * quoted (still a draft with no revisions). */
export function getActiveRevision(project: Project): QuoteRevision | null {
  if (project.quoteRevisions.length === 0) return null;
  if (project.activeQuoteRevisionId) {
    const found = project.quoteRevisions.find((r) => r.id === project.activeQuoteRevisionId);
    if (found) return found;
  }
  return project.quoteRevisions[project.quoteRevisions.length - 1];
}

// -- Project lifecycle --------------------------------------------------------
//
// The user-facing stage a project is in — always DERIVED from its real
// records (status, quoteRevisions, actual), never a separately-stored flag
// that could disagree with them. `status` itself keeps its original raw
// values (draft/sent/won/lost/archived) for backward compatibility with
// every already-saved workspace; `LifecycleStage` is the display/reporting
// vocabulary layered on top.

export type LifecycleStage = "draft" | "quoted" | "accepted" | "completed" | "lost" | "archived";

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  draft: "Draft",
  quoted: "Quoted",
  accepted: "Accepted",
  completed: "Completed",
  lost: "Lost",
  archived: "Archived",
};

/** "Completed" specifically means "accepted AND actual cost data has been
 * recorded" — the exact same condition `calculateProfitabilitySummary` uses
 * to decide eligibility (`p.actual && getActiveRevision(p)`), so this label
 * can never claim "Completed" for a job that wouldn't actually show up in
 * profitability reporting. */
export function deriveLifecycleStage(project: Project): LifecycleStage {
  if (project.status === "archived") return "archived";
  if (project.status === "lost") return "lost";
  if (project.status === "won") return project.actual ? "completed" : "accepted";
  if (project.quoteRevisions.length > 0) return "quoted";
  return "draft";
}

export interface StatusTransitionCheck {
  allowed: boolean;
  /** Why the transition is blocked — only set when `allowed` is false. */
  reason?: string;
  /** True when the transition changes something historical (acceptance,
   * archiving, marking lost) and the caller must get an explicit
   * confirmation before applying it. */
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

/** Every lifecycle transition rule in one place, so every entry point
 * (the status dropdown, a future bulk-action, a test) enforces the exact
 * same rules rather than re-deriving them. Pure — takes the project and the
 * proposed next status, returns whether it's allowed and what (if
 * anything) the caller must confirm first. Never mutates anything. */
export function describeStatusTransition(project: Project, nextStatus: Project["status"]): StatusTransitionCheck {
  if (nextStatus === project.status) return { allowed: true, requiresConfirmation: false };

  // Reverting to Draft is always allowed — e.g. un-losing/un-archiving a
  // project to keep working on it. It never touches any locked revision.
  if (nextStatus === "draft") {
    return { allowed: true, requiresConfirmation: false };
  }

  // Every other status implies "a quote exists" — a project can't be
  // Quoted/Accepted/Lost with nothing to show a customer. Callers should
  // offer to create the first revision rather than silently blocking here.
  if (project.quoteRevisions.length === 0) {
    return { allowed: false, reason: "This project has no locked quote yet — create one before changing its status.", requiresConfirmation: false };
  }

  if (nextStatus === "won") {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationMessage: `Mark "${project.name}" as accepted at the current quote revision? This records today as the acceptance date — a later re-quote will never silently change which revision the customer accepted.`,
    };
  }

  if (nextStatus === "archived") {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationMessage: `Archive "${project.name}"? It stays read-only and exportable, and can still be included in reports, but won't appear in your active project list.`,
    };
  }

  if (nextStatus === "lost") {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationMessage: `Mark "${project.name}" as lost? You can reopen it later by changing its status back.`,
    };
  }

  // "sent" (Quoted) — a low-stakes, reversible step; no confirmation needed.
  return { allowed: true, requiresConfirmation: false };
}

/** Builds the patch that records acceptance — the ONLY place
 * `acceptedRevisionId`/`acceptedAt` are ever set. Returns null if there's no
 * active revision to accept (the caller should have blocked this via
 * `describeStatusTransition` already). Never mutates `project`. */
export function buildAcceptancePatch(project: Project): Pick<Project, "status" | "acceptedRevisionId" | "acceptedAt"> | null {
  const revision = getActiveRevision(project);
  if (!revision) return null;
  return { status: "won", acceptedRevisionId: revision.id, acceptedAt: new Date().toISOString() };
}

export interface WorkflowNextAction {
  label: string;
  kind: "quote" | "accept-or-requote" | "record-actuals" | "review-profitability" | "view-history" | "reopen-or-archive";
  /** True when the action can't be taken right now — the caller should
   * disable the control (never hide it silently) and show `reason`. */
  disabled: boolean;
  reason?: string;
}

/** The ONE thing worth doing next, purely a function of lifecycle stage —
 * same derivation every screen that shows project status uses, so "Draft"
 * never shows a different next step in one place than another. Never
 * recommends something `describeStatusTransition` would actually block. */
export function deriveNextAction(project: Project, canQuote: boolean, blockingErrors: readonly string[]): WorkflowNextAction {
  const stage = deriveLifecycleStage(project);
  switch (stage) {
    case "draft":
      return {
        label: "Review and quote",
        kind: "quote",
        disabled: !canQuote,
        reason: canQuote ? undefined : (blockingErrors[0] ?? "Fix the errors below before this can be quoted."),
      };
    case "quoted":
      return { label: "Mark accepted or create revision", kind: "accept-or-requote", disabled: false };
    case "accepted":
      return { label: "Record job progress/actuals", kind: "record-actuals", disabled: false };
    case "completed":
      return { label: "Review profitability", kind: "review-profitability", disabled: false };
    case "lost":
      return { label: "Reopen or archive", kind: "reopen-or-archive", disabled: false };
    case "archived":
      return { label: "View/export history", kind: "view-history", disabled: false };
  }
}

export interface ProjectCsvRow {
  item: string;
  quantity: number;
  unit: string;
  /** Plain decimal DOLLARS (e.g. 42.4 for $42.40) — CSV export is a
   * presentation/output boundary, so cents are converted to a spreadsheet-
   * friendly decimal number here, matching how a human expects a "unit
   * cost" column to read in Excel/Sheets. Internal computation upstream of
   * this still uses integer cents throughout. */
  unitCost: number;
  total: number;
}

/** Breaks a project down into resource-level CSV rows (one row per material,
 * one for labor, one per equipment line) — matching the brief's reference
 * CSV shape rather than one opaque row per assembly. */
export function buildProjectCsvRows(project: Project, assemblies: Assembly[], materials: Material[], equipment: Equipment[], loadedLaborRateCents: number): ProjectCsvRow[] {
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const rows: ProjectCsvRow[] = [];
  const toDollars = (cents: number) => new Decimal(safeCents(cents)).dividedBy(100).toNumber();

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
        unitCost: toDollars(material.unitCostCents),
        total: new Decimal(materialQty).times(toDollars(material.unitCostCents)).toNumber(),
      });
    }

    if (assembly.laborPersonHoursPerUnit > 0) {
      const laborHours = qty * safe(assembly.laborPersonHoursPerUnit);
      rows.push({
        item: `${assembly.name.toLowerCase()} labor`,
        quantity: laborHours,
        unit: "person-hour",
        unitCost: toDollars(loadedLaborRateCents),
        total: new Decimal(laborHours).times(toDollars(loadedLaborRateCents)).toNumber(),
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
        unitCost: toDollars(item.rateCents),
        total: new Decimal(equipmentQty).times(toDollars(item.rateCents)).toNumber(),
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
      unitCost: toDollars(item.rateCents),
      total: new Decimal(safe(line.quantity)).times(toDollars(item.rateCents)).toNumber(),
    });
  }

  for (const line of project.laborLines ?? []) {
    const personHours = safe(line.crewSize) * safe(line.elapsedHours);
    rows.push({
      item: line.label.toLowerCase(),
      quantity: personHours,
      unit: "person-hour",
      unitCost: toDollars(line.loadedRateCents),
      total: new Decimal(personHours).times(toDollars(line.loadedRateCents)).toNumber(),
    });
  }

  if (project.deliveryCostCents > 0) {
    const deliveryDollars = toDollars(project.deliveryCostCents);
    rows.push({ item: "delivery", quantity: 1, unit: "job", unitCost: deliveryDollars, total: deliveryDollars });
  }

  for (const extra of project.extraCosts) {
    const amountDollars = toDollars(extra.amountCents);
    rows.push({ item: extra.label.toLowerCase(), quantity: 1, unit: "job", unitCost: amountDollars, total: amountDollars });
  }

  return rows;
}

export interface ActualVsEstimateResult {
  estimatedTrueCostCents: MoneyCents;
  actualTrueCostCents: MoneyCents;
  actualQuotedPriceCents: MoneyCents;
  expectedMargin: number | null;
  actualMargin: number | null;
  costVarianceCents: number;
  costVariancePercent: number | null;
}

/**
 * Compares what a job actually cost against the LOCKED quote revision it was
 * won on — never a live recalculation. The revision's own overheadPercent is
 * used (the policy in force when the job was quoted), not whatever the
 * business's current overhead setting happens to be today.
 */
export function evaluateActualVsEstimate(revision: QuoteRevision, actualDirectCostCents: number): ActualVsEstimateResult {
  const overheadFraction = percentToFraction(revision.overheadPercent);
  const actualOverheadCents = new Decimal(safeCents(actualDirectCostCents)).times(overheadFraction);
  const actualTrueCostCents = fromDecimalToCents(new Decimal(safeCents(actualDirectCostCents)).plus(actualOverheadCents));
  const expectedMargin = calculateMargin(revision.actualQuotedPriceCents, revision.trueCostCents);
  const actualMargin = calculateMargin(revision.actualQuotedPriceCents, actualTrueCostCents);
  const costVarianceCents = actualTrueCostCents - revision.trueCostCents;
  const costVariancePercent = revision.trueCostCents > 0 ? (costVarianceCents / revision.trueCostCents) * 100 : null;

  return {
    estimatedTrueCostCents: revision.trueCostCents,
    actualTrueCostCents,
    actualQuotedPriceCents: revision.actualQuotedPriceCents,
    expectedMargin,
    actualMargin,
    costVarianceCents,
    costVariancePercent,
  };
}

/** One category's (materials/labor/equipment/delivery/other) estimated-vs-
 * actual comparison for a single job. */
export interface CategoryCostComparison {
  category: "materials" | "labor" | "equipment" | "delivery" | "other";
  label: string;
  estimatedCents: MoneyCents;
  actualCents: MoneyCents;
  /** actualCents − estimatedCents. Plain `number`, not `MoneyCents` — a
   * category can come in UNDER budget, which must show as a genuine
   * negative variance, never clamped to zero the way `MoneyCents`'s `safe()`
   * would. */
  varianceCents: number;
  /** Percent variance vs. estimated; `null` when the estimated amount is
   * zero (nothing to divide by — never Infinity, same convention as
   * `evaluateActualVsEstimate`'s `costVariancePercent`). */
  variancePercent: number | null;
}

/**
 * Breaks the whole-project `evaluateActualVsEstimate` comparison down by
 * cost category (materials/labor/equipment/delivery/other) so a contractor
 * can see e.g. "Estimated labor: $X — Actual labor: $Y — Variance: $Z"
 * instead of only a single project-wide total.
 *
 * Estimated figures come from the LOCKED quote revision's own frozen
 * line-level costs — never a live recalculation against today's catalog.
 * Every figure here is DIRECT cost only (no overhead) on both sides, since
 * `ProjectActuals` records actual cost by category without an overhead
 * split — overhead is applied exactly once, at the whole-project level, by
 * `evaluateActualVsEstimate`, never re-derived per category here.
 */
export function calculateActualsCategoryComparison(
  revision: QuoteRevision,
  actual: Pick<ProjectActuals, "actualMaterialsCostCents" | "actualLaborPersonHours" | "actualEquipmentCostCents" | "actualDeliveryCostCents" | "actualOtherCostCents">,
  loadedLaborRateCents: number
): CategoryCostComparison[] {
  let estimatedMaterials = new Decimal(0);
  let estimatedLabor = new Decimal(0);
  let estimatedEquipment = new Decimal(0);
  let estimatedOther = new Decimal(0);

  for (const line of revision.serviceLines) {
    const qty = safeD(line.quantity);
    estimatedMaterials = estimatedMaterials.plus(new Decimal(safeCents(line.materialCostPerUnitCents)).times(qty));
    estimatedLabor = estimatedLabor.plus(new Decimal(safeCents(line.laborCostPerUnitCents)).times(qty));
    estimatedEquipment = estimatedEquipment.plus(new Decimal(safeCents(line.equipmentCostPerUnitCents)).times(qty));
    estimatedOther = estimatedOther.plus(new Decimal(safeCents(line.otherCostPerUnitCents)).times(qty));
  }
  for (const line of revision.equipmentLines) {
    estimatedEquipment = estimatedEquipment.plus(new Decimal(safeCents(line.rateCents)).times(safeD(line.quantity)));
  }
  for (const line of revision.laborLines) {
    estimatedLabor = estimatedLabor.plus(safeCents(line.laborCostCents));
  }
  for (const extra of revision.extraCosts) {
    estimatedOther = estimatedOther.plus(safeCents(extra.amountCents));
  }
  const estimatedDelivery = new Decimal(safeCents(revision.deliveryCostCents));

  const actualLaborCents = fromDecimalToCents(safeD(actual.actualLaborPersonHours).times(new Decimal(safeCents(loadedLaborRateCents))));

  function compare(category: CategoryCostComparison["category"], label: string, estimated: Decimal, actualCents: MoneyCents): CategoryCostComparison {
    const estimatedCents = fromDecimalToCents(estimated);
    const varianceCents = actualCents - estimatedCents;
    const variancePercent = estimatedCents > 0 ? (varianceCents / estimatedCents) * 100 : null;
    return { category, label, estimatedCents, actualCents, varianceCents, variancePercent };
  }

  return [
    compare("materials", "Materials", estimatedMaterials, safeCents(actual.actualMaterialsCostCents)),
    compare("labor", "Labor", estimatedLabor, actualLaborCents),
    compare("equipment", "Equipment", estimatedEquipment, safeCents(actual.actualEquipmentCostCents)),
    compare("delivery", "Delivery", estimatedDelivery, safeCents(actual.actualDeliveryCostCents)),
    compare("other", "Other", estimatedOther, safeCents(actual.actualOtherCostCents)),
  ];
}

// -- Historical variance & profitability (brief killer features #20-22) -----

export type VarianceExclusionReason =
  | "missing locked labor assumption"
  | "missing actual quantity"
  | "missing actual person-hours"
  | "incompatible unit"
  | "legacy cost basis unknown"
  | "invalid historical record";

export interface AssemblyVarianceResult {
  assemblyId: string;
  assemblyName: string;
  unit: string;
  /** Eligible records only — see eligibleRecordCount/excludedRecordCount. */
  completedCount: number;
  avgEstimatedQuantity: number;
  avgActualQuantity: number;
  materialVariancePercent: number | null;
  avgActualLaborHours: number;
  /** Hours the estimate implied, using the LABOR ASSUMPTION LOCKED INTO THE
   * QUOTE at the time this job was quoted — never the assembly's current
   * catalog value, which may have been edited since. */
  avgEstimatedLaborHours: number;
  laborVariancePercent: number | null;
  /** Actual quantity ÷ actual labor hours — null (not 0 or Infinity) when no
   * labor hours were logged for a completed job, since a rate can't be
   * derived from a zero denominator. */
  avgActualProductionRate: number | null;
  eligibleRecordCount: number;
  excludedRecordCount: number;
  exclusionReasons: Partial<Record<VarianceExclusionReason, number>>;
}

/**
 * Groups every completed project's per-service actuals by (assembly, unit),
 * so a contractor can see e.g. "shrub installs run 17% more labor than
 * planned" across their job history — not just one project at a time.
 * Assemblies with no completed jobs yet are omitted (nothing to report).
 *
 * Every figure here is computed by aggregating totals FIRST and then taking
 * one ratio — never by averaging several jobs' individual percentages.
 *
 * Only takes `projects` — deliberately does NOT take a live assembly
 * catalog. Every locked labor assumption comes from each project's own
 * active QuoteRevision (revision.serviceLines[].laborPersonHoursPerUnit),
 * frozen at quote time. A completed job whose project has no active
 * revision (never actually quoted) is excluded, not silently computed
 * against today's catalog value — see exclusionReasons.
 */
export function calculateAssemblyVariance(projects: Project[]): AssemblyVarianceResult[] {
  interface Bucket {
    assemblyId: string;
    assemblyName: string;
    unit: string;
    estQty: number[];
    actQty: number[];
    actHours: number[];
    estHours: number[];
    exclusionReasons: Partial<Record<VarianceExclusionReason, number>>;
    excludedCount: number;
  }
  const byKey = new Map<string, Bucket>();

  function recordExclusion(bucket: Bucket, reason: VarianceExclusionReason) {
    bucket.exclusionReasons[reason] = (bucket.exclusionReasons[reason] ?? 0) + 1;
    bucket.excludedCount += 1;
  }

  for (const project of projects) {
    const lineActuals = project.actual?.serviceLineActuals;
    if (!lineActuals) continue;
    const revision = getActiveRevision(project);

    for (const line of lineActuals) {
      const revisionLine = revision?.serviceLines.find((l) => l.assemblyId === line.assemblyId);
      const key = revisionLine ? `${line.assemblyId}::${revisionLine.unit}` : `${line.assemblyId}::unknown`;
      const bucket: Bucket =
        byKey.get(key) ??
        {
          assemblyId: line.assemblyId,
          assemblyName: revisionLine?.assemblyName ?? line.assemblyId,
          unit: revisionLine?.unit ?? "unknown",
          estQty: [],
          actQty: [],
          actHours: [],
          estHours: [],
          exclusionReasons: {},
          excludedCount: 0,
        };
      byKey.set(key, bucket);

      if (!revision || !revisionLine) {
        recordExclusion(bucket, "missing locked labor assumption");
        continue;
      }
      if (revision.historicalCostBasisStatus === "unknown") {
        recordExclusion(bucket, "legacy cost basis unknown");
        continue;
      }
      if (!Number.isFinite(line.actualQuantity)) {
        recordExclusion(bucket, "missing actual quantity");
        continue;
      }
      if (!Number.isFinite(line.actualLaborHours)) {
        recordExclusion(bucket, "missing actual person-hours");
        continue;
      }
      if (!Number.isFinite(line.estimatedQuantity) || line.estimatedQuantity < 0) {
        recordExclusion(bucket, "invalid historical record");
        continue;
      }

      bucket.estQty.push(safe(line.estimatedQuantity));
      bucket.actQty.push(safe(line.actualQuantity));
      bucket.actHours.push(safe(line.actualLaborHours));
      // quantity × LOCKED person-hours-per-unit = hours — the assumption
      // frozen into the quote revision, never today's catalog value.
      bucket.estHours.push(safe(line.estimatedQuantity) * safe(revisionLine.laborPersonHoursPerUnit));
    }
  }

  const results: AssemblyVarianceResult[] = [];
  for (const bucket of byKey.values()) {
    if (bucket.estQty.length === 0 && bucket.excludedCount === 0) continue;
    const avgEstimatedQuantity = average(bucket.estQty) ?? 0;
    const avgActualQuantity = average(bucket.actQty) ?? 0;
    const avgActualLaborHours = average(bucket.actHours) ?? 0;
    const avgEstimatedLaborHours = average(bucket.estHours) ?? 0;
    results.push({
      assemblyId: bucket.assemblyId,
      assemblyName: bucket.assemblyName,
      unit: bucket.unit,
      completedCount: bucket.estQty.length,
      avgEstimatedQuantity,
      avgActualQuantity,
      materialVariancePercent: percentDiff(avgActualQuantity, avgEstimatedQuantity),
      avgActualLaborHours,
      avgEstimatedLaborHours,
      laborVariancePercent: percentDiff(avgActualLaborHours, avgEstimatedLaborHours),
      avgActualProductionRate: avgActualLaborHours > 0 ? avgActualQuantity / avgActualLaborHours : null,
      eligibleRecordCount: bucket.estQty.length,
      excludedRecordCount: bucket.excludedCount,
      exclusionReasons: bucket.exclusionReasons,
    });
  }
  return results;
}

/** Why a project with recorded actuals was left out of the profitability
 * summary entirely — currently the only way in is a missing locked quote
 * revision (nothing frozen to compare the actuals against). */
export type ProfitabilityExclusionReason = "missing locked quote revision";

export interface ProfitabilitySummary {
  /** @deprecated kept for backward compatibility — identical to `eligibleCount`. */
  completedCount: number;
  /** Projects actually included in every figure below: has both recorded
   * actuals AND a locked quote revision to compare them against. */
  eligibleCount: number;
  /** Projects that have actuals recorded (someone marked the job done) but
   * were left OUT of every figure below — see `exclusionReasons` for why.
   * Surfaced explicitly so "this summary only reflects N of your M
   * completed jobs" is never a silent, undiscoverable fact. */
  excludedCount: number;
  exclusionReasons: Partial<Record<ProfitabilityExclusionReason, number>>;
  /** PRIMARY metric — THE headline figure. Revenue-weighted, NOT an average
   * of each job's margin percentage: (Σ actualQuotedPrice − Σ expected true
   * cost) ÷ Σ actualQuotedPrice. `null` when total quoted revenue is zero. */
  weightedExpectedMargin: number | null;
  /** Same revenue-weighting, using each job's actual true cost instead of
   * its estimated one. THE headline actual-performance figure. */
  weightedActualMargin: number | null;
  /** SECONDARY metrics only — the simple (unweighted) average and median of
   * each individual job's actual margin. Never the headline figure — a
   * handful of tiny jobs can swing these away from what the business
   * actually earned, which is exactly what `weightedActualMargin` protects
   * against. Shown alongside it for context, clearly labeled as secondary. */
  averageActualMarginPerJob: number | null;
  medianActualMarginPerJob: number | null;

  // -- Phase 9 additions below: dollar totals, per-project drill-down, and --
  // -- supporting "worst offenders" lists. Purely additive — every field    --
  // -- above this line is unchanged and still means exactly what it did.   --

  /** Project ids counted in every figure above — same population as
   * `eligibleCount`. Lets a UI turn "12 projects" into a working filter/
   * scroll-to-projects link rather than an inert number. */
  eligibleProjectIds: string[];
  /** Project ids left OUT of every figure above — same population as
   * `excludedCount`. */
  excludedProjectIds: string[];
  /** Σ actualQuotedPriceCents across every eligible job — total quoted
   * revenue those jobs represent. `null` when there are no eligible jobs at
   * all — there is nothing to total, which is a different fact from "the
   * eligible jobs quoted for $0" and must never be conflated with it. */
  totalQuotedRevenueCents: MoneyCents | null;
  /** Σ actualTrueCostCents (direct cost + overhead, using each job's own
   * locked overhead policy) across every eligible job. `null` under the
   * same no-eligible-jobs condition as `totalQuotedRevenueCents`. */
  totalActualTrueCostCents: MoneyCents | null;
  /** totalQuotedRevenueCents − totalActualTrueCostCents. Plain `number`, not
   * `MoneyCents` — the business can genuinely have lost money in aggregate,
   * which must show as a real negative figure, never clamped to zero.
   * `null` under the same no-eligible-jobs condition as the two totals above. */
  totalGrossProfitCents: number | null;
  /** One row per eligible job — the data both `mostOverBudgetProjectIds` and
   * `largestMarginDeteriorationProjectIds` are derived from, and what a UI
   * drill-down filters down to. Unsorted (insertion order). */
  perProjectDetail: ProfitabilityProjectDetail[];
  /** Eligible project ids that ran over budget (positive cost variance vs.
   * their own quote), worst dollar overrun first. Excludes jobs that came in
   * at or under budget — empty when none ran over. */
  mostOverBudgetProjectIds: string[];
  /** Eligible project ids whose actual margin fell short of their own quoted
   * margin, biggest deterioration (in percentage points) first. Excludes
   * jobs where either margin is `null` (nothing to compare) or actual margin
   * met/beat the quoted margin — empty when none deteriorated. */
  largestMarginDeteriorationProjectIds: string[];
}

/** One eligible job's contribution to the profitability summary — the unit
 * both the dollar totals and the "worst offenders" lists above are built
 * from, and what a drill-down UI filters/highlights down to. */
export interface ProfitabilityProjectDetail {
  projectId: string;
  projectName: string;
  quotedRevenueCents: MoneyCents;
  actualTrueCostCents: MoneyCents;
  expectedMargin: number | null;
  actualMargin: number | null;
  /** actualTrueCostCents − estimatedTrueCostCents; positive = ran over
   * budget. Plain `number`, not `MoneyCents`, since it can be negative. */
  costVarianceCents: number;
  /** actualMargin − expectedMargin, in percentage points. Negative = margin
   * came in worse than quoted. `null` when either margin is `null`. */
  marginDeltaPoints: number | null;
}

/** Aggregate expected-vs-actual margin across every completed job that has
 * an active quote revision (a completed job without one has nothing to
 * compare against and is excluded — see `excludedCount`/`exclusionReasons`).
 * Whole-project rollup, not a per-service-type breakdown — see the doc
 * comment history in this file. */
export function calculateProfitabilitySummary(projects: Project[], business: Pick<BusinessSettings, "loadedLaborRateCents">): ProfitabilitySummary {
  const withActuals = projects.filter((p) => p.actual);
  const eligible = withActuals.filter((p) => getActiveRevision(p));
  const excluded = withActuals.filter((p) => !getActiveRevision(p));
  const exclusionReasons: Partial<Record<ProfitabilityExclusionReason, number>> = {};
  if (excluded.length > 0) exclusionReasons["missing locked quote revision"] = excluded.length;

  let expectedRevenue = new Decimal(0);
  let expectedCost = new Decimal(0);
  let actualRevenue = new Decimal(0);
  let actualCost = new Decimal(0);
  const perJobActualMargins: number[] = [];
  const perProjectDetail: ProfitabilityProjectDetail[] = [];

  for (const project of eligible) {
    const revision = getActiveRevision(project)!;
    const actualDirectCostCents = fromDecimalToCents(
      new Decimal(safeCents(project.actual!.actualMaterialsCostCents))
        .plus(new Decimal(safeD(project.actual!.actualLaborPersonHours)).times(safeCents(business.loadedLaborRateCents)))
        .plus(safeCents(project.actual!.actualEquipmentCostCents))
        .plus(safeCents(project.actual!.actualDeliveryCostCents))
        .plus(safeCents(project.actual!.actualOtherCostCents))
    );
    const comparison = evaluateActualVsEstimate(revision, actualDirectCostCents);

    expectedRevenue = expectedRevenue.plus(revision.actualQuotedPriceCents);
    expectedCost = expectedCost.plus(revision.trueCostCents);
    actualRevenue = actualRevenue.plus(revision.actualQuotedPriceCents);
    actualCost = actualCost.plus(comparison.actualTrueCostCents);
    if (comparison.actualMargin !== null) perJobActualMargins.push(comparison.actualMargin);

    perProjectDetail.push({
      projectId: project.id,
      projectName: project.name,
      quotedRevenueCents: revision.actualQuotedPriceCents,
      actualTrueCostCents: comparison.actualTrueCostCents,
      expectedMargin: comparison.expectedMargin,
      actualMargin: comparison.actualMargin,
      costVarianceCents: comparison.costVarianceCents,
      marginDeltaPoints: comparison.actualMargin !== null && comparison.expectedMargin !== null ? comparison.actualMargin - comparison.expectedMargin : null,
    });
  }

  const weightedExpectedMargin = expectedRevenue.isZero() ? null : fractionToPercent(expectedRevenue.minus(expectedCost).dividedBy(expectedRevenue));
  const weightedActualMargin = actualRevenue.isZero() ? null : fractionToPercent(actualRevenue.minus(actualCost).dividedBy(actualRevenue));

  // null (not $0) when there are simply no eligible jobs to total — see the
  // three fields' doc comments on ProfitabilitySummary.
  const totalQuotedRevenueCents = eligible.length === 0 ? null : fromDecimalToCents(actualRevenue);
  const totalActualTrueCostCents = eligible.length === 0 ? null : fromDecimalToCents(actualCost);
  const totalGrossProfitCents = totalQuotedRevenueCents === null || totalActualTrueCostCents === null ? null : totalQuotedRevenueCents - totalActualTrueCostCents;

  const mostOverBudgetProjectIds = perProjectDetail
    .filter((p) => p.costVarianceCents > 0)
    .sort((a, b) => b.costVarianceCents - a.costVarianceCents)
    .map((p) => p.projectId);

  const largestMarginDeteriorationProjectIds = perProjectDetail
    .filter((p) => p.marginDeltaPoints !== null && p.marginDeltaPoints < 0)
    .sort((a, b) => (a.marginDeltaPoints as number) - (b.marginDeltaPoints as number))
    .map((p) => p.projectId);

  return {
    completedCount: eligible.length,
    eligibleCount: eligible.length,
    excludedCount: excluded.length,
    exclusionReasons,
    weightedExpectedMargin,
    weightedActualMargin,
    averageActualMarginPerJob: average(perJobActualMargins),
    medianActualMarginPerJob: median(perJobActualMargins),
    eligibleProjectIds: eligible.map((p) => p.id),
    excludedProjectIds: excluded.map((p) => p.id),
    totalQuotedRevenueCents,
    totalActualTrueCostCents,
    totalGrossProfitCents,
    perProjectDetail,
    mostOverBudgetProjectIds,
    largestMarginDeteriorationProjectIds,
  };
}

// -- Cost-impact scenarios (brief killer features #16-18) -------------------

export type CostImpactKind = "material" | "equipment" | "labor";

/** A labor-rate change affects every assembly that bills any labor at all;
 * a material/equipment change affects only assemblies that actually use
 * that specific item. */
export function findAffectedAssemblies(assemblies: Assembly[], kind: CostImpactKind, itemId?: string): Assembly[] {
  if (kind === "labor") return assemblies.filter((a) => a.laborPersonHoursPerUnit > 0);
  if (kind === "material") return assemblies.filter((a) => a.materials.some((m) => m.materialId === itemId));
  return assemblies.filter((a) => a.equipment.some((e) => e.equipmentId === itemId));
}

/** Every record that would be left with a dangling reference if a given
 * material or equipment record were deleted right now — assemblies that use
 * it directly, templates that reference it directly (equipment can be added
 * to a template independent of any assembly) or transitively through one of
 * those affected assemblies, and projects the same way. Used to block a
 * catalog deletion by default and show the user exactly what it would break
 * (DEF-09) — a delete must never proceed silently and leave a quote
 * computing a lower cost than it should. */
export interface CatalogItemReferences {
  assemblies: Assembly[];
  templates: ProjectTemplate[];
  projects: Project[];
}

export function findCatalogItemReferences(kind: "material" | "equipment", itemId: string, workspace: { assemblies: Assembly[]; templates: ProjectTemplate[]; projects: Project[] }): CatalogItemReferences {
  const affectedAssemblies = findAffectedAssemblies(workspace.assemblies, kind, itemId);
  const affectedAssemblyIds = new Set(affectedAssemblies.map((a) => a.id));

  const templates = workspace.templates.filter(
    (t) =>
      t.serviceLines.some((l) => affectedAssemblyIds.has(l.assemblyId)) ||
      (kind === "equipment" && t.equipmentLines.some((l) => l.equipmentId === itemId))
  );

  const projects = workspace.projects.filter(
    (p) =>
      p.serviceLines.some((l) => affectedAssemblyIds.has(l.assemblyId)) ||
      (kind === "equipment" && p.equipmentLines.some((l) => l.equipmentId === itemId))
  );

  return { assemblies: affectedAssemblies, templates, projects };
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
  quotedProjectFigures: Record<string, { marginPercent: number | null; trueCostCents: number }>;
}

export interface ProjectedCostImpact {
  projectedDirectCostCents: MoneyCents;
  /** Always computed with the LOCKED revision.overheadPercent — never the
   * project's current (possibly since-edited) overheadPercent, and never the
   * business's current overhead setting. */
  projectedOverheadCents: MoneyCents;
  projectedTrueCostCents: MoneyCents;
  projectedMargin: number | null;
  trueCostDeltaCents: number;
  marginPointDelta: number | null;
}

/**
 * Reprices a locked quote revision's own quantities (never the live
 * project's — those may have been edited since quoting) against a CURRENT
 * cost catalog, using the revision's LOCKED overhead rate throughout. Never
 * mutates the revision.
 */
export function projectCostImpactForRevision(
  revision: QuoteRevision,
  currentAssemblies: Assembly[],
  currentMaterials: Material[],
  currentEquipment: Equipment[],
  currentLoadedLaborRateCents: number
): ProjectedCostImpact {
  const assemblyById = new Map(currentAssemblies.map((a) => [a.id, a]));
  const equipmentById = new Map(currentEquipment.map((e) => [e.id, e]));

  let directCost = new Decimal(0);
  for (const line of revision.serviceLines) {
    const assembly = assemblyById.get(line.assemblyId);
    if (!assembly) continue; // deleted from the catalog since quoting — contributes nothing, not fabricated
    const perUnit = calculateAssemblyCost(assembly, currentMaterials, currentEquipment, currentLoadedLaborRateCents, 0);
    directCost = directCost.plus(new Decimal(safeCents(perUnit.directCostPerUnitCents)).times(safeD(line.quantity)));
  }
  for (const line of revision.equipmentLines) {
    const item = equipmentById.get(line.equipmentId);
    if (!item) continue;
    directCost = directCost.plus(equipmentUnitCostCents(item, line.quantity));
  }
  for (const line of revision.laborLines) {
    directCost = directCost.plus(safeCents(line.laborCostCents));
  }
  directCost = directCost.plus(safeCents(revision.deliveryCostCents));
  for (const extra of revision.extraCosts) {
    directCost = directCost.plus(safeCents(extra.amountCents));
  }

  const overheadFraction = percentToFraction(revision.overheadPercent);
  const projectedOverhead = directCost.times(overheadFraction);
  const projectedTrueCost = directCost.plus(projectedOverhead);
  const projectedTrueCostCents = fromDecimalToCents(projectedTrueCost);
  const projectedMargin = calculateMargin(revision.actualQuotedPriceCents, projectedTrueCostCents);

  return {
    projectedDirectCostCents: fromDecimalToCents(directCost),
    projectedOverheadCents: fromDecimalToCents(projectedOverhead),
    projectedTrueCostCents,
    projectedMargin,
    trueCostDeltaCents: projectedTrueCostCents - revision.trueCostCents,
    marginPointDelta: projectedMargin !== null && revision.achievedMargin !== null ? projectedMargin - revision.achievedMargin : null,
  };
}

/** Captures which assemblies/templates/open estimates a rate change touches,
 * and which of those open estimates are currently below their own target
 * margin — call once before a rate edit and once after to see exactly what
 * changed (brief killer features #16-18: "6 estimates now below target"). */
export function snapshotCostImpact(kind: CostImpactKind, itemId: string | undefined, workspace: CostImpactWorkspace): CostImpactSnapshot {
  const affected = findAffectedAssemblies(workspace.assemblies, kind, itemId);
  const affectedIds = new Set(affected.map((a) => a.id));

  const affectedTemplateIds = workspace.templates.filter((t) => t.serviceLines.some((l) => affectedIds.has(l.assemblyId))).map((t) => t.id);

  const openProjects = workspace.projects.filter((p) => {
    if (p.status === "archived") return false;
    if (p.serviceLines.some((l) => affectedIds.has(l.assemblyId))) return true;
    const revision = getActiveRevision(p);
    return revision ? revision.serviceLines.some((l) => affectedIds.has(l.assemblyId)) : false;
  });

  const quotedProjectFigures: CostImpactSnapshot["quotedProjectFigures"] = {};
  const belowTargetProjectIds: string[] = [];
  for (const p of openProjects) {
    const revision = getActiveRevision(p);
    if (!revision) continue;
    const projected = projectCostImpactForRevision(revision, workspace.assemblies, workspace.materials, workspace.equipment, workspace.business.loadedLaborRateCents);
    quotedProjectFigures[p.id] = { marginPercent: projected.projectedMargin, trueCostCents: projected.projectedTrueCostCents };
    if (projected.projectedMargin !== null && projected.projectedMargin < p.targetMarginPercent) belowTargetProjectIds.push(p.id);
  }

  return {
    affectedAssemblyIds: [...affectedIds],
    affectedTemplateIds,
    affectedProjectIds: openProjects.map((p) => p.id),
    belowTargetProjectIds,
    quotedProjectFigures,
  };
}

export type TargetStatus = "above-target" | "below-target" | "unpriced";
export type ImpactDirection = "improved" | "worsened" | "unchanged";
export type ThresholdTransition = "newly-below" | "recovered-above" | "no-crossing";

/** Margin-point tolerance below which a change counts as "unchanged" rather
 * than a genuine improvement/worsening. */
export const IMPACT_UNCHANGED_TOLERANCE_POINTS = 0.01;

export interface ProjectCostImpact {
  projectId: string;
  targetStatus: TargetStatus;
  impactDirection: ImpactDirection | null;
  thresholdTransition: ThresholdTransition | null;
  marginPointsDelta: number | null;
  trueCostDeltaCents: number;
}

/**
 * Classifies exactly what a rate change did to each affected project, along
 * three independent axes rather than one combined flag. A draft with no
 * quote revision yet is `unpriced` on all three.
 */
export function classifyCostImpact(before: CostImpactSnapshot, after: CostImpactSnapshot): ProjectCostImpact[] {
  return after.affectedProjectIds.map((projectId): ProjectCostImpact => {
    const afterFig = after.quotedProjectFigures[projectId];
    if (!afterFig) {
      return { projectId, targetStatus: "unpriced", impactDirection: null, thresholdTransition: null, marginPointsDelta: null, trueCostDeltaCents: 0 };
    }

    const beforeFig = before.quotedProjectFigures[projectId];
    const wasBelow = before.belowTargetProjectIds.includes(projectId);
    const isBelow = after.belowTargetProjectIds.includes(projectId);

    const targetStatus: TargetStatus = isBelow ? "below-target" : "above-target";

    const marginPointsDelta = beforeFig && beforeFig.marginPercent !== null && afterFig.marginPercent !== null ? afterFig.marginPercent - beforeFig.marginPercent : null;

    const impactDirection: ImpactDirection | null =
      marginPointsDelta === null ? null : Math.abs(marginPointsDelta) <= IMPACT_UNCHANGED_TOLERANCE_POINTS ? "unchanged" : marginPointsDelta > 0 ? "improved" : "worsened";

    let thresholdTransition: ThresholdTransition = "no-crossing";
    if (!wasBelow && isBelow) thresholdTransition = "newly-below";
    else if (wasBelow && !isBelow) thresholdTransition = "recovered-above";

    const trueCostDeltaCents = afterFig.trueCostCents - (beforeFig?.trueCostCents ?? afterFig.trueCostCents);

    return { projectId, targetStatus, impactDirection, thresholdTransition, marginPointsDelta, trueCostDeltaCents };
  });
}

// -- Overhead-change cost-impact scenario ------------------------------------
//
// Overhead doesn't fit the CostImpactKind machinery above: a material or
// equipment rate is one shared catalog record every assembly either does or
// doesn't reference, so "before/after" means editing that one record. But
// overhead is a PERCENT stored per-project (each project may already carry
// its own value, inherited from — but independent of — the business-wide
// default), so there's no single shared "current rate" to edit. Instead this
// answers a hypothetical directly: "if I quoted at a DIFFERENT overhead
// percent than whatever a project already has, what would change?" — for
// both an open (draft) project and an already-locked quote, without ever
// mutating either.

/** What a project's live draft would look like at a hypothetical overhead
 * percent instead of whatever it currently has stored — a pure calculation,
 * the project itself is never modified (a fresh object is passed to
 * `evaluateProject`, never `project` itself). */
export function evaluateProjectAtOverhead(
  project: Project,
  assemblies: Assembly[],
  materials: Material[],
  equipment: Equipment[],
  business: BusinessSettings,
  overheadPercent: number
): ProjectEstimateResult {
  return evaluateProject({ ...project, overheadPercent }, assemblies, materials, equipment, business);
}

/** What an already-LOCKED quote revision's true cost and achieved margin
 * would be if it had been quoted at a different overhead percent — computed
 * from the revision's own frozen direct-cost components, which is why this
 * never needs the current catalog at all. The revision itself is never
 * modified; this only ever returns a new, separate result for comparison. */
export function evaluateRevisionAtOverhead(revision: QuoteRevision, overheadPercent: number): { trueCostCents: MoneyCents; achievedMargin: number | null } {
  const overheadFraction = percentToFraction(overheadPercent);
  const trueCostCents = fromDecimalToCents(new Decimal(revision.directCostCents).times(new Decimal(1).plus(overheadFraction)));
  const achievedMargin = calculateMargin(revision.actualQuotedPriceCents, trueCostCents);
  return { trueCostCents, achievedMargin };
}

export interface OverheadScenarioResult {
  projectId: string;
  projectName: string;
  isLocked: boolean;
  /** Each project's own overhead percent right now — never assumed to be
   * the business-wide default, since a project can carry its own value. */
  baselineOverheadPercent: number;
  baselineMargin: number | null;
  scenarioMargin: number | null;
  /** True only when the baseline was AT OR ABOVE the project's own target
   * margin and the scenario rate would drop it below — the one transition
   * worth calling out, same convention as `classifyCostImpact`. */
  crossesBelowTarget: boolean;
}

/** Runs the overhead-scenario hypothetical across every project in the
 * workspace — open (draft) and locked alike — using each project's own
 * current data as the baseline. Nothing here is persisted or mutates any
 * project/revision; it's purely for showing "what would change" before the
 * user decides to actually edit anyone's overhead percent. */
export function evaluateOverheadScenario(
  scenarioOverheadPercent: number,
  workspace: { assemblies: Assembly[]; materials: Material[]; equipment: Equipment[]; business: BusinessSettings; projects: Project[] }
): OverheadScenarioResult[] {
  return workspace.projects.map((project) => {
    const revision = getActiveRevision(project);
    const baselineMargin = revision ? calculateMargin(revision.actualQuotedPriceCents, revision.trueCostCents) : evaluateProject(project, workspace.assemblies, workspace.materials, workspace.equipment, workspace.business).expectedMargin;
    const scenarioMargin = revision
      ? evaluateRevisionAtOverhead(revision, scenarioOverheadPercent).achievedMargin
      : evaluateProjectAtOverhead(project, workspace.assemblies, workspace.materials, workspace.equipment, workspace.business, scenarioOverheadPercent).expectedMargin;

    const wasAtOrAboveTarget = baselineMargin !== null && baselineMargin >= project.targetMarginPercent;
    const isNowBelowTarget = scenarioMargin !== null && scenarioMargin < project.targetMarginPercent;

    return {
      projectId: project.id,
      projectName: project.name,
      isLocked: revision !== null,
      baselineOverheadPercent: project.overheadPercent,
      baselineMargin,
      scenarioMargin,
      crossesBelowTarget: wasAtOrAboveTarget && isNowBelowTarget,
    };
  });
}
