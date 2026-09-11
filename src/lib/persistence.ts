/**
 * Local-first persistence. The Pro app's entire workspace lives in
 * localStorage — nothing is ever sent to a server. Every read is defensively
 * parsed and validated (never trust stored JSON blindly: a corrupted or
 * hand-edited blob must degrade to defaults, not crash the app) — EXCEPT for
 * monetary fields, which are held to a stricter standard: a malformed dollar
 * amount must never silently become zero or any other invented number. See
 * `migrateWorkspace`'s doc comment for the full atomicity contract.
 */
import { fromDollarInputToCents, type MoneyCents } from "./money";
import { createSampleWorkspace } from "./sampleData";
import { QUOTE_REVISION_SCHEMA_VERSION, type QuoteRevision } from "./types";
import type {
  Assembly,
  BusinessSettings,
  Equipment,
  LaborMode,
  Material,
  Project,
  ProjectActuals,
  ProjectExtraCost,
  ProjectLaborLine,
  ProjectTemplate,
  QuoteRevisionEquipmentLine,
  QuoteRevisionLaborLine,
  QuoteRevisionServiceLine,
  RevenueAllocationLine,
  RoundingIncrementCents,
  Workspace,
} from "./types";

const STORAGE_KEY = "landscapeEstimateProWorkspace:v1";
const BACKUP_KEY = "landscapeEstimateProWorkspace:preMigrationBackup";
const SCHEMA_V3 = 3;
const SCHEMA_V4 = 4;
const SCHEMA_V5 = 5;
const CURRENT_SCHEMA_VERSION = SCHEMA_V5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// -- Structured migration errors ---------------------------------------------

/**
 * One field on one record that could not be migrated. Identifies exactly
 * what needs correcting: which record, which field, what the original
 * (unmodified) value was, and which schema versions the migration was
 * attempting to bridge. `originalValue` is the value AS FOUND in the source
 * record — never a fallback, never coerced — so the user (or a support
 * flow) can see precisely what needs fixing.
 */
export interface MigrationFieldError {
  recordId: string;
  field: string;
  originalValue: unknown;
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
}

/**
 * The result of attempting to migrate a workspace. `ok: false` means the
 * migration is NOT applied — the caller must retain whatever was already
 * persisted (this function never mutates or partially writes anything; it
 * only reads `raw` and returns a plan) and surface `errors` so the affected
 * records can be corrected. There is no partial/best-effort workspace on
 * failure — see `migrateWorkspace`'s doc comment.
 */
export type MigrationOutcome = { ok: true; workspace: Workspace } | { ok: false; errors: MigrationFieldError[] };

interface MigrationContext {
  errors: MigrationFieldError[];
}

function newContext(): MigrationContext {
  return { errors: [] };
}

function reportError(ctx: MigrationContext, recordId: string, field: string, originalValue: unknown, sourceSchemaVersion: number, targetSchemaVersion: number): null {
  ctx.errors.push({ recordId, field, originalValue, sourceSchemaVersion, targetSchemaVersion });
  return null;
}

/** Maps every item through `fn`; if ANY item fails (returns `null`), the
 * whole array migration fails (`null`) — errors for every failing item have
 * already been pushed onto `ctx.errors` by the time this returns, so the
 * caller doesn't need to re-report, only propagate the failure upward. */
function mapOrNull<T, R>(items: T[], fn: (item: T, index: number) => R | null): R[] | null {
  const results = items.map(fn);
  if (results.some((r) => r === null)) return null;
  return results as R[];
}

// -- Dollar-layer field validation (v1/v2/v3 — still dollar-denominated) ----
//
// These stages restructure legacy shapes but do NOT convert to cents (that
// happens once, uniformly, in the v4->v5 stage below). A required dollar
// field that's ABSENT is only legitimate when the source schema truly never
// had the concept yet (e.g. tax didn't exist in the earliest snapshots) —
// callers pass an explicit, documented proxy for that case. A field that IS
// PRESENT but not a finite number is never "fixed" by substituting the
// proxy or zero — it's reported and fails the record.

function requireOrProxyDollar(ctx: MigrationContext, recordId: string, field: string, value: unknown, sourceSchemaVersion: number, proxyIfAbsent: number): number | null {
  if (value === undefined) return proxyIfAbsent;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return reportError(ctx, recordId, field, value, sourceSchemaVersion, SCHEMA_V3);
}

/** A required dollar field with no legitimate absent state — every schema
 * version that has this record shape has always populated it. */
function requireDollar(ctx: MigrationContext, recordId: string, field: string, value: unknown, sourceSchemaVersion: number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return reportError(ctx, recordId, field, value, sourceSchemaVersion, SCHEMA_V3);
}

/** Best-effort validation: confirms top-level shape without deeply
 * re-validating every field (a bad row is safer to keep than to silently
 * drop the whole workspace over one malformed entry). Accepts any schema
 * version this build knows how to migrate FROM (1 through 4, or missing/
 * unversioned) — migrateWorkspace() brings anything older up to date before
 * use. A version NEWER than this build understands is rejected rather than
 * guessed at (a backup from a future release may contain fields this build
 * would silently drop). This is a SHAPE check only — money-field validity is
 * handled separately and atomically by migrateWorkspace. */
function isPlausibleWorkspaceShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.version !== undefined && typeof value.version === "number" && value.version > CURRENT_SCHEMA_VERSION) return false;
  if (value.version !== undefined && value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5) return false;
  if (!isRecord(value.business)) return false;
  if (!isArray(value.materials)) return false;
  if (!isArray(value.equipment)) return false;
  if (!isArray(value.assemblies)) return false;
  if (!isArray(value.projects)) return false;
  if (!isArray(value.templates)) return false;
  return true;
}

/** Builds a minimal, visibly-flagged legacy quote-revision record (revision
 * 1) for a project that had only a scalar `quotedPrice` (schema 1) — this
 * shape never captured the rest of a quote's assumptions, so this revision
 * is marked both `isLegacyMigration` and `historicalCostBasisStatus:
 * "unknown"` rather than presented as exact history. Nothing is fabricated:
 * quantities, rates, and per-line costs are left empty/zero rather than
 * guessed. `actualQuotedPrice` itself is validated by the caller BEFORE this
 * runs — it is never malformed by the time it gets here. Returns a
 * loosely-typed dollar-shaped record, not the final (cents-typed)
 * `QuoteRevision` — this step runs before `migrateV4ToV5`, which is what
 * actually converts every money field to cents. */
