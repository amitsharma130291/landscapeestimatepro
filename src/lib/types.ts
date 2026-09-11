// Shared domain types for the estimating/job-costing engine. Pure data — no logic here.
import type { MoneyCents } from "./money";

export type MaterialUnit =
  | "each"
  | "sqft"
  | "linear-ft"
  | "yd3"
  | "ft3"
  | "ton"
  | "bag"
  | "pallet"
  | "hour"
  | "job"
  | "custom";

export type EquipmentRateType = "hour" | "day" | "job" | "custom";

/**
 * Every percentage/rate field in this file is named with an explicit
 * `*Percent` suffix and stored as a WHOLE NUMBER (35 means 35%, not 0.35) —
 * this is the one canonical persisted representation, chosen over 0–1
 * decimal fractions for backward compatibility with existing saved
 * workspaces. Never read or write one of these fields without going through
 * `percentToFraction()` / `fractionToPercent()` in `calc.ts` — no domain
 * function divides or multiplies by 100 inline anywhere else, specifically
 * so "35" and "0.35" can never be silently swapped for each other. A bare
 * `number` with no `Percent` suffix appearing near one of these fields is a
 * decimal fraction (0–1) or an unrelated quantity, never a percent.
 */
export type PercentValue = number;

/**
 * Increments a customer-facing quote can be rounded UP to, in CENTS (not
 * dollars) — $0.01/$1/$5/$10/$25/$50 become 1/100/500/1000/2500/5000.
 * Canonical home for this type — calc.ts imports it rather than redefining
 * it, since BusinessSettings/QuoteRevision below need it too and types.ts
 * must not import from calc.ts (calc.ts already imports domain types from
 * here).
 */
export type RoundingIncrementCents = 1 | 100 | 500 | 1000 | 2500 | 5000;

export interface Material {
  id: string;
  name: string;
  unitCostCents: MoneyCents;
  unit: MaterialUnit;
  customUnitLabel?: string;
  archived?: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  rateCents: MoneyCents;
  rateType: EquipmentRateType;
  customUnitLabel?: string;
  archived?: boolean;
}

/** Business-wide assumptions the contractor sets once and reuses everywhere.
 * All percentages are stored as whole numbers (35 means 35%, not 0.35) — see
 * the `PercentValue` doc comment above. All money is integer cents — see
 * `MoneyCents` in `money.ts`. Nothing in this interface is a raw
 * floating-point dollar amount. */
export interface BusinessSettings {
  loadedLaborRateCents: MoneyCents; // per person-hour, already loaded (wages + burden)
  /** How the loaded rate above was derived — purely informational (doesn't
   * change the math, which always takes the final cents/hour), but documents
   * whether burden has already been folded in, so a contractor editing this
   * number later knows not to add burden a second time. */
  laborRateBasis: "already-loaded" | "base-plus-percentage-burden" | "base-plus-component-burden";
  overheadPercent: PercentValue; // % of direct cost
  targetMarginPercent: PercentValue; // % of selling price — must satisfy 0 <= x < 100
  defaultDeliveryCostCents: MoneyCents;
  minimumProjectPriceCents: MoneyCents;
  /** How a required price rounds up into a customer-facing quote. */
  roundingIncrementCents: RoundingIncrementCents;
  /** Sales tax applied to taxable pre-tax revenue. 0 = no tax. Line-level
   * taxable status (ProjectServiceLine.taxable etc.) decides what portion of
   * a given quote this actually applies to — see allocateRevenue(). */
  taxRatePercent: PercentValue;
  /** The contractor's own designated "typical small job" true cost, used by
   * the Minimum Job Audit. Deliberately NOT derived by averaging every saved
   * project — see evaluateMinimumJob's doc comment for why that's wrong. */
  representativeMinimumJobTrueCostCents?: MoneyCents;
  businessName?: string;
  businessLogoDataUrl?: string; // small logo, stored inline (no backend) for branded estimates
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  loadedLaborRateCents: 3200 as MoneyCents,
  laborRateBasis: "already-loaded",
  overheadPercent: 15,
  targetMarginPercent: 35,
  defaultDeliveryCostCents: 15000 as MoneyCents,
  minimumProjectPriceCents: 50000 as MoneyCents,
  roundingIncrementCents: 100,
  taxRatePercent: 0,
};

// -- Labor -------------------------------------------------------------

