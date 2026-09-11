import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { classifyCostImpact, snapshotCostImpact, type CostImpactKind, type CostImpactSnapshot, type CostImpactWorkspace } from "../../lib/estimateMath";
import { formatCurrency } from "../../lib/calc";
import type { MoneyCents } from "../../lib/money";

interface CostImpactResult {
  itemLabel: string;
  previousValue: MoneyCents;
  newValue: MoneyCents;
  before: CostImpactSnapshot;
  after: CostImpactSnapshot;
}

/** Tracks a rate field (in cents) across a focus→blur edit and reports what
 * it touched (brief killer features #16-18: material/labor/equipment
 * cost-impact). Call `startTracking` on focus (captures the "before"
 * picture), `finishTracking` on blur/change-committed (captures "after" and
 * diffs). */
export function useCostImpactAlert() {
  const [pending, setPending] = useState<{ kind: CostImpactKind; itemId?: string; before: CostImpactSnapshot; previousValue: MoneyCents } | null>(
    null
  );
  const [result, setResult] = useState<CostImpactResult | null>(null);

  function startTracking(kind: CostImpactKind, itemId: string | undefined, previousValue: MoneyCents, workspace: CostImpactWorkspace) {
    setPending({ kind, itemId, before: snapshotCostImpact(kind, itemId, workspace), previousValue });
  }

  function finishTracking(newValue: MoneyCents, workspace: CostImpactWorkspace, itemLabel: string) {
    if (!pending) return;
    if (newValue === pending.previousValue) {
      setPending(null);
      return;
    }
    const after = snapshotCostImpact(pending.kind, pending.itemId, workspace);
    // Only worth a banner if the change actually touches something.
    if (after.affectedAssemblyIds.length > 0) {
      setResult({ itemLabel, previousValue: pending.previousValue, newValue, before: pending.before, after });
    }
    setPending(null);
  }

  return { result, startTracking, finishTracking, dismiss: () => setResult(null) };
}

export function CostImpactBanner({ result, onDismiss }: { result: CostImpactResult | null; onDismiss: () => void }) {
  if (!result) return null;
  const pctChange = result.previousValue > 0 ? ((result.newValue - result.previousValue) / result.previousValue) * 100 : null;
  const impacts = classifyCostImpact(result.before, result.after);
  const newlyBelowTarget = impacts.filter((i) => i.thresholdTransition === "newly-below");
  const recovered = impacts.filter((i) => i.thresholdTransition === "recovered-above");
  const worsened = impacts.filter((i) => i.impactDirection === "worsened");

  return (
    <div role="status" className="mb-6 rounded-2xl border border-amber-light bg-amber-light/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
          <div>
            <p className="font-bold text-ink">
              {result.itemLabel}: {formatCurrency(result.previousValue, { cents: true })} → {formatCurrency(result.newValue, { cents: true })}
              {pctChange !== null && (
                <span className="ml-1.5 font-semibold text-amber">
                  ({pctChange >= 0 ? "+" : ""}
                  {pctChange.toFixed(1)}%)
                </span>
              )}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-ink sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <dt className="text-xs text-muted">Assemblies affected</dt>
                <dd className="font-semibold">{result.after.affectedAssemblyIds.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Templates affected</dt>
                <dd className="font-semibold">{result.after.affectedTemplateIds.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Open estimates affected</dt>
                <dd className="font-semibold">{result.after.affectedProjectIds.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Margin worsened</dt>
                <dd className={`font-semibold ${worsened.length > 0 ? "text-amber" : ""}`}>{worsened.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Now below target</dt>
                <dd className={`font-semibold ${newlyBelowTarget.length > 0 ? "text-red" : ""}`}>{newlyBelowTarget.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Recovered above target</dt>
                <dd className={`font-semibold ${recovered.length > 0 ? "text-mint-ink" : ""}`}>{recovered.length}</dd>
              </div>
            </dl>
          </div>
        </div>
        <button type="button" onClick={onDismiss} className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white/60" aria-label="Dismiss">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