function migrateLegacyPriceToRevision(actualQuotedPrice: number, project: Record<string, unknown>, roundingIncrementDollars: number): Record<string, unknown> {
  return {
    id: `legacy-${typeof project.id === "string" ? project.id : Math.random().toString(36).slice(2)}`,
    projectId: typeof project.id === "string" ? project.id : "",
    revisionNumber: 1,
    previousRevisionId: null,
    createdAt: typeof project.updatedAt === "string" ? project.updatedAt : new Date().toISOString(),
    calculationSchemaVersion: QUOTE_REVISION_SCHEMA_VERSION,
    roundingIncrement: roundingIncrementDollars,
    serviceLines: [],
    equipmentLines: [],
    laborLines: [],
    deliveryCost: 0,
    deliveryTaxable: true,
    extraCosts: [],
    loadedLaborRate: 0,
    laborRateBasis: "already-loaded",
    overheadPercent: typeof project.overheadPercent === "number" ? project.overheadPercent : 0,
    targetMarginPercent: typeof project.targetMarginPercent === "number" ? project.targetMarginPercent : 0,
    taxRatePercent: 0,
    directCost: 0,
    overheadAmount: 0,
    // A pre-revision quotedPrice recorded only the final price, never the
    // cost it was built from — treating price as cost here is a documented
    // approximation, not a real recomputation, purely so downstream margin
    // math has *some* (visibly legacy) number instead of crashing on a
    // missing field.
    trueCost: actualQuotedPrice,
    exactRequiredPrice: actualQuotedPrice,
    roundedRecommendedPrice: actualQuotedPrice,
    actualQuotedPrice,
    taxableSubtotal: actualQuotedPrice,
    taxAmount: 0,
    customerTotal: actualQuotedPrice,
    grossProfit: 0,
    achievedMargin: null,
    // No per-line breakdown ever existed for a v1 record — an empty
    // allocation, not a fabricated one, is the honest representation.
    revenueAllocation: [],
    isLegacyMigration: true,
    historicalCostBasisStatus: "unknown",
  };
}

/** Dollar-shaped intermediate business settings — not the final (cents-
 * typed) `BusinessSettings`. `migrateV4ToV5` converts this to cents.
 *
 * `loadedLaborRate`, `defaultDeliveryCost`, and `minimumProjectPrice` are
 * REQUIRED in every schema version this app has ever written — a legacy
 * record missing one, or carrying a non-numeric value for one, is corrupt
 * data, not a legitimate "not set yet" state, and fails migration for the
 * whole workspace (business settings are a singleton, not a per-record
 * item). `representativeMinimumJobTrueCost` genuinely is optional (a
 * contractor may never have set it) and stays absent, never zero.
 * `overheadPercent`/`targetMarginPercent`/`taxRatePercent`/`roundingIncrement`
 * are settings, not raw currency amounts — this function keeps their
 * existing lenient defaulting, which is out of scope for the "malformed
 * money becomes zero" fix (a wrong rounding-bucket choice doesn't corrupt a
 * recorded price the way a wrong dollar amount does). */
function migrateBusiness(ctx: MigrationContext, legacyBusiness: Record<string, unknown>): Record<string, unknown> | null {
  const recordId = "business";
  const loadedLaborRate = requireDollar(ctx, recordId, "loadedLaborRate", legacyBusiness.loadedLaborRate, 1);
  const defaultDeliveryCost = requireDollar(ctx, recordId, "defaultDeliveryCost", legacyBusiness.defaultDeliveryCost, 1);
  const minimumProjectPrice = requireDollar(ctx, recordId, "minimumProjectPrice", legacyBusiness.minimumProjectPrice, 1);
  if (loadedLaborRate === null || defaultDeliveryCost === null || minimumProjectPrice === null) return null;

  let representativeMinimumJobTrueCost: number | undefined;
  if (legacyBusiness.representativeMinimumJobTrueCost !== undefined) {
    const converted = requireDollar(ctx, recordId, "representativeMinimumJobTrueCost", legacyBusiness.representativeMinimumJobTrueCost, 1);
    if (converted === null) return null;
    representativeMinimumJobTrueCost = converted;
  }

  const roundingIncrement: number =
    legacyBusiness.roundDisplayTo === "cent" ? 0.01 : typeof legacyBusiness.roundingIncrement === "number" ? legacyBusiness.roundingIncrement : 1;

  return {
    loadedLaborRate,
    laborRateBasis:
      legacyBusiness.laborRateBasis === "base-plus-percentage-burden" || legacyBusiness.laborRateBasis === "base-plus-component-burden"
        ? legacyBusiness.laborRateBasis
        : "already-loaded",
    overheadPercent: typeof legacyBusiness.overheadPercent === "number" ? legacyBusiness.overheadPercent : 15,
    targetMarginPercent: typeof legacyBusiness.targetMarginPercent === "number" ? legacyBusiness.targetMarginPercent : 35,
    defaultDeliveryCost,
    minimumProjectPrice,
    roundingIncrement,
    taxRatePercent: typeof legacyBusiness.taxRatePercent === "number" ? legacyBusiness.taxRatePercent : 0,
    representativeMinimumJobTrueCost,
    businessName: typeof legacyBusiness.businessName === "string" ? legacyBusiness.businessName : undefined,
    businessLogoDataUrl: typeof legacyBusiness.businessLogoDataUrl === "string" ? legacyBusiness.businessLogoDataUrl : undefined,
  };
}

/** Dollar-shaped intermediate project — not the final (cents-typed)
 * `Project`. `migrateV4ToV5` converts this to cents.
 *
 * A project with NEITHER `quotedPrice` NOR `quoteSnapshot` is a legitimate
 * never-quoted draft — zero quote revisions is correct, not a failure. But
 * once either key is PRESENT, it means this project WAS quoted, and its
 * price must be a real number: a present-but-malformed `quotedPrice` or
 * `quoteSnapshot.displayPrice` is not silently treated as "never quoted"
 * (which would erase a real historical price) and not defaulted to zero —
 * it fails migration for this project record. */