/** How a service assembly's per-unit labor figure was derived — the two
 * per-unit modes are reciprocals of each other (see resolvePersonHoursPerUnit
 * in calc.ts), and the app never silently converts between them for a
 * zero/invalid value. "crew-duration" is a distinct, NON-per-unit mode
 * (crew size × elapsed hours produces a flat total for a job, not a rate
 * that scales with quantity) — it lives on a project's ad-hoc labor line,
 * never on a reusable per-unit Assembly; see ProjectLaborLine.
 * "legacy-unknown" marks a quote-revision line captured before this
 * distinction existed — its person-hours are kept (nothing is discarded)
 * but must never be presented as being on the same footing as a line whose
 * basis is actually known. */
export type AssemblyLaborInputMode = "production-rate" | "person-hours-per-unit";
export type LaborMode = AssemblyLaborInputMode | "crew-duration" | "legacy-unknown";

export interface DirectLaborInput {
  mode: "direct";
  crewSize: number;
  hours: number;
  loadedRateCents: MoneyCents;
}

export interface ProductionLaborInput {
  mode: "production";
  quantity: number; // units of work (e.g. 8 yd3, 220 linear ft)
  productionRate: number; // units of work per person-hour — NEVER units per crew-hour
  loadedRateCents: MoneyCents;
}

export type LaborInput = DirectLaborInput | ProductionLaborInput;

export interface LaborResult {
  personHours: number;
  laborCostCents: MoneyCents;
}

/**
 * An explicit, ad-hoc "crew worked N hours" labor line on a project —
 * distinct from assembly-based per-unit labor. Doesn't scale with a
 * quantity; the crew's elapsed time IS the whole cost. Use this for labor
 * that isn't cleanly attributable to a reusable per-unit service (e.g. site
 * cleanup, a change-order crew day) rather than forcing it into an
 * Assembly's per-unit model.
 */
export interface ProjectLaborLine {
  id: string;
  label: string;
  mode: "crew-duration";
  crewSize: number;
  elapsedHours: number;
  loadedRateCents: MoneyCents;
  taxable?: boolean;
}

// -- Project cost roll-up ------------------------------------------------

export interface ProjectCostInputsCents {
  materialsCostCents: MoneyCents;
  laborCostCents: MoneyCents;
  equipmentCostCents: MoneyCents;
  deliveryCostCents: MoneyCents;
  otherCostCents: MoneyCents;
  overheadPercent: PercentValue;
}

export interface ProjectCostResultCents {
  directCostCents: MoneyCents;
  overheadAmountCents: MoneyCents;
  trueCostCents: MoneyCents;
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
  /** How laborPersonHoursPerUnit below was derived — explicit, not inferred.
   * "person-hours-per-unit": the contractor typed the per-unit hours figure
   * directly. "production-rate": the contractor typed a production rate
   * (units of work per person-hour, e.g. 2.5 yd3/person-hour) and this field
   * is the app's own derived reciprocal — see laborProductionRate below and
   * resolvePersonHoursPerUnit() in calc.ts, which performs that conversion
   * and refuses to invent a value from a zero/invalid rate. */
  laborInputMode: AssemblyLaborInputMode;
  /** Person-hours needed per one unit of this assembly — the single value
   * every cost calculation actually uses, regardless of laborInputMode. When
   * laborInputMode is "production-rate" this is DERIVED (kept in sync
   * whenever laborProductionRate changes) rather than independently edited;
   * this field is never itself multiplied by quantity to "save time" —
   * evaluateProject() always does quantity × this value, which is
   * dimensionally the same as quantity ÷ productionRate. */
  laborPersonHoursPerUnit: number;
  /** Only meaningful (and only shown in the UI) when laborInputMode is
   * "production-rate": units of this assembly's own `unit` completed per
   * person-hour. Kept alongside the derived laborPersonHoursPerUnit so the
   * contractor's original, more intuitive number is never silently lost. */
  laborProductionRate?: number;
  equipment: AssemblyEquipmentLine[];
  otherCostPerUnitCents: MoneyCents;
  currentRateCents?: MoneyCents; // the contractor's current charge per unit, for Rate Health
  archived?: boolean;
}

export interface AssemblyCostResult {
  materialCostPerUnitCents: MoneyCents;
  laborCostPerUnitCents: MoneyCents;
  equipmentCostPerUnitCents: MoneyCents;
  otherCostPerUnitCents: MoneyCents;
  /** materials + labor + equipment + other, per unit. Overhead is NOT
   * included here — this is the allocation base overhead applies to, not a
   * cost figure to quote from directly. */
  directCostPerUnitCents: MoneyCents;
  /** directCostPerUnitCents × the business's overhead rate. */
  overheadPerUnitCents: MoneyCents;
  /** directCostPerUnitCents + overheadPerUnitCents. This is the ONLY field
   * on this type it is correct to call "true cost" — do not use
   * directCostPerUnitCents (or the individual material/labor/equipment/other
   * components) as a stand-in for true cost anywhere a required rate or
   * margin is computed. */
  trueCostPerUnitCents: MoneyCents;
}

