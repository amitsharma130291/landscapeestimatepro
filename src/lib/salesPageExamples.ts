/**
 * Every number shown on the landscaping-estimating-software sales page's
 * financial proof sections (hero demo, margin-vs-markup, Service Rate
 * Health, estimate-vs-actual) is computed HERE, by calling this app's own
 * real pricing engine (calc.ts / estimateMath.ts) — never hand-typed into
 * marketing copy. This is what lets salesPageExamples.test.ts assert the
 * page's displayed numbers reconcile exactly, and what makes it structurally
 * impossible for the page to show a number the real app wouldn't produce.
 *
 * Every input below belongs to one clearly-labeled illustrative project —
 * not a real customer, not a report on real usage. See each export's own
 * comment for what it represents.
 */
import { calculateExactPricingChainCents, calculateMargin, calculatePriceFromMarkupCents } from "./calc";
import { calculateAssemblyCost, evaluateRateHealth } from "./estimateMath";
import type { MoneyCents } from "./money";
import { SAMPLE_ASSEMBLIES, SAMPLE_EQUIPMENT, SAMPLE_MATERIALS } from "./sampleData";
import type { ProjectCostInputsCents, RoundingIncrementCents } from "./types";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";

// ---------------------------------------------------------------------------
// The example project — reused across the hero demo, the margin-vs-markup
// proof, and the estimate-vs-actual proof, so a reader who scrolls through
// the whole page is following ONE project, not a new invented number every
// section.
// ---------------------------------------------------------------------------

export const EXAMPLE_PROJECT_LABEL = "Example project — patio & planting install";

export const EXAMPLE_TARGET_MARGIN_PERCENT = 35;
/** Round every customer-facing quote up to the nearest whole dollar. */
export const EXAMPLE_ROUNDING_INCREMENT_CENTS: RoundingIncrementCents = 100;
/** Well under the required price on this job, so it never actually applies
 * here — shown anyway so the row demonstrates what the feature does. */
export const EXAMPLE_MINIMUM_PROJECT_PRICE_CENTS = 150000 as MoneyCents; // $1,500.00

const EXAMPLE_PROJECT_INPUTS: ProjectCostInputsCents = {
  materialsCostCents: 140000 as MoneyCents, // $1,400.00
  laborCostCents: 80000 as MoneyCents, // $800.00 — 25.0 person-hours @ a $32.00/hr loaded labor rate
  equipmentCostCents: 15000 as MoneyCents, // $150.00
  deliveryCostCents: 10000 as MoneyCents, // $100.00
  otherCostCents: 5000 as MoneyCents, // $50.00
  overheadPercent: 14,
};

export const examplePricing = calculateExactPricingChainCents(EXAMPLE_PROJECT_INPUTS, EXAMPLE_TARGET_MARGIN_PERCENT, EXAMPLE_ROUNDING_INCREMENT_CENTS);

export const exampleLineItems: { label: string; cents: MoneyCents }[] = [
  { label: "Materials", cents: EXAMPLE_PROJECT_INPUTS.materialsCostCents },
  { label: "Labor — 25.0 person-hours @ $32.00/hr", cents: EXAMPLE_PROJECT_INPUTS.laborCostCents },
  { label: "Equipment", cents: EXAMPLE_PROJECT_INPUTS.equipmentCostCents },
  { label: "Delivery", cents: EXAMPLE_PROJECT_INPUTS.deliveryCostCents },
  { label: "Other", cents: EXAMPLE_PROJECT_INPUTS.otherCostCents },
];

/** True when the configured minimum project price is actually the binding
 * floor on this job (i.e. it exceeds the margin-based required price). */
export const exampleMinimumPriceApplies =
  examplePricing.roundedRecommendedPriceCents !== null && EXAMPLE_MINIMUM_PROJECT_PRICE_CENTS > examplePricing.roundedRecommendedPriceCents;

// ---------------------------------------------------------------------------
// Margin-vs-markup proof: what a flat 35% markup on this project's true cost
// would charge, versus the price this app's own required-price formula
// calculates to actually hit a 35% MARGIN.
// ---------------------------------------------------------------------------

export const markupComparisonPriceCents = calculatePriceFromMarkupCents(examplePricing.trueCostCents, EXAMPLE_TARGET_MARGIN_PERCENT);
export const markupComparisonMargin = calculateMargin(markupComparisonPriceCents, examplePricing.trueCostCents);

/** The exact (HALF-UP-to-the-cent) required price — the number the margin
 * proof card shows, distinct from the rounded-to-increment quote used
 * elsewhere on the page for the same project. */
export const marginComparisonPriceCents = examplePricing.exactRequiredPriceCents as MoneyCents;
export const marginComparisonMargin = calculateMargin(marginComparisonPriceCents, examplePricing.trueCostCents);

export const markupVsMarginDifferenceCents = (marginComparisonPriceCents - markupComparisonPriceCents) as MoneyCents;

// ---------------------------------------------------------------------------
// Estimate vs. actual: captured directly from a real session in the live app
// — its own default sample workspace (src/lib/sampleData.ts), one "Mulch
// Installation" service line at 8 yd³, quoted at DEFAULT_BUSINESS_SETTINGS'
// 35% target margin, then completed with 9.5 yd³ actually used and 4.5 actual
// labor hours. See public/screenshots/estimate-vs-actual.{png,webp} — this is
// the exact screen that produced these numbers, not a separate illustration.
// ---------------------------------------------------------------------------