function migrateProject(ctx: MigrationContext, p: Record<string, unknown>, roundingIncrementDollars: number): Record<string, unknown> | null {
  // Already revision-based — nothing to do beyond a defensive shape check
  // (idempotency: re-running this on already-migrated data is a no-op).
  if (isArray(p.quoteRevisions)) {
    return p;
  }

  const recordId = typeof p.id === "string" ? p.id : "unknown-project";
  let quoteRevisions: Record<string, unknown>[] = [];
  const legacyQuoteSnapshot = p.quoteSnapshot;

  if (isRecord(legacyQuoteSnapshot)) {
    // Schema 2: a single unrevisioned QuoteSnapshot. Its own captured figures
    // (service lines, costs, etc.) ARE real — it just never modeled revision
    // history — so carry them forward as revision 1 rather than discarding
    // them in favor of the coarser legacy-price-only path below.
    const snap = legacyQuoteSnapshot;
    const displayPrice = requireDollar(ctx, recordId, "quoteSnapshot.displayPrice", snap.displayPrice, 2);
    if (displayPrice === null) return null;
    const directCost = requireOrProxyDollar(ctx, recordId, "quoteSnapshot.directCost", snap.directCost, 2, 0);
    const overheadAmount = requireOrProxyDollar(ctx, recordId, "quoteSnapshot.overheadAmount", snap.overheadAmount, 2, 0);
    const trueCost = requireOrProxyDollar(ctx, recordId, "quoteSnapshot.trueCost", snap.trueCost, 2, displayPrice);
    const exactRequiredPrice = requireOrProxyDollar(ctx, recordId, "quoteSnapshot.exactRequiredSellingPrice", snap.exactRequiredSellingPrice, 2, displayPrice);
    const taxAmount = requireOrProxyDollar(ctx, recordId, "quoteSnapshot.taxAmount", snap.taxAmount, 2, 0);
    const customerTotal = requireOrProxyDollar(ctx, recordId, "quoteSnapshot.customerTotal", snap.customerTotal, 2, displayPrice);
    const grossProfit = requireOrProxyDollar(ctx, recordId, "quoteSnapshot.grossProfit", snap.grossProfit, 2, 0);
    if (directCost === null || overheadAmount === null || trueCost === null || exactRequiredPrice === null || taxAmount === null || customerTotal === null || grossProfit === null) {
      return null;
    }

    quoteRevisions = [
      {
        id: typeof snap.id === "string" ? snap.id : `legacy-${typeof p.id === "string" ? p.id : Math.random().toString(36).slice(2)}`,
        projectId: typeof p.id === "string" ? p.id : "",
        revisionNumber: 1,
        previousRevisionId: null,
        createdAt: typeof snap.createdAt === "string" ? snap.createdAt : new Date().toISOString(),
        calculationSchemaVersion: QUOTE_REVISION_SCHEMA_VERSION,
        roundingIncrement: typeof snap.roundingIncrement === "number" ? snap.roundingIncrement : roundingIncrementDollars,
        serviceLines: isArray(snap.serviceLines) ? snap.serviceLines : [],
        equipmentLines: isArray(snap.equipmentLines) ? snap.equipmentLines : [],
        laborLines: [],
        deliveryCost: typeof snap.deliveryCost === "number" ? snap.deliveryCost : 0,
        deliveryTaxable: true,
        extraCosts: isArray(snap.extraCosts) ? snap.extraCosts : [],
        loadedLaborRate: typeof snap.loadedLaborRate === "number" ? snap.loadedLaborRate : 0,
        laborRateBasis: "already-loaded",
        overheadPercent: typeof snap.overheadPercent === "number" ? snap.overheadPercent : 0,
        targetMarginPercent: typeof snap.targetMarginPercent === "number" ? snap.targetMarginPercent : 0,
        taxRatePercent: typeof snap.taxRatePercent === "number" ? snap.taxRatePercent : 0,
        directCost,
        overheadAmount,
        trueCost,
        exactRequiredPrice,
        roundedRecommendedPrice: displayPrice,
        actualQuotedPrice: displayPrice,
        taxableSubtotal: displayPrice,
        taxAmount,
        customerTotal,
        grossProfit,
        achievedMargin: typeof snap.achievedMargin === "number" ? snap.achievedMargin : null,
        // A v2 QuoteSnapshot never captured a per-line revenue split either.
        revenueAllocation: [],
        isLegacyMigration: true,
        historicalCostBasisStatus: snap.isLegacyMigration ? "unknown" : "known",
      },
    ];
  } else if (p.quotedPrice !== undefined) {
    // Schema 1: only ever stored a bare final price. Present means it WAS
    // quoted — a malformed value here must not be silently treated as "no
    // quote ever existed," which would erase real history.
    const quotedPrice = requireDollar(ctx, recordId, "quotedPrice", p.quotedPrice, 1);
    if (quotedPrice === null) return null;
    quoteRevisions = [migrateLegacyPriceToRevision(quotedPrice, p, roundingIncrementDollars)];
  }
  // else: neither key present -> a legitimate never-quoted draft.

  const { quotedPrice: _drop1, quoteSnapshot: _drop2, ...rest } = p;
  return {
    ...rest,
    taxRatePercent: typeof p.taxRatePercent === "number" ? p.taxRatePercent : 0,
    quoteRevisions,
    activeQuoteRevisionId: quoteRevisions.length > 0 ? (quoteRevisions[quoteRevisions.length - 1].id as string) : undefined,
  };
}

/**
 * Migrates any of the pre-v3 shapes (v1's scalar `quotedPrice`, v2's single
 * unrevisioned `quoteSnapshot`, or a completely unversioned blob) to v3
 * (revision-based quoting, still dollar-denominated). Idempotent — returns
 * its input unchanged, in shape, if it's already v3 OR LATER (v4 records
 * must not be re-run through this stage's v1/v2 business validation, which
 * would attribute a v4 money-field error to the wrong source/target schema
 * pair). Returns `null` (with errors already pushed onto `ctx`) if ANY
 * business field or ANY project's quoted-price data is malformed — the
 * caller must not proceed to later stages with a partially-migrated result.
 */
function migrateToV3(ctx: MigrationContext, raw: Record<string, unknown>): Record<string, unknown> | null {
  if (raw.version === SCHEMA_V3 || raw.version === SCHEMA_V4) return raw;
  const legacyBusiness = raw.business as Record<string, unknown>;
  const business = migrateBusiness(ctx, legacyBusiness);
  if (business === null) return null;
  const roundingIncrementDollars = typeof business.roundingIncrement === "number" ? business.roundingIncrement : 1;
  const projects = mapOrNull((raw.projects as Record<string, unknown>[]) ?? [], (p) => migrateProject(ctx, p, roundingIncrementDollars));
  if (projects === null) return null;
  return { ...raw, version: SCHEMA_V3, business, projects };
}

