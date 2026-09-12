import { useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Upload, RotateCcw, Image as ImageIcon, ShieldAlert, X } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import { exportWorkspaceJson, parseWorkspaceJson } from "../../../lib/persistence";
import { createSampleWorkspace } from "../../../lib/sampleData";
import { evaluateOverheadScenario } from "../../../lib/estimateMath";
import { Button, Card, DraftNumberInput, Field, MoneyInput, TextInput } from "../../ui/primitives";
import { useDialog } from "../../ui/Dialog";
import { HelpTooltip } from "../../ui/HelpTooltip";
import { CostImpactBanner, useCostImpactAlert } from "../CostImpactBanner";
import { ROUNDING_INCREMENTS, formatCurrency, formatPercent } from "../../../lib/calc";
import { ZERO_CENTS, type MoneyCents } from "../../../lib/money";
import { validateEmailFormat, validateOverheadPercent, validateTargetMarginPercent, validateTaxRatePercent, validateWebsiteFormat } from "../../../lib/validation";
import type { RoundingIncrementCents } from "../../../lib/types";

function n(value: number | ""): number {
  return value === "" ? 0 : value;
}

/** Absolute, locale-formatted timestamp for the Data & Backup section —
 * deliberately more precise than SaveStatusIndicator's relative "4m ago"
 * (which is right for a glanceable header chip), since this is the place a
 * user checks specifically to decide "do I need to back up right now?" or to
 * report an exact time to support. `null` means the event has never
 * happened in this browser, not "unknown". */
function formatTimestamp(ms: number | null): string {
  if (ms === null) return "Never";
  return new Date(ms).toLocaleString();
}

const RESET_CONFIRM_PHRASE = "RESET";

/** Downscales an uploaded logo to a small square-ish PNG data URL (no
 * backend to store files, so it lives inline in the workspace — keeping it
 * small matters since everything round-trips through localStorage/JSON). */