/** "invalid" means the target margin itself is ≥100%/negative, so no
 * required rate exists to compare against — never silently reported as
 * "healthy" or guessed at. */
export type RateHealthStatus = "healthy" | "attention" | "critical" | "invalid";

export interface RateHealthResult {
  /** Overhead-INCLUSIVE true cost per unit — see AssemblyCostResult.trueCostPerUnitCents. */
  trueCostPerUnitCents: MoneyCents;
  currentRateCents: MoneyCents;
  currentMargin: PercentValue | null;
  requiredRateCents: MoneyCents | null;
  gapPerUnitCents: number | null; // requiredRateCents - currentRateCents (positive = underpriced); not branded MoneyCents since it may be negative
  status: RateHealthStatus;
}

// -- Projects / estimates -------------------------------------------------

export interface ProjectServiceLine {
  id: string;
  assemblyId: string;
  quantity: number;
  /** Whether this line's revenue is subject to sales tax. Undefined is
   * treated as taxable (true) for backward compatibility with data saved
   * before per-line tax status existed. */
  taxable?: boolean;
}

export interface ProjectExtraCost {
  id: string;
  label: string;
  amountCents: MoneyCents;
  taxable?: boolean;
}

export interface ProjectEquipmentLine {
  equipmentId: string;
  quantity: number;
  taxable?: boolean;
}

// -- Quote revisions -------------------------------------------------------

export const QUOTE_REVISION_SCHEMA_VERSION = 4;

/** Frozen copy of one service line's per-unit cost basis at the moment a
 * quote revision was created — NOT a reference to the live assembly. Editing
 * the assembly's materials/labor/equipment later (or a catalog price) never
 * retroactively changes what this revision says the job was quoted from. */
export interface QuoteRevisionServiceLine {
  assemblyId: string;
  assemblyName: string;
  unit: MaterialUnit;
  quantity: number;
  taxable: boolean;
  materialCostPerUnitCents: MoneyCents;
  laborCostPerUnitCents: MoneyCents;
  laborPersonHoursPerUnit: number;
  equipmentCostPerUnitCents: MoneyCents;
  otherCostPerUnitCents: MoneyCents;
  /** How the locked labor figure above was derived. "legacy-unknown" marks a
   * line migrated from data that predates this distinction — its hours are
   * kept (nothing is discarded) but must never be presented as being on the
   * same footing as a line whose basis is actually known. */
  laborMode: LaborMode;
  /** The contractor's ORIGINAL entered value at quote time, in its original
   * unit — e.g. 2.5 (production rate) or 0.4 (hours per unit). Null when
   * laborMode is "legacy-unknown" (no original value was ever captured). */
  laborOriginalValue: number | null;
  /** Unit label for laborOriginalValue — e.g. "yd3/person-hour" for
   * production-rate mode, "hrs/unit" for person-hours-per-unit mode. Null
   * alongside laborOriginalValue for legacy-unknown lines. */
  laborOriginalUnit: string | null;
}

export interface QuoteRevisionEquipmentLine {
  equipmentId: string;
  equipmentName: string;
  quantity: number;
  taxable: boolean;
  rateCents: MoneyCents;
  rateType: EquipmentRateType;
}

/** A locked, frozen copy of one ad-hoc crew-duration labor line — see
 * ProjectLaborLine. Captured the same way as every other line: original
 * mode, original inputs, and the resulting cost, all frozen at quote time. */
export interface QuoteRevisionLaborLine {
  label: string;
  taxable: boolean;
  mode: "crew-duration";
  crewSize: number;
  elapsedHours: number;
  personHours: number;
  loadedRateCents: MoneyCents;
  laborCostCents: MoneyCents;
}