/**
 * Migrates v3 → v4: every Assembly gains an explicit `laborInputMode`. A v3
 * assembly only ever had a bare `laborPersonHoursPerUnit` number with no
 * recorded mode — per the "never fabricate history" rule, this migrates as
 * `laborInputMode: "person-hours-per-unit"` (the mode that field's existing
 * meaning already matches) with the existing hours value carried forward
 * EXACTLY unchanged; nothing is recalculated, and no production rate is
 * invented. Idempotent — an assembly that already has `laborInputMode` is
 * left untouched. Still dollar-denominated — money is untouched here, so
 * this step cannot itself produce a money-field migration error.
 */
function migrateV3ToV4(v3: Record<string, unknown>): Record<string, unknown> {
  if (v3.version === SCHEMA_V4) return v3;
  const assemblies = ((v3.assemblies as Record<string, unknown>[]) ?? []).map((a): Record<string, unknown> => {
    if (typeof a.laborInputMode === "string") return a;
    const { laborProductionRate: _drop, ...rest } = a;
    return { ...rest, laborInputMode: "person-hours-per-unit" };
  });
  return { ...v3, version: SCHEMA_V4, assemblies };
}

// -- v4 (dollars) → v5 (integer cents) --------------------------------------
//
// Every persisted monetary field moves from a floating-point dollar `number`
// to an integer `MoneyCents`. Each converter below is idempotent (it checks
// for the presence of the new `*Cents` field first and returns the record
// unchanged if already migrated) and uses Decimal.js (`fromDollarInputToCents`)
// for every conversion — never `Math.round(dollars * 100)` on a raw float —
// so e.g. a stored 1.005 follows the same documented HALF-UP cent-rounding
// rule everywhere else in the app, not an ad-hoc/inconsistent one.
//
// Critically: a malformed (present but non-numeric) or missing REQUIRED
// field is never coerced to zero. It's reported via `ctx.errors` and fails
// migration for that record (propagated up via `null`), which in turn fails
// the whole workspace migration atomically — see `migrateWorkspace`.

/** Converts a dollar amount that must always be present (every schema
 * version has always written this field with a real number) to
 * `MoneyCents`. Returns `null` — and pushes a `MigrationFieldError` — for
 * anything that isn't a finite number, INCLUDING `undefined`/`null`; a
 * required field has no legitimate blank state. */
function convertRequiredMoney(ctx: MigrationContext, recordId: string, field: string, value: unknown): MoneyCents | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return fromDollarInputToCents(value);
    } catch {
      // Falls through to the shared error report below (e.g. an
      // out-of-safe-integer-range amount).
    }
  }
  return reportError(ctx, recordId, field, value, SCHEMA_V4, SCHEMA_V5);
}

/** Same as `convertRequiredMoney`, but for a field the schema has always
 * treated as genuinely optional (e.g. a "current rate" the contractor may
 * never have set). `undefined`/`null` stays absent — never becomes zero. A
 * present-but-malformed value is still an error; being optional only
 * excuses BLANK, never GARBAGE. */
function convertOptionalMoney(ctx: MigrationContext, recordId: string, field: string, value: unknown): MoneyCents | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return fromDollarInputToCents(value);
    } catch {
      // Falls through.
    }
  }
  return reportError(ctx, recordId, field, value, SCHEMA_V4, SCHEMA_V5);
}

const ROUNDING_INCREMENT_DOLLARS_TO_CENTS: Record<number, RoundingIncrementCents> = {
  0.01: 1,
  1: 100,
  5: 500,
  10: 1000,
  25: 2500,
  50: 5000,
};

/** `roundingIncrement` is a rounding-bucket SETTING, not a raw currency
 * amount — an unrecognized value defaults to the app's own $1 default
 * rather than failing the whole workspace, since (unlike a wrong dollar
 * figure) a wrong rounding choice doesn't corrupt a recorded price, only
 * how a FUTURE price rounds. Out of scope for the "malformed money becomes
 * zero" fix by design. */
function roundingIncrementDollarsToCents(value: unknown): RoundingIncrementCents {
  if (typeof value === "number" && value in ROUNDING_INCREMENT_DOLLARS_TO_CENTS) {
    return ROUNDING_INCREMENT_DOLLARS_TO_CENTS[value];
  }
  return 100;
}

function migrateMaterialToV5(ctx: MigrationContext, m: Record<string, unknown>, index: number): Material | null {
  if (typeof m.unitCostCents === "number") return m as unknown as Material; // idempotent
  const recordId = typeof m.id === "string" ? m.id : `material[${index}]`;
  const { unitCost, ...rest } = m;
  const unitCostCents = convertRequiredMoney(ctx, recordId, "unitCost", unitCost);
  if (unitCostCents === null) return null;
  return { ...(rest as unknown as Material), unitCostCents };
}

function migrateEquipmentToV5(ctx: MigrationContext, e: Record<string, unknown>, index: number): Equipment | null {
  if (typeof e.rateCents === "number") return e as unknown as Equipment; // idempotent
  const recordId = typeof e.id === "string" ? e.id : `equipment[${index}]`;
  const { rate, ...rest } = e;
  const rateCents = convertRequiredMoney(ctx, recordId, "rate", rate);
  if (rateCents === null) return null;
  return { ...(rest as unknown as Equipment), rateCents };
}

function migrateAssemblyToV5(ctx: MigrationContext, a: Record<string, unknown>, index: number): Assembly | null {
  if (typeof a.otherCostPerUnitCents === "number") return a as unknown as Assembly; // idempotent
  const recordId = typeof a.id === "string" ? a.id : `assembly[${index}]`;
  const { otherCostPerUnit, currentRate, ...rest } = a;
  const otherCostPerUnitCents = convertRequiredMoney(ctx, recordId, "otherCostPerUnit", otherCostPerUnit);
  const currentRateCents = convertOptionalMoney(ctx, recordId, "currentRate", currentRate);
  if (otherCostPerUnitCents === null || currentRateCents === null) return null;
  return {
    ...(rest as unknown as Assembly),
    otherCostPerUnitCents,
    currentRateCents,
  };
}