function resizeImageToDataUrl(file: File, maxDimension = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like an image."));
      img.onload = () => {
        const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Could not process that image."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

export default function SettingsTab() {
  const { workspace, updateBusiness, replaceWorkspace, lastSavedAt, lastBackupAt, recordBackupDownloaded } = useWorkspace();
  const { business } = workspace;
  const idPrefix = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const costImpact = useCostImpactAlert();
  const { confirm, dialog } = useDialog();

  async function handleLogoFile(file: File) {
    setLogoError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      updateBusiness({ businessLogoDataUrl: dataUrl });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Could not process that image.");
    }
  }

  function handleExport() {
    const json = exportWorkspaceJson(workspace);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `landscape-estimate-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    // Same "last backup" timestamp BackupReminderBanner reads — recorded
    // here too so exporting from this button (not just the banner's own
    // "Download backup" action) resets its nag timer and updates the Data &
    // Backup section below without a second, separately-tracked timestamp.
    recordBackupDownloaded();
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseWorkspaceJson(String(reader.result ?? ""));
      if (!result.ok || !result.workspace) {
        // A malformed money field produces a specific, itemized message
        // (never a silent zero-substitution and never a partial import) —
        // show exactly which records need correcting when we have them.
        const detail = result.fieldErrors?.length
          ? ` (${result.fieldErrors.map((e) => `${e.recordId}: ${e.field}`).join("; ")})`
          : "";
        setImportMessage({ type: "error", text: `${result.error ?? "Import failed."}${detail}` });
        return;
      }
      replaceWorkspace(result.workspace);
      setImportMessage({ type: "success", text: "Workspace restored from backup." });
    };
    reader.readAsText(file);
  }

  // The one destructive "wipe and replace" operation in the app — reused by
  // both the long-standing Reset card below (gated by a native `confirm()`)
  // and the Data & Backup section's type-to-confirm control, so there is
  // exactly one place that actually performs it, only two different
  // confirmation gates in front of it.
  function resetAllData() {
    replaceWorkspace(createSampleWorkspace());
  }

  async function handleReset() {
    if (!(await confirm("Reset your workspace to the sample data? This replaces your current materials, equipment, assemblies, and estimates.", { tone: "danger", confirmLabel: "Reset workspace" }))) {
      return;
    }
    resetAllData();
  }

  return (
    <div className="space-y-6">
      {dialog}
      <CostImpactBanner result={costImpact.result} onDismiss={costImpact.dismiss} />

      <Card>
        <h2 className="text-lg font-bold text-ink">Business profile</h2>
        <p className="mt-1 text-sm text-muted">Shown on branded, customer-facing estimates.</p>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Business name" htmlFor={`${idPrefix}-business-name`}>
              <TextInput
                id={`${idPrefix}-business-name`}
                value={business.businessName ?? ""}
                onChange={(e) => updateBusiness({ businessName: e.target.value })}
                placeholder="Greenscape Landscaping"
              />
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink">Logo</span>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-paper">
                {business.businessLogoDataUrl ? (
                  <img src={business.businessLogoDataUrl} alt="Business logo" className="h-full w-full rounded-lg object-contain p-1" />
                ) : (
                  <ImageIcon size={22} className="text-muted-light" aria-hidden="true" />
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => logoInputRef.current?.click()}>
                <Upload size={16} aria-hidden="true" /> Upload
              </Button>
              {business.businessLogoDataUrl && (
                <button
                  type="button"
                  onClick={() => updateBusiness({ businessLogoDataUrl: undefined })}
                  className="tap-target flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
                  aria-label="Remove logo"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {logoError && <p className="mt-1.5 text-xs font-medium text-red">{logoError}</p>}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" htmlFor={`${idPrefix}-address1`}>
            <TextInput
              id={`${idPrefix}-address1`}
              value={business.businessAddressLine1 ?? ""}
              onChange={(e) => updateBusiness({ businessAddressLine1: e.target.value })}
              placeholder="123 Main St"
              autoComplete="address-line1"
            />
          </Field>
          <Field label="Address line 2" htmlFor={`${idPrefix}-address2`} hint="Optional">
            <TextInput
              id={`${idPrefix}-address2`}
              value={business.businessAddressLine2 ?? ""}
              onChange={(e) => updateBusiness({ businessAddressLine2: e.target.value })}
              placeholder="Suite 200"
              autoComplete="address-line2"
            />
          </Field>
          <Field label="City" htmlFor={`${idPrefix}-city`}>
            <TextInput id={`${idPrefix}-city`} value={business.businessCity ?? ""} onChange={(e) => updateBusiness({ businessCity: e.target.value })} autoComplete="address-level2" />
          </Field>
          <Field label="State / region" htmlFor={`${idPrefix}-state`}>
            <TextInput id={`${idPrefix}-state`} value={business.businessStateRegion ?? ""} onChange={(e) => updateBusiness({ businessStateRegion: e.target.value })} autoComplete="address-level1" />
          </Field>
          <Field label="Postal code" htmlFor={`${idPrefix}-postal`}>
            <TextInput id={`${idPrefix}-postal`} value={business.businessPostalCode ?? ""} onChange={(e) => updateBusiness({ businessPostalCode: e.target.value })} autoComplete="postal-code" />
          </Field>
          <Field label="Country" htmlFor={`${idPrefix}-country`} hint="Optional">
            <TextInput id={`${idPrefix}-country`} value={business.businessCountry ?? ""} onChange={(e) => updateBusiness({ businessCountry: e.target.value })} autoComplete="country-name" />
          </Field>
          <Field label="Phone" htmlFor={`${idPrefix}-phone`}>
            <TextInput id={`${idPrefix}-phone`} type="tel" value={business.businessPhone ?? ""} onChange={(e) => updateBusiness({ businessPhone: e.target.value })} autoComplete="tel" />
          </Field>
          <div>
            <Field label="Email" htmlFor={`${idPrefix}-email`}>
              <TextInput
                id={`${idPrefix}-email`}
                type="email"
                value={business.businessEmail ?? ""}
                onChange={(e) => updateBusiness({ businessEmail: e.target.value })}
                autoComplete="email"
                invalid={Boolean(validateEmailFormat(business.businessEmail ?? ""))}
                aria-describedby={validateEmailFormat(business.businessEmail ?? "") ? `${idPrefix}-email-error` : undefined}
              />
            </Field>
            {validateEmailFormat(business.businessEmail ?? "") && (
              <p id={`${idPrefix}-email-error`} role="alert" className="mt-1 text-xs font-medium text-red">
                {validateEmailFormat(business.businessEmail ?? "")}
              </p>
            )}
          </div>
          <div>
            <Field label="Website" htmlFor={`${idPrefix}-website`} hint="Optional">
              <TextInput
                id={`${idPrefix}-website`}
                type="url"
                value={business.businessWebsite ?? ""}
                onChange={(e) => updateBusiness({ businessWebsite: e.target.value })}
                autoComplete="url"
                placeholder="www.example.com"
                invalid={Boolean(validateWebsiteFormat(business.businessWebsite ?? ""))}
                aria-describedby={validateWebsiteFormat(business.businessWebsite ?? "") ? `${idPrefix}-website-error` : undefined}
              />
            </Field>
            {validateWebsiteFormat(business.businessWebsite ?? "") && (
              <p id={`${idPrefix}-website-error`} role="alert" className="mt-1 text-xs font-medium text-red">
                {validateWebsiteFormat(business.businessWebsite ?? "")}
              </p>
            )}
          </div>
          <Field label="Contractor / license number" htmlFor={`${idPrefix}-license`} hint="Optional">
            <TextInput id={`${idPrefix}-license`} value={business.businessLicenseNumber ?? ""} onChange={(e) => updateBusiness({ businessLicenseNumber: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">Business assumptions</h2>
        <p className="mt-1 text-sm text-muted">
          Set these once — every estimate, assembly, and rate-health check in Pro uses these numbers by default.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Loaded labor rate"
            htmlFor={`${idPrefix}-labor`}
            hint="Wages + payroll tax + benefits, per person-hour"
            labelExtra={
              <HelpTooltip label="Loaded labor rate">
                The fully-loaded cost of one person-hour of labor — wages plus payroll tax, workers' comp, and
                benefits. This app multiplies it by person-hours to get labor cost on every assembly and ad-hoc crew
                labor line.
              </HelpTooltip>
            }
          >
            <MoneyInput
              id={`${idPrefix}-labor`}
              valueCents={business.loadedLaborRateCents}
              onValueCentsChange={(v) => updateBusiness({ loadedLaborRateCents: v === "" ? ZERO_CENTS : v })}
              onFocus={() => costImpact.startTracking("labor", undefined, business.loadedLaborRateCents, workspace)}
              onCommit={(v) => {
                const committedCents = v === "" ? ZERO_CENTS : v;
                // `workspace`/`business` here are still the PRE-commit
                // snapshot (React hasn't re-rendered yet) — build the
                // "after" picture by hand instead of trusting that closure.
                const afterWorkspace = { ...workspace, business: { ...business, loadedLaborRateCents: committedCents } };
                costImpact.finishTracking(committedCents, afterWorkspace, "Loaded labor rate");
              }}
            />
          </Field>
          <Field
            label="Labor rate basis"
            htmlFor={`${idPrefix}-labor-basis`}
            hint="Documents how the rate above was derived — doesn't change the math, but stops burden from accidentally being added twice later"
          >
            <select
              id={`${idPrefix}-labor-basis`}
              value={business.laborRateBasis}
              onChange={(e) => updateBusiness({ laborRateBasis: e.target.value as typeof business.laborRateBasis })}
              className="block w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-lime-surface"
            >
              <option value="already-loaded">Already fully loaded (wages + burden combined)</option>
              <option value="base-plus-percentage-burden">Base wage + a % burden on top</option>
              <option value="base-plus-component-burden">Base wage + itemized burden (taxes, comp, benefits)</option>
            </select>
          </Field>
          <Field
            label="Overhead"
            htmlFor={`${idPrefix}-overhead`}
            hint="As % of direct job cost"
            labelExtra={
              <HelpTooltip label="Overhead percentage">
                A percent of direct job cost (materials + labor + equipment + delivery + other) added on top to get
                true cost — covers costs like insurance, vehicles, and admin that aren't tied to any one job.
              </HelpTooltip>
            }
          >
            <div className="relative">
              <DraftNumberInput
                id={`${idPrefix}-overhead`}
                value={business.overheadPercent}
                onValueChange={(v) => updateBusiness({ overheadPercent: n(v) })}
                validate={validateOverheadPercent}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
          <Field
            label="Target margin"
            htmlFor={`${idPrefix}-margin`}
            hint="Profit share of selling price, not markup on cost"
            labelExtra={
              <HelpTooltip label="Target margin">
                Your target profit as a share of the selling price, not a markup on cost — a 30% margin means 30% of
                the final price is profit. This is what the recommended quote is priced to hit.
              </HelpTooltip>
            }
          >
            <div className="relative">
              <DraftNumberInput
                id={`${idPrefix}-margin`}
                value={business.targetMarginPercent}
                onValueChange={(v) => updateBusiness({ targetMarginPercent: n(v) })}
                validate={validateTargetMarginPercent}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
          <Field label="Default delivery cost" htmlFor={`${idPrefix}-delivery`}>
            <MoneyInput
              id={`${idPrefix}-delivery`}
              valueCents={business.defaultDeliveryCostCents}
              onValueCentsChange={(v) => updateBusiness({ defaultDeliveryCostCents: v === "" ? ZERO_CENTS : v })}
            />
          </Field>
          <Field label="Minimum project price" htmlFor={`${idPrefix}-minimum`}>
            <MoneyInput
              id={`${idPrefix}-minimum`}
              valueCents={business.minimumProjectPriceCents}
              onValueCentsChange={(v) => updateBusiness({ minimumProjectPriceCents: v === "" ? ZERO_CENTS : v })}
            />
          </Field>
          <Field
            label="Round quotes up to"
            htmlFor={`${idPrefix}-round`}
            hint="Always rounds UP, never to nearest — a rounded-down price could miss your target margin"
            labelExtra={
              <HelpTooltip label="Rounding increment">
                Your recommended quote is always rounded UP (never down, never to nearest) to this amount, so
                rounding can never quietly push a price below your target margin.
              </HelpTooltip>
            }
          >
            <select
              id={`${idPrefix}-round`}
              value={business.roundingIncrementCents}
              onChange={(e) => updateBusiness({ roundingIncrementCents: Number(e.target.value) as RoundingIncrementCents })}
              className="block w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-lime-surface"
            >
              {ROUNDING_INCREMENTS.map((inc) => (
                <option key={inc} value={inc}>
                  {inc === 1 ? "Nearest cent (no rounding)" : `Nearest ${formatCurrency(inc as MoneyCents)}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sales tax rate" htmlFor={`${idPrefix}-tax`} hint="Applied on top of the quote — margin is always calculated pre-tax">
            <div className="relative">
              <DraftNumberInput
                id={`${idPrefix}-tax`}
                value={business.taxRatePercent}
                onValueChange={(v) => updateBusiness({ taxRatePercent: n(v) })}
                validate={validateTaxRatePercent}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
          <Field
            label="Typical small-job true cost"
            htmlFor={`${idPrefix}-min-job-cost`}
            hint="Used only by the Minimum Job Audit — your own designated 'typical' job, not an average of every saved project"
            labelExtra={
              <HelpTooltip label="Minimum job audit">
                The representative true cost of a typical small job, which you set yourself. The Minimum Job Audit
                (Rate Health tab) compares your minimum project price against this figure — never an average across
                every saved project, since a few large jobs would quietly distort what "small job" means.
              </HelpTooltip>
            }
          >
            <MoneyInput
              id={`${idPrefix}-min-job-cost`}
              valueCents={business.representativeMinimumJobTrueCostCents ?? ""}
              onValueCentsChange={(v) => updateBusiness({ representativeMinimumJobTrueCostCents: v === "" ? undefined : v })}
              placeholder="Not set"
            />
          </Field>
        </div>
      </Card>

      <OverheadScenarioCard />

      <Card>
        <h2 className="text-lg font-bold text-ink">Data &amp; Backup</h2>
        <p className="mt-1 text-sm text-muted">
          Stored locally in this browser only — not backed up to any server or cloud. Clearing your browser's site
          data, using a different browser, or switching computers will lose it unless you've exported a backup file.
        </p>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Storage location</dt>
            <dd className="mt-1 text-sm font-medium text-ink">This browser's local storage (no account, no cloud)</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Schema version</dt>
            <dd className="mt-1 text-sm font-medium text-ink" title="For support: include this number if you report a data problem.">
              v{workspace.version}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Last saved</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatTimestamp(lastSavedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Last backup</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatTimestamp(lastBackupAt)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={handleExport}>
            <Download size={18} aria-hidden="true" /> Export / Download backup
          </Button>
          <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} aria-hidden="true" /> Restore from backup
          </Button>
        </div>

        <div className="mt-6 rounded-xl border border-red/30 bg-red-light/40 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-red">
            <ShieldAlert size={16} aria-hidden="true" /> Reset all data
          </p>
          <p className="mt-1 text-sm text-red">
            Replaces everything in this workspace — materials, equipment, assemblies, projects, and estimates — with
            the sample starting data. This cannot be undone, and anything you haven't exported will be lost. Type{" "}
            <strong>{RESET_CONFIRM_PHRASE}</strong> to confirm.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <TextInput
              aria-label={`Type ${RESET_CONFIRM_PHRASE} to confirm resetting all data`}
              placeholder={`Type ${RESET_CONFIRM_PHRASE}`}
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="max-w-[180px]"
            />
            <Button
              type="button"
              variant="danger"
              disabled={resetConfirmText.trim().toUpperCase() !== RESET_CONFIRM_PHRASE}
              onClick={() => {
                if (resetConfirmText.trim().toUpperCase() !== RESET_CONFIRM_PHRASE) return;
                resetAllData();
                setResetConfirmText("");
              }}
            >
              <RotateCcw size={16} aria-hidden="true" /> Reset all data
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">Backup &amp; restore</h2>
        <p className="mt-1 text-sm text-muted">
          Your workspace lives only in this browser. Export a JSON backup regularly, and use it to move your data to
          another device.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={handleExport}>
            <Download size={18} aria-hidden="true" /> Export workspace (JSON)
          </Button>
          <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} aria-hidden="true" /> Import workspace
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {importMessage && (
          <p role="status" className={`mt-3 text-sm font-medium ${importMessage.type === "error" ? "text-red" : "text-mint-ink"}`}>
            {importMessage.text}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">Reset</h2>
        <p className="mt-1 text-sm text-muted">Replace your current workspace with the sample starting data.</p>
        <div className="mt-4">
          <Button type="button" variant="danger" onClick={handleReset}>
            <RotateCcw size={18} aria-hidden="true" /> Reset workspace
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * "What if I quoted at a different overhead percent?" — a pure hypothetical
 * (see `evaluateOverheadScenario` in estimateMath.ts) run against every open
 * and locked project in the workspace, using each project's OWN current
 * overhead as the baseline (never assumed to match the business-wide
 * default above, since a project can carry its own value). Nothing here
 * changes any project or revision — it's read-only exploration.
 */
function OverheadScenarioCard() {
  const { workspace } = useWorkspace();
  const idPrefix = useId();
  const [scenarioPercent, setScenarioPercent] = useState<number | "">(workspace.business.overheadPercent);

  const results = useMemo(() => {
    if (scenarioPercent === "" || validateOverheadPercent(scenarioPercent)) return null;
    return evaluateOverheadScenario(scenarioPercent, workspace);
  }, [scenarioPercent, workspace]);

  const crossing = results?.filter((r) => r.crossesBelowTarget) ?? [];

  return (
    <Card>
      <h2 className="text-lg font-bold text-ink">Overhead scenario</h2>
      <p className="mt-1 text-sm text-muted">
        See what a different overhead percent would do to your open estimates and already-quoted jobs, before you
        change anything. This never edits any project — it's exploration only.
      </p>
      <div className="mt-4 max-w-xs">
        <Field label="Scenario overhead" htmlFor={`${idPrefix}-scenario-overhead`} hint="Compared against each project's own current overhead">
          <div className="relative">
            <DraftNumberInput
              id={`${idPrefix}-scenario-overhead`}
              value={scenarioPercent}
              onValueChange={setScenarioPercent}
              validate={validateOverheadPercent}
              className="pr-9"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
          </div>
        </Field>
      </div>

      {results && results.length === 0 && <p className="mt-4 text-sm text-muted">No projects to evaluate yet.</p>}

      {results && results.length > 0 && (
        <>
          {crossing.length > 0 ? (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-amber-light p-3 text-sm font-medium text-amber">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {crossing.length} project{crossing.length === 1 ? "" : "s"} would drop below its own target margin at this overhead rate.
            </p>
          ) : (
            <p className="mt-4 text-sm text-mint-ink">No project would cross below its own target margin at this rate.</p>
          )}

          <div className="mt-4 table-scroll">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-3 py-2.5">Project</th>
                  <th scope="col" className="px-3 py-2.5">Locked?</th>
                  <th scope="col" className="px-3 py-2.5">Current overhead</th>
                  <th scope="col" className="px-3 py-2.5">Baseline margin</th>
                  <th scope="col" className="px-3 py-2.5">Scenario margin</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.projectId} className={`border-b border-border last:border-b-0 ${r.crossesBelowTarget ? "bg-amber-light/40" : ""}`}>
                    <td className="px-3 py-2.5 font-semibold text-ink">{r.projectName}</td>
                    <td className="px-3 py-2.5 text-muted">{r.isLocked ? "Quoted" : "Draft"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatPercent(r.baselineOverheadPercent)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatPercent(r.baselineMargin)}</td>
                    <td className={`px-3 py-2.5 font-semibold tabular-nums ${r.crossesBelowTarget ? "text-amber" : ""}`}>{formatPercent(r.scenarioMargin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
