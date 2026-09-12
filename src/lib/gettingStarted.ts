import { getQuoteBlockingErrors } from "./estimateMath";
import { SAMPLE_ASSEMBLIES, SAMPLE_EQUIPMENT, SAMPLE_MATERIALS } from "./sampleData";
import { DEFAULT_BUSINESS_SETTINGS, type Assembly, type Equipment, type Material, type Workspace } from "./types";
import { getAssemblyValidationErrors, getEquipmentValidationErrors, getMaterialValidationErrors, validateMoneyCentsValue, validateOverheadPercent, validateTargetMarginPercent } from "./validation";

export type GettingStartedStatus = "not-started" | "in-progress" | "complete";

export type GettingStartedStepId = "business-setup" | "add-costs" | "build-service" | "first-estimate" | "compare-actuals";

export interface GettingStartedStep {
  id: GettingStartedStepId;
  status: GettingStartedStatus;
  href: string;
}

export interface GettingStartedProgress {
  completed: number;
  total: 5;
  nextStepId: GettingStartedStepId | null;
  steps: GettingStartedStep[];
}

/**
 * Structural equality for plain, JSON-safe workspace records only (no
 * functions/dates/Maps) — sufficient for comparing a live catalog/assembly
 * record against its ORIGINAL sample-data literal, which is all this file
 * uses it for.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  return aKeys.length === bKeys.length && aKeys.every((k) => deepEqual(aRec[k], bRec[k]));
}

/**
 * True when `item` is byte-for-byte identical to the sample-data record with
 * the same id — i.e. the contractor has never touched this particular row.
 * This (not a separate "is this sample data" flag, which doesn't exist
 * anywhere in the workspace) is the smallest reliable signal available for
 * telling "still the seeded sample" apart from "the contractor's own data":
 * `createSampleWorkspace()` seeds these exact records, `addMaterial`/
 * `addEquipment`/`addAssembly` always mint a fresh `crypto.randomUUID()`-based
 * id (see makeId in persistence.ts) so a genuinely new record can never
 * collide with a sample id, and editing a sample record's fields in place
 * (same id, new values) changes it too. A row only reads as "pristine sample"
 * when NEITHER of those has happened.
 */
function isPristineSample<T extends { id: string }>(item: T, sampleSet: readonly T[]): boolean {
  const sample = sampleSet.find((s) => s.id === item.id);
  return sample !== undefined && deepEqual(item, sample);
}

function isRealMaterial(material: Material): boolean {
  return getMaterialValidationErrors(material).length === 0 && !isPristineSample(material, SAMPLE_MATERIALS);
}

function isRealEquipment(equipment: Equipment): boolean {
  return getEquipmentValidationErrors(equipment).length === 0 && !isPristineSample(equipment, SAMPLE_EQUIPMENT);
}

function assemblyHasBrokenReference(assembly: Assembly, materials: Material[], equipment: Equipment[]): boolean {
  const materialIds = new Set(materials.map((m) => m.id));
  const equipmentIds = new Set(equipment.map((e) => e.id));
  return assembly.materials.some((line) => !materialIds.has(line.materialId)) || assembly.equipment.some((line) => !equipmentIds.has(line.equipmentId));
}

function isRealAssembly(assembly: Assembly, materials: Material[], equipment: Equipment[]): boolean {
  return (
    getAssemblyValidationErrors(assembly).length === 0 &&
    !assemblyHasBrokenReference(assembly, materials, equipment) &&
    !isPristineSample(assembly, SAMPLE_ASSEMBLIES)
  );
}

/** Whether any business-cost setting has been touched at all — used only to
 * tell "not started" apart from "in progress", never to decide completion. */
function businessSetupStarted(workspace: Workspace): boolean {
  const b = workspace.business;
  return (
    Boolean(b.businessName?.trim()) ||
    b.loadedLaborRateCents !== DEFAULT_BUSINESS_SETTINGS.loadedLaborRateCents ||
    b.overheadPercent !== DEFAULT_BUSINESS_SETTINGS.overheadPercent ||
    b.targetMarginPercent !== DEFAULT_BUSINESS_SETTINGS.targetMarginPercent ||
    b.minimumProjectPriceCents !== DEFAULT_BUSINESS_SETTINGS.minimumProjectPriceCents
  );
}