function migrateBusinessV4ToV5(ctx: MigrationContext, b: Record<string, unknown>): BusinessSettings | null {
  if (typeof b.loadedLaborRateCents === "number") return b as unknown as BusinessSettings; // idempotent
  const recordId = "business";
  const { loadedLaborRate, defaultDeliveryCost, minimumProjectPrice, representativeMinimumJobTrueCost, roundingIncrement, ...rest } = b;
  const loadedLaborRateCents = convertRequiredMoney(ctx, recordId, "loadedLaborRate", loadedLaborRate);
  const defaultDeliveryCostCents = convertRequiredMoney(ctx, recordId, "defaultDeliveryCost", defaultDeliveryCost);
  const minimumProjectPriceCents = convertRequiredMoney(ctx, recordId, "minimumProjectPrice", minimumProjectPrice);
  const representativeMinimumJobTrueCostCents = convertOptionalMoney(ctx, recordId, "representativeMinimumJobTrueCost", representativeMinimumJobTrueCost);
  if (loadedLaborRateCents === null || defaultDeliveryCostCents === null || minimumProjectPriceCents === null || representativeMinimumJobTrueCostCents === null) {
    return null;
  }
  return {
    ...(rest as unknown as BusinessSettings),
    loadedLaborRateCents,
    defaultDeliveryCostCents,
    minimumProjectPriceCents,
    representativeMinimumJobTrueCostCents,
    roundingIncrementCents: roundingIncrementDollarsToCents(roundingIncrement),
  };
}

function migrateExtraCostToV5(ctx: MigrationContext, recordId: string, e: Record<string, unknown>, index: number): ProjectExtraCost | null {
  if (typeof e.amountCents === "number") return e as unknown as ProjectExtraCost; // idempotent
  const { amount, ...rest } = e;
  const amountCents = convertRequiredMoney(ctx, `${recordId}:extraCost[${index}]`, "amount", amount);
  if (amountCents === null) return null;
  return { ...(rest as unknown as ProjectExtraCost), amountCents };
}

function migrateRevisionServiceLineToV5(ctx: MigrationContext, recordId: string, l: Record<string, unknown>, index: number): QuoteRevisionServiceLine | null {
  if (typeof l.materialCostPerUnitCents === "number") return l as unknown as QuoteRevisionServiceLine; // idempotent
  const lineId = `${recordId}:serviceLine[${index}]`;
  const { materialCostPerUnit, laborCostPerUnit, equipmentCostPerUnit, otherCostPerUnit, ...rest } = l;
  const materialCostPerUnitCents = convertRequiredMoney(ctx, lineId, "materialCostPerUnit", materialCostPerUnit);
  const laborCostPerUnitCents = convertRequiredMoney(ctx, lineId, "laborCostPerUnit", laborCostPerUnit);
  const equipmentCostPerUnitCents = convertRequiredMoney(ctx, lineId, "equipmentCostPerUnit", equipmentCostPerUnit);
  const otherCostPerUnitCents = convertRequiredMoney(ctx, lineId, "otherCostPerUnit", otherCostPerUnit);
  if (materialCostPerUnitCents === null || laborCostPerUnitCents === null || equipmentCostPerUnitCents === null || otherCostPerUnitCents === null) return null;
  return {
    ...(rest as unknown as QuoteRevisionServiceLine),
    materialCostPerUnitCents,
    laborCostPerUnitCents,
    equipmentCostPerUnitCents,
    otherCostPerUnitCents,
    laborPersonHoursPerUnit: typeof l.laborPersonHoursPerUnit === "number" ? l.laborPersonHoursPerUnit : 0,
    laborMode: typeof l.laborMode === "string" ? (l.laborMode as LaborMode) : "legacy-unknown",
    laborOriginalValue: typeof l.laborOriginalValue === "number" ? l.laborOriginalValue : null,
    laborOriginalUnit: typeof l.laborOriginalUnit === "string" ? l.laborOriginalUnit : null,
  };
}

function migrateRevisionEquipmentLineToV5(ctx: MigrationContext, recordId: string, l: Record<string, unknown>, index: number): QuoteRevisionEquipmentLine | null {
  if (typeof l.rateCents === "number") return l as unknown as QuoteRevisionEquipmentLine; // idempotent
  const { rate, ...rest } = l;
  const rateCents = convertRequiredMoney(ctx, `${recordId}:equipmentLine[${index}]`, "rate", rate);
  if (rateCents === null) return null;
  return { ...(rest as unknown as QuoteRevisionEquipmentLine), rateCents };
}

function migrateRevenueAllocationLineToV5(ctx: MigrationContext, recordId: string, l: Record<string, unknown>, index: number): RevenueAllocationLine | null {
  if (typeof l.directCostCents === "number") return l as unknown as RevenueAllocationLine; // idempotent
  const lineId = `${recordId}:revenueAllocation[${index}]`;
  const { directCost, allocatedSellingPrice, ...rest } = l;
  const directCostCents = convertRequiredMoney(ctx, lineId, "directCost", directCost);
  const allocatedSellingPriceCents = convertRequiredMoney(ctx, lineId, "allocatedSellingPrice", allocatedSellingPrice);
  if (directCostCents === null || allocatedSellingPriceCents === null) return null;
  return {
    ...(rest as unknown as RevenueAllocationLine),
    directCostCents,
    allocatedSellingPriceCents,
  };
}