/**
 * An immutable historical record of one version of a project's quote.
 * QuoteRevisions are append-only: creating a new one (an explicit "Re-quote"
 * action) never edits or removes an earlier one — every past revision stays
 * exactly as it was computed, forever. This is what makes estimate-vs-actual,
 * cost-impact analysis, and profitability reporting historically honest: they
 * compare against what was ACTUALLY quoted at the time, never against a live
 * recalculation using today's catalog/labor/overhead/margin settings (which
 * would silently rewrite history every time a price changes).
 *
 * Three distinct prices live on every revision, and callers must not
 * conflate them:
 *   - exactRequiredPriceCents:      the price a target margin implies, rounded
 *                                   only to the nearest cent for reporting —
 *                                   never used for further math (see its doc
 *                                   comment)
 *   - roundedRecommendedPriceCents: the customer-facing recommendation,
 *                                   rounded UP to the chosen increment from
 *                                   the UNROUNDED exact value
 *   - actualQuotedPriceCents:       what the contractor actually told the
 *                                   customer — equals roundedRecommendedPriceCents
 *                                   unless manually overridden (e.g. after a
 *                                   negotiation)
 * All historical profitability, cost-impact, and estimate-vs-actual math uses
 * actualQuotedPriceCents, never the other two. Every money field on this
 * interface is an integer number of cents (MoneyCents) — never a floating-
 * point dollar amount.
 */
export interface QuoteRevision {
  id: string;
  projectId: string;
  revisionNumber: number;
  previousRevisionId: string | null;
  createdAt: string;
  /** Optional free-text note on why this revision was created (e.g. "customer
   * requested larger patio", "price-matched a competitor"). */
  reason?: string;
  calculationSchemaVersion: number;
  roundingIncrementCents: RoundingIncrementCents;
  serviceLines: QuoteRevisionServiceLine[];
  equipmentLines: QuoteRevisionEquipmentLine[];
  laborLines: QuoteRevisionLaborLine[];
  deliveryCostCents: MoneyCents;
  deliveryTaxable: boolean;
  extraCosts: ProjectExtraCost[];
  loadedLaborRateCents: MoneyCents;
  laborRateBasis: BusinessSettings["laborRateBasis"];
  overheadPercent: PercentValue;
  targetMarginPercent: PercentValue;
  taxRatePercent: PercentValue;
  directCostCents: MoneyCents;
  overheadAmountCents: MoneyCents;
  /** Exact true cost, rounded only to the nearest cent for reporting — never
   * pre-rounded before that (see calc.ts calculateQuotePricingCents). */
  trueCostCents: MoneyCents;
  /** Reporting/audit value only — the mathematically exact required price
   * (true cost ÷ (1 − margin)), rounded HALF-UP to the nearest cent purely so
   * it can be stored as a MoneyCents integer. The actual pricing chain never
   * routes through this rounded value — roundedRecommendedPriceCents is
   * always computed by ceiling-rounding the UNROUNDED Decimal result
   * directly, inside calculateQuotePricingCents. */
  exactRequiredPriceCents: MoneyCents;
  roundedRecommendedPriceCents: MoneyCents;
  /** What was actually charged. Defaults to roundedRecommendedPriceCents; set
   * explicitly when the contractor overrides it. This is the figure every
   * historical calculation elsewhere in the app must use. */
  actualQuotedPriceCents: MoneyCents;
  /** Sum of taxable lines' allocated cents only — see revenueAllocation. */
  taxableSubtotalCents: MoneyCents;
  taxAmountCents: MoneyCents;
  /** actualQuotedPriceCents + taxAmountCents — what the customer actually owes. */
  customerTotalCents: MoneyCents;
  grossProfitCents: MoneyCents;
  /** The margin at actualQuotedPriceCents against exact true cost, computed pre-tax. */
  achievedMargin: PercentValue | null;
  /** Set when this revision's cost basis could not be fully reconstructed
   * (a data migration from a version that only stored a final price). Such a
   * revision's per-line figures are NOT genuine history — see
   * historicalCostBasisStatus for what's actually known vs. approximate. */
  isLegacyMigration?: boolean;
  historicalCostBasisStatus: "known" | "unknown";
  /** actualQuotedPriceCents allocated exactly across every revenue-bearing
   * line (service lines, equipment lines, labor lines, delivery, extra
   * costs), using a deterministic largest-remainder method — see
   * allocateRevenue() in estimateMath.ts. Sum of every
   * allocatedSellingPriceCents here always equals actualQuotedPriceCents
   * exactly; no cent is lost or invented. This is the authoritative per-line
   * taxable revenue split — taxableSubtotalCents above is derived by summing
   * the taxable rows here. */
  revenueAllocation: RevenueAllocationLine[];
}

export interface RevenueAllocationLine {
  /** Stable identity for this row — `service:{index}`, `equipment:{index}`,
   * `labor:{index}`, `delivery`, or `extra:{index}` — used only as the
   * allocateCents tie-breaker key and for matching a row back to its source
   * line. */
  key: string;
  label: string;
  taxable: boolean;
  /** This line's direct-cost weight — the basis the allocation is
   * proportional to (see evaluateProjectCents's taxableSubtotal doc comment
   * for why cost-share is the chosen allocation basis). */
  directCostCents: MoneyCents;
  allocatedSellingPriceCents: MoneyCents;
}