/**
 * Every business-cost setting this step covers must both DIFFER from the
 * seeded default (so the seeded default itself is never credited as a
 * deliberate choice — the same rule the app's original setup checklist used)
 * AND independently validate — so a corrupted/imported out-of-range margin or
 * labor rate never silently counts as "set up" just because it happens to be
 * numerically different from the default.
 */
function businessSetupComplete(workspace: Workspace): boolean {
  const b = workspace.business;
  const hasName = Boolean(b.businessName?.trim());
  const laborOk = b.loadedLaborRateCents !== DEFAULT_BUSINESS_SETTINGS.loadedLaborRateCents && validateMoneyCentsValue(b.loadedLaborRateCents) === null;
  const overheadOk = b.overheadPercent !== DEFAULT_BUSINESS_SETTINGS.overheadPercent && validateOverheadPercent(b.overheadPercent) === null;
  const marginOk = b.targetMarginPercent !== DEFAULT_BUSINESS_SETTINGS.targetMarginPercent && validateTargetMarginPercent(b.targetMarginPercent) === null;
  const minimumOk = b.minimumProjectPriceCents !== DEFAULT_BUSINESS_SETTINGS.minimumProjectPriceCents && validateMoneyCentsValue(b.minimumProjectPriceCents) === null;
  return hasName && laborOk && overheadOk && marginOk && minimumOk;
}

/** "not-started": no saved projects at all. "in-progress": at least one
 * project exists but none is currently free of blocking calculation errors
 * (getQuoteBlockingErrors — the same check the Estimates tab uses to enable
 * "Review and quote"). "complete": at least one project is ready to quote. */
function estimateStepStatus(workspace: Workspace): GettingStartedStatus {
  if (workspace.projects.length === 0) return "not-started";
  const readyToQuote = workspace.projects.some(
    (project) => getQuoteBlockingErrors(project, workspace.assemblies, workspace.materials, workspace.equipment).length === 0
  );
  return readyToQuote ? "complete" : "in-progress";
}

/**
 * Pure, deterministic derivation of "how set up is this workspace" — no
 * separate manually-toggled completion flags anywhere; every step reads
 * straight off real workspace data, the same principle the app's original
 * setup checklist (now superseded by this) established. Never mutates
 * `workspace`. Recomputing this after any workspace change (a save, an
 * import, a deletion) always reflects the CURRENT state exactly — there is
 * nothing else to keep in sync.
 */
export function deriveGettingStartedProgress(workspace: Workspace): GettingStartedProgress {
  const businessStatus: GettingStartedStatus = businessSetupComplete(workspace)
    ? "complete"
    : businessSetupStarted(workspace)
      ? "in-progress"
      : "not-started";

  const costsStatus: GettingStartedStatus =
    workspace.materials.some(isRealMaterial) || workspace.equipment.some(isRealEquipment) ? "complete" : "not-started";

  const serviceStatus: GettingStartedStatus = workspace.assemblies.some((a) => isRealAssembly(a, workspace.materials, workspace.equipment))
    ? "complete"
    : "not-started";

  const estimateStatus = estimateStepStatus(workspace);

  const actualsStatus: GettingStartedStatus = workspace.projects.some((p) => p.actual !== undefined) ? "complete" : "not-started";

  const steps: GettingStartedStep[] = [
    { id: "business-setup", status: businessStatus, href: "/app/settings/" },
    { id: "add-costs", status: costsStatus, href: "/app/catalog/" },
    { id: "build-service", status: serviceStatus, href: "/app/templates/" },
    { id: "first-estimate", status: estimateStatus, href: "/app/estimates/" },
    { id: "compare-actuals", status: actualsStatus, href: "/app/actuals/" },
  ];

  const completed = steps.filter((s) => s.status === "complete").length;
  const nextStep = steps.find((s) => s.status !== "complete");

  return { completed, total: 5, nextStepId: nextStep?.id ?? null, steps };
}