function migrateQuoteRevisionToV5(ctx: MigrationContext, projectId: string, r: Record<string, unknown>, index: number): QuoteRevision | null {
  if (typeof r.trueCostCents === "number") return r as unknown as QuoteRevision; // idempotent
  const recordId = typeof r.id === "string" ? `project:${projectId}:revision:${r.id}` : `project:${projectId}:revision[${index}]`;
  const {
    deliveryCost,
    loadedLaborRate,
    directCost,
    overheadAmount,
    trueCost,
    exactRequiredPrice,
    roundedRecommendedPrice,
    actualQuotedPrice,
    taxableSubtotal,
    taxAmount,
    customerTotal,
    grossProfit,
    roundingIncrement,
    ...rest
  } = r;

  const deliveryCostCents = convertRequiredMoney(ctx, recordId, "deliveryCost", deliveryCost);
  const loadedLaborRateCents = convertRequiredMoney(ctx, recordId, "loadedLaborRate", loadedLaborRate);
  const directCostCents = convertRequiredMoney(ctx, recordId, "directCost", directCost);
  const overheadAmountCents = convertRequiredMoney(ctx, recordId, "overheadAmount", overheadAmount);
  const trueCostCents = convertRequiredMoney(ctx, recordId, "trueCost", trueCost);
  const exactRequiredPriceCents = convertRequiredMoney(ctx, recordId, "exactRequiredPrice", exactRequiredPrice);
  const roundedRecommendedPriceCents = convertRequiredMoney(ctx, recordId, "roundedRecommendedPrice", roundedRecommendedPrice);
  const actualQuotedPriceCents = convertRequiredMoney(ctx, recordId, "actualQuotedPrice", actualQuotedPrice);
  const taxableSubtotalCents = convertRequiredMoney(ctx, recordId, "taxableSubtotal", taxableSubtotal);
  const taxAmountCents = convertRequiredMoney(ctx, recordId, "taxAmount", taxAmount);
  const customerTotalCents = convertRequiredMoney(ctx, recordId, "customerTotal", customerTotal);
  const grossProfitCents = convertRequiredMoney(ctx, recordId, "grossProfit", grossProfit);

  const serviceLines = mapOrNull((isArray(r.serviceLines) ? (r.serviceLines as Record<string, unknown>[]) : []), (l, i) => migrateRevisionServiceLineToV5(ctx, recordId, l, i));
  const equipmentLines = mapOrNull((isArray(r.equipmentLines) ? (r.equipmentLines as Record<string, unknown>[]) : []), (l, i) => migrateRevisionEquipmentLineToV5(ctx, recordId, l, i));
  const extraCosts = mapOrNull((isArray(r.extraCosts) ? (r.extraCosts as Record<string, unknown>[]) : []), (e, i) => migrateExtraCostToV5(ctx, recordId, e, i));
  const revenueAllocation = mapOrNull((isArray(r.revenueAllocation) ? (r.revenueAllocation as Record<string, unknown>[]) : []), (l, i) => migrateRevenueAllocationLineToV5(ctx, recordId, l, i));

  if (
    deliveryCostCents === null ||
    loadedLaborRateCents === null ||
    directCostCents === null ||
    overheadAmountCents === null ||
    trueCostCents === null ||
    exactRequiredPriceCents === null ||
    roundedRecommendedPriceCents === null ||
    actualQuotedPriceCents === null ||
    taxableSubtotalCents === null ||
    taxAmountCents === null ||
    customerTotalCents === null ||
    grossProfitCents === null ||
    serviceLines === null ||
    equipmentLines === null ||
    extraCosts === null ||
    revenueAllocation === null
  ) {
    return null;
  }

  return {
    ...(rest as unknown as QuoteRevision),
    roundingIncrementCents: roundingIncrementDollarsToCents(roundingIncrement),
    serviceLines,
    equipmentLines,
    laborLines: isArray(r.laborLines) ? (r.laborLines as unknown as QuoteRevisionLaborLine[]) : [],
    extraCosts,
    deliveryCostCents,
    loadedLaborRateCents,
    directCostCents,
    overheadAmountCents,
    trueCostCents,
    exactRequiredPriceCents,
    roundedRecommendedPriceCents,
    actualQuotedPriceCents,
    taxableSubtotalCents,
    taxAmountCents,
    customerTotalCents,
    grossProfitCents,
    revenueAllocation,
  };
}

function migrateActualsToV5(ctx: MigrationContext, projectId: string, a: Record<string, unknown>): ProjectActuals | null {
  if (typeof a.actualMaterialsCostCents === "number") return a as unknown as ProjectActuals; // idempotent
  const recordId = `project:${projectId}:actual`;
  const { actualMaterialsCost, actualEquipmentCost, actualDeliveryCost, actualOtherCost, finalSellingPrice, ...rest } = a;
  const actualMaterialsCostCents = convertRequiredMoney(ctx, recordId, "actualMaterialsCost", actualMaterialsCost);
  const actualEquipmentCostCents = convertRequiredMoney(ctx, recordId, "actualEquipmentCost", actualEquipmentCost);
  const actualDeliveryCostCents = convertRequiredMoney(ctx, recordId, "actualDeliveryCost", actualDeliveryCost);
  const actualOtherCostCents = convertRequiredMoney(ctx, recordId, "actualOtherCost", actualOtherCost);
  const finalSellingPriceCents = convertRequiredMoney(ctx, recordId, "finalSellingPrice", finalSellingPrice);
  if (
    actualMaterialsCostCents === null ||
    actualEquipmentCostCents === null ||
    actualDeliveryCostCents === null ||
    actualOtherCostCents === null ||
    finalSellingPriceCents === null
  ) {
    return null;
  }
  return {
    ...(rest as unknown as ProjectActuals),
    actualMaterialsCostCents,
    actualEquipmentCostCents,
    actualDeliveryCostCents,
    actualOtherCostCents,
    finalSellingPriceCents,
  };
}

function migrateProjectToV5(ctx: MigrationContext, p: Record<string, unknown>, index: number): Project | null {
  if (typeof p.deliveryCostCents === "number") return p as unknown as Project; // idempotent
  const projectId = typeof p.id === "string" ? p.id : `project[${index}]`;
  const { deliveryCost, extraCosts, quoteRevisions, laborLines, ...rest } = p;

  const deliveryCostCents = convertRequiredMoney(ctx, projectId, "deliveryCost", deliveryCost);
  const migratedExtraCosts = mapOrNull((isArray(extraCosts) ? (extraCosts as Record<string, unknown>[]) : []), (e, i) => migrateExtraCostToV5(ctx, projectId, e, i));
  const migratedRevisions = mapOrNull((isArray(quoteRevisions) ? (quoteRevisions as Record<string, unknown>[]) : []), (r, i) => migrateQuoteRevisionToV5(ctx, projectId, r, i));
  const migratedActuals = isRecord(p.actual) ? migrateActualsToV5(ctx, projectId, p.actual as Record<string, unknown>) : undefined;

  if (deliveryCostCents === null || migratedExtraCosts === null || migratedRevisions === null || migratedActuals === null) {
    return null;
  }

  return {
    ...(rest as unknown as Project),
    deliveryCostCents,
    extraCosts: migratedExtraCosts,
    quoteRevisions: migratedRevisions,
    laborLines: isArray(laborLines) ? (laborLines as unknown as ProjectLaborLine[]) : [],
    actual: migratedActuals ?? undefined,
  };
}