export const estimatedServiceQuantity = 8; // yd³ of Mulch Installation, as quoted
export const actualServiceQuantity = 9.5; // yd³ actually used
export const actualLaborHours = 4.5;

export const quotedPriceCents = 104200 as MoneyCents; // $1,042.00 — locked at quote time
export const expectedMarginAtQuote = 35.1;
export const actualMarginAfterJob = 23.5;
export const costVarianceCents = 12029 as MoneyCents; // +$120.29
export const costVariancePercent = 17.8;

export const estimatedMaterialCostCents = 33600 as MoneyCents; // $336.00 (8 yd³ @ $42.00)
export const actualMaterialCostCents = 39900 as MoneyCents; // $399.00
export const estimatedLaborCostCents = 10240 as MoneyCents; // $102.40
export const actualLaborCostCents = 14400 as MoneyCents; // $144.00

// ---------------------------------------------------------------------------
// Service Rate Health: the app's own default sample workspace (all four
// seeded services, SAMPLE_ASSEMBLIES in sampleData.ts) at
// DEFAULT_BUSINESS_SETTINGS — computed via the same calculateAssemblyCost +
// evaluateRateHealth functions the real Rate Health tab calls, so this is
// what a brand-new install already shows before a contractor changes
// anything. See public/screenshots/rate-health.png for the real screen.
// ---------------------------------------------------------------------------

const SERVICE_UNIT_LABELS: Record<string, string> = { yd3: "yd³", "linear-ft": "linear ft", each: "each" };

export const rateHealthRows = SAMPLE_ASSEMBLIES.map((assembly) => {
  // Every seeded sample assembly has a currentRateCents (it's how Rate
  // Health can evaluate it at all) — the field is only optional on Assembly
  // in general for a service a contractor hasn't priced yet.
  const currentRateCents = assembly.currentRateCents ?? (0 as MoneyCents);
  const cost = calculateAssemblyCost(assembly, SAMPLE_MATERIALS, SAMPLE_EQUIPMENT, DEFAULT_BUSINESS_SETTINGS.loadedLaborRateCents, DEFAULT_BUSINESS_SETTINGS.overheadPercent);
  return {
    service: assembly.name,
    unit: SERVICE_UNIT_LABELS[assembly.unit] ?? assembly.unit,
    currentRateCents,
    trueCostCents: cost.trueCostPerUnitCents,
    health: evaluateRateHealth(cost.trueCostPerUnitCents, currentRateCents, DEFAULT_BUSINESS_SETTINGS.targetMarginPercent),
  };
});

// ---------------------------------------------------------------------------
// Cost-impact scenarios: three independent rate-change examples. Only the
// dollar/percent impact of the rate change itself is shown — never a count
// of "affected assemblies/estimates," since that number only exists for a
// real saved workspace, not a website visitor's.
// ---------------------------------------------------------------------------

export interface CostScenario {
  label: string;
  fromCents: MoneyCents;
  toCents: MoneyCents;
  unitLabel: string;
  quantity: number;
  quantityLabel: string;
}

function scenarioPercentChange(scenario: CostScenario): number {
  return ((scenario.toCents - scenario.fromCents) / scenario.fromCents) * 100;
}

function scenarioDollarImpactCents(scenario: CostScenario): MoneyCents {
  return Math.round((scenario.toCents - scenario.fromCents) * scenario.quantity) as MoneyCents;
}

// Starting rates are the app's own real defaults — SAMPLE_MATERIALS' Mulch,
// DEFAULT_BUSINESS_SETTINGS' loaded labor rate, and SAMPLE_EQUIPMENT's Skid
// Steer — not separately-invented numbers.
const sampleMulch = SAMPLE_MATERIALS.find((m) => m.id === "mat-mulch")!;
const sampleSkidSteer = SAMPLE_EQUIPMENT.find((e) => e.id === "eq-skidsteer")!;

export const materialScenario: CostScenario = {
  label: "Mulch",
  fromCents: sampleMulch.unitCostCents,
  toCents: 5000 as MoneyCents,
  unitLabel: "yd³",
  quantity: 8,
  quantityLabel: "an 8 yd³ job",
};

export const laborScenario: CostScenario = {
  label: "Loaded labor",
  fromCents: DEFAULT_BUSINESS_SETTINGS.loadedLaborRateCents,
  toCents: 3600 as MoneyCents,
  unitLabel: "person-hour",
  quantity: 24,
  quantityLabel: "24 person-hours",
};

export const equipmentScenario: CostScenario = {
  label: "Skid-steer",
  fromCents: sampleSkidSteer.rateCents,
  toCents: 5500 as MoneyCents,
  unitLabel: "hour",
  quantity: 4,
  quantityLabel: "four hours",
};

export const costScenarios = [materialScenario, laborScenario, equipmentScenario].map((scenario) => ({
  ...scenario,
  percentChange: scenarioPercentChange(scenario),
  dollarImpactCents: scenarioDollarImpactCents(scenario),
}));