export interface Project {
  id: string;
  name: string;
  customerName?: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "sent" | "won" | "lost" | "archived";
  serviceLines: ProjectServiceLine[];
  equipmentLines: ProjectEquipmentLine[];
  laborLines: ProjectLaborLine[];
  deliveryCostCents: MoneyCents;
  deliveryTaxable?: boolean;
  extraCosts: ProjectExtraCost[];
  overheadPercent: PercentValue;
  targetMarginPercent: PercentValue;
  taxRatePercent: PercentValue;
  notes?: string;
  actual?: ProjectActuals;
  /** Every quote revision ever created for this project, oldest first.
   * Append-only — see QuoteRevision's doc comment. Empty until the project
   * first leaves "draft". */
  quoteRevisions: QuoteRevision[];
  /** Which revision is current. Always the most recently created one in
   * practice (nothing in this app lets a contractor "revert" to an older
   * revision as active — Re-quote only ever appends forward), but kept as an
   * explicit pointer rather than "last item in the array" so a future
   * revert feature wouldn't need a data-model change. */
  activeQuoteRevisionId?: string;
  /** Which revision the customer actually accepted, and when — set once, by
   * `buildAcceptancePatch()`, the moment status moves to "won". A later
   * re-quote (a new entry in `quoteRevisions`) never touches these fields:
   * the acceptance record always points at the revision that was actually
   * accepted, not whatever the newest one happens to be. Undefined on any
   * project that predates this field or was never accepted. */
  acceptedRevisionId?: string;
  acceptedAt?: string;
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
  actualMaterialsCostCents: MoneyCents;
  actualEquipmentCostCents: MoneyCents;
  actualDeliveryCostCents: MoneyCents;
  actualOtherCostCents: MoneyCents;
  finalSellingPriceCents: MoneyCents;
  completedAt: string;
  serviceLineActuals?: ServiceLineActual[];
}

export interface ProjectEstimateResult {
  materialsCostCents: MoneyCents;
  laborCostCents: MoneyCents;
  laborPersonHours: number;
  equipmentCostCents: MoneyCents;
  deliveryCostCents: MoneyCents;
  otherCostCents: MoneyCents;
  directCostCents: MoneyCents;
  overheadAmountCents: MoneyCents;
  /** Exact true cost, rounded only to the nearest cent for reporting. */
  trueCostCents: MoneyCents;
  /** Reporting value only — see QuoteRevision.exactRequiredPriceCents for why
   * this is never used for further math. `null` when the project's target
   * margin is invalid (≥100% or negative) — a blocked state, not a number to
   * guess at. See calc.ts calculateRequiredPriceCents. */
  requiredSellingPriceCents: MoneyCents | null;
  /** requiredSellingPriceCents' UNROUNDED source, rounded UP to the
   * business's rounding increment — the live-draft equivalent of
   * QuoteRevision.roundedRecommendedPriceCents. A DRAFT project has no
   * actualQuotedPriceCents yet (nothing has been quoted); once it does, quote
   * revisions are the source of truth, not this live figure. */
  displayPriceCents: MoneyCents | null;
  /** Margin actually achieved at displayPriceCents (pre-tax), recomputed from
   * the rounded price against the exact true cost — not assumed to equal
   * target. */
  expectedMargin: PercentValue | null;
  /** Sum of taxable lines' allocated cents — computed via the SAME exact
   * largest-remainder allocation a locked QuoteRevision uses (see
   * allocateRevenue()), so a live draft preview and a just-locked revision
   * agree exactly when nothing else has changed in between. */
  taxableSubtotalCents: MoneyCents | null;
  /** Sales tax on taxableSubtotalCents, using the project's own taxRatePercent. */
  taxAmountCents: MoneyCents | null;
  /** displayPriceCents + taxAmountCents — what the customer would owe today. */
  customerTotalCents: MoneyCents | null;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  serviceLines: { assemblyId: string; quantity: number }[];
  equipmentLines: { equipmentId: string; quantity: number }[];
  deliveryCostCents: MoneyCents;
  extraCosts: ProjectExtraCost[];
}

export interface Workspace {
  version: 5;
  business: BusinessSettings;
  materials: Material[];
  equipment: Equipment[];
  assemblies: Assembly[];
  projects: Project[];
  templates: ProjectTemplate[];
}