function migrateTemplateToV5(ctx: MigrationContext, t: Record<string, unknown>, index: number): ProjectTemplate | null {
  if (typeof t.deliveryCostCents === "number") return t as unknown as ProjectTemplate; // idempotent
  const templateId = typeof t.id === "string" ? t.id : `template[${index}]`;
  const { deliveryCost, extraCosts, ...rest } = t;
  const deliveryCostCents = convertRequiredMoney(ctx, templateId, "deliveryCost", deliveryCost);
  const migratedExtraCosts = mapOrNull((isArray(extraCosts) ? (extraCosts as Record<string, unknown>[]) : []), (e, i) => migrateExtraCostToV5(ctx, templateId, e, i));
  if (deliveryCostCents === null || migratedExtraCosts === null) return null;
  return {
    ...(rest as unknown as ProjectTemplate),
    deliveryCostCents,
    extraCosts: migratedExtraCosts,
  };
}

/**
 * Migrates v4 (dollar-denominated) → v5 (integer cents) — the final step
 * that makes every persisted monetary field in the app a `MoneyCents`
 * integer, never a floating-point dollar amount. Idempotent — a workspace
 * already at v5 is returned unchanged (checked here AND independently by
 * every per-record converter above, since a partially-migrated blob — e.g.
 * one where only some projects were converted before a save failed midway —
 * must migrate the remaining dollar-shaped records without re-touching the
 * ones that are already cents-shaped). Returns `null` (with every field
 * error already pushed onto `ctx`) if ANY record's money field is malformed
 * or missing — see the module-level doc comment on atomicity.
 */
function migrateV4ToV5(ctx: MigrationContext, v4: Record<string, unknown>): Workspace | null {
  if (v4.version === SCHEMA_V5) return v4 as unknown as Workspace;
  const materials = mapOrNull((v4.materials as Record<string, unknown>[]) ?? [], (m, i) => migrateMaterialToV5(ctx, m, i));
  const equipment = mapOrNull((v4.equipment as Record<string, unknown>[]) ?? [], (e, i) => migrateEquipmentToV5(ctx, e, i));
  const assemblies = mapOrNull((v4.assemblies as Record<string, unknown>[]) ?? [], (a, i) => migrateAssemblyToV5(ctx, a, i));
  const business = migrateBusinessV4ToV5(ctx, (v4.business as Record<string, unknown>) ?? {});
  const projects = mapOrNull((v4.projects as Record<string, unknown>[]) ?? [], (p, i) => migrateProjectToV5(ctx, p, i));
  const templates = mapOrNull((v4.templates as Record<string, unknown>[]) ?? [], (t, i) => migrateTemplateToV5(ctx, t, i));

  if (materials === null || equipment === null || assemblies === null || business === null || projects === null || templates === null) {
    return null;
  }
  return { version: SCHEMA_V5, business, materials, equipment, assemblies, projects, templates };
}

/**
 * Migrates a raw stored/imported blob to the current schema — ATOMICALLY.
 * The pipeline is: parse the original (the caller's job) → migrate
 * completely in memory, one step at a time (v1/v2/unversioned → v3 → v4 →
 * v5) → return either a fully-valid target `Workspace`, or every field
 * error found, with NOTHING committed.
 *
 * There is no partial success: if any record's required money field is
 * missing or malformed, this function does not return a workspace at all —
 * only `{ ok: false, errors }`. It never falls back to zero, never
 * substitutes a fabricated number, and never silently drops the offending
 * record while keeping the rest. The caller (`loadWorkspace`,
 * `parseWorkspaceJson`) must not persist anything when `ok` is `false` — the
 * original, unmigrated data stays exactly as it was, in whatever store it
 * came from, so it stays recoverable and correctable.
 *
 * Idempotent on success: migrating an already-current workspace returns it
 * unchanged, and re-running migration on its own output is a no-op —
 * covered by a test that runs it twice and asserts byte-for-byte identical
 * results. Never invents historical material rates, production rates,
 * quantities, or margins for legacy data; anything it can't reconstruct is
 * marked `historicalCostBasisStatus: "unknown"` / `isLegacyMigration: true`
 * instead.
 *
 * Structured as an explicit step pipeline rather than one unstructured
 * conversion — each step is independently testable and safe to run on data
 * already partway through it — but the pipeline stops at the FIRST stage
 * that reports any error; later stages never run against invalid data.
 */
export function migrateWorkspace(raw: unknown): MigrationOutcome {
  if (!isRecord(raw)) return { ok: true, workspace: createSampleWorkspace() };
  if (raw.version === CURRENT_SCHEMA_VERSION) return { ok: true, workspace: raw as unknown as Workspace };

  const ctx = newContext();

  const v3 = migrateToV3(ctx, raw);
  if (v3 === null) return { ok: false, errors: ctx.errors };

  const v4 = migrateV3ToV4(v3);

  const v5 = migrateV4ToV5(ctx, v4);
  if (v5 === null) return { ok: false, errors: ctx.errors };

  return { ok: true, workspace: v5 };
}

/** Why `loadWorkspace()` couldn't produce a usable workspace from what was
 * stored. `"unparseable"` — the raw string isn't valid JSON at all (e.g.
 * truncated by a crashed write). `"invalid-shape"` — it parses, but doesn't
 * look like a Landscape Estimate Pro workspace at all (wrong top-level
 * shape). `"field-errors"` — it IS a recognizable workspace, but one or more
 * money fields inside it are missing or malformed; `errors` names exactly
 * which. In every case the message shown to the user is a generic, safe
 * description — never the raw parser exception text, which could echo
 * fragments of the corrupted internals back at the user. */
export type WorkspaceLoadFailureReason =
  | { kind: "unparseable"; message: string }
  | { kind: "invalid-shape"; message: string }
  | { kind: "field-errors"; errors: MigrationFieldError[] };

/** What `loadWorkspace()` found. `"ok"` is the normal case — including a
 * fresh sample workspace, but ONLY when there was genuinely nothing to lose
 * (no `STORAGE_KEY` entry existed at all, or storage itself couldn't be
 * touched). `"needs-correction"` covers every other kind of failure — bad
 * JSON, an unrecognizable shape, or malformed money fields — and is handled
 * identically: nothing is migrated, nothing is overwritten, and the caller
 * must surface `reason` and let the user correct or explicitly discard it.
 * A corrupted or unparseable blob must NEVER silently become a fresh sample
 * workspace — that would look like a fix but would actually be silent data
 * loss the next time autosave runs. `rawOriginal` is the EXACT string that
 * was read from storage — not `JSON.stringify(JSON.parse(rawOriginal))`,
 * which could reorder keys or normalize formatting — so a "download
 * original" action can hand the user back byte-for-byte what was actually
 * there. */
export type LoadWorkspaceResult =
  | { status: "ok"; workspace: Workspace }
  | { status: "needs-correction"; reason: WorkspaceLoadFailureReason; rawOriginal: string };

function backupRawBlob(raw: string): void {
  try {
    window.localStorage.setItem(BACKUP_KEY, raw);
  } catch {
    // Storage full — proceed without a backup rather than failing further.
  }
}

export function loadWorkspace(): LoadWorkspaceResult {
  if (typeof window === "undefined") return { status: "ok", workspace: createSampleWorkspace() };

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage itself is inaccessible (some private-browsing modes throw on
    // touching it at all) — nothing was ever readable, so there's nothing at
    // risk of being silently lost. Behave like a first-time visit.
    return { status: "ok", workspace: createSampleWorkspace() };
  }
  // No key at all — a genuine first-time visit, not a corrupted save. An
  // empty string, by contrast, IS something that was actually stored (we
  // never persist "" ourselves) and falls through to JSON.parse below,
  // which correctly reports it as unparseable rather than treated as "never
  // saved".
  if (raw === null) return { status: "ok", workspace: createSampleWorkspace() };

  try {
    const parsed = JSON.parse(raw);
    if (!isPlausibleWorkspaceShape(parsed)) {
      backupRawBlob(raw);
      return {
        status: "needs-correction",
        reason: { kind: "invalid-shape", message: "This saved data doesn't match the shape of a Landscape Estimate Pro workspace." },
        rawOriginal: raw,
      };
    }

    const needsMigration = parsed.version !== CURRENT_SCHEMA_VERSION;
    const outcome = migrateWorkspace(parsed);
    if (!outcome.ok) {
      // Do NOT persist anything — the original blob in STORAGE_KEY is left
      // completely untouched, so it stays recoverable. Still stash a
      // dedicated backup copy for convenience/inspection.
      backupRawBlob(raw);
      return { status: "needs-correction", reason: { kind: "field-errors", errors: outcome.errors }, rawOriginal: raw };
    }
    if (needsMigration) {
      // Best-effort recoverable backup of the pre-migration blob — if
      // something about the migration turns out to be wrong, the original
      // data is still there to inspect or restore by hand. Never blocks
      // loading if storage is full/unavailable.
      backupRawBlob(raw);
    }
    return { status: "ok", workspace: outcome.workspace };
  } catch (err) {
    // Covers a JSON.parse SyntaxError (truncated/corrupted JSON) and any
    // unexpected internal error while inspecting it. Either way, the raw
    // bytes in storage are left completely untouched and we surface a
    // recoverable error screen — we never fall back to silently substituting
    // sample data for a blob that was actually something.
    backupRawBlob(raw);
    return {
      status: "needs-correction",
      reason: {
        kind: "unparseable",
        message:
          err instanceof SyntaxError
            ? "This saved data isn't valid JSON — it may have been truncated or corrupted."
            : "This saved data couldn't be read due to an unexpected error.",
      },
      rawOriginal: raw,
    };
  }
}

/** Why a `saveWorkspace()` call failed to persist. `"quota"` — local storage
 * is full. `"security"` — the browser is blocking storage access outright
 * (e.g. some private-browsing modes, or storage disabled by policy).
 * `"unavailable"` — not running in a browser context at all.  `"unknown"` —
 * anything else (e.g. `JSON.stringify` itself throwing on a circular/BigInt
 * value, which should never happen for a `Workspace` but is guarded anyway). */
export type SaveWorkspaceResult = { ok: true } | { ok: false; reason: "quota" | "security" | "unavailable" | "unknown"; message: string };

function classifyStorageError(err: unknown): "quota" | "security" | "unknown" {
  if (err instanceof DOMException) {
    // QuotaExceededError: modern browsers use the name; legacy Firefox/WebKit
    // used numeric codes (22, and Firefox's own 1014) instead.
    if (err.name === "QuotaExceededError" || err.code === 22 || err.code === 1014) return "quota";
    if (err.name === "SecurityError") return "security";
  }
  return "unknown";
}

export function saveWorkspace(workspace: Workspace): SaveWorkspaceResult {
  if (typeof window === "undefined") return { ok: false, reason: "unavailable", message: "Not running in a browser — nothing to save to." };

  let json: string;
  try {
    json = JSON.stringify(workspace);
  } catch {
    return { ok: false, reason: "unknown", message: "This change couldn't be saved — the workspace data couldn't be serialized." };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, json);
    return { ok: true };
  } catch (err) {
    const reason = classifyStorageError(err);
    const message =
      reason === "quota"
        ? "Your browser's local storage is full, so this change couldn't be saved."
        : reason === "security"
          ? "Local storage is blocked in this browser (e.g. private browsing mode), so this change couldn't be saved."
          : "This change couldn't be saved due to an unexpected storage error.";
    return { ok: false, reason, message };
  }
}

export function exportWorkspaceJson(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2);
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  workspace?: Workspace;
  /** Present when the import failed specifically because one or more money
   * fields in the file were missing/malformed — distinct from `error`
   * (a generic "not a valid file" message), so the UI can show exactly what
   * needs correcting rather than a single opaque string. */
  fieldErrors?: MigrationFieldError[];
}

export function parseWorkspaceJson(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!isPlausibleWorkspaceShape(parsed)) {
    return { ok: false, error: "That file doesn't look like a Landscape Estimate Pro backup." };
  }
  const outcome = migrateWorkspace(parsed);
  if (!outcome.ok) {
    return {
      ok: false,
      error: "That backup contains one or more amounts that couldn't be read — nothing was imported. See the field list for what to fix.",
      fieldErrors: outcome.errors,
    };
  }
  return { ok: true, workspace: outcome.workspace };
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type { Assembly, BusinessSettings, Equipment, Material, Project, ProjectTemplate, Workspace };
