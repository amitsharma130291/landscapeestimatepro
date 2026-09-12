import { useId, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  calculateActualsCategoryComparison,
  calculateAssemblyVariance,
  calculateProfitabilitySummary,
  evaluateActualVsEstimate,
  evaluateProject,
  getActiveRevision,
  type CategoryCostComparison,
} from "../../../lib/estimateMath";
import { formatCurrency, formatPercent, formatUnitLabel } from "../../../lib/calc";
import { fromDecimalToCents, safe as safeCents, ZERO_CENTS, type MoneyCents } from "../../../lib/money";
import { getActualsValidationErrors } from "../../../lib/validation";
import { useWorkspace } from "../../../lib/workspaceContext";
import { Card, EmptyState, MoneyInput, NumberInput, StatTile } from "../../ui/primitives";
import { Button } from "../../ui/primitives";
import type { ReactNode } from "react";
import type { Project, ProjectActuals, ServiceLineActual } from "../../../lib/types";

function emptyActuals(project: Project): ProjectActuals {
  return {
    actualLaborPersonHours: 0,
    actualMaterialsCostCents: ZERO_CENTS,
    actualEquipmentCostCents: ZERO_CENTS,
    actualDeliveryCostCents: ZERO_CENTS,
    actualOtherCostCents: ZERO_CENTS,
    finalSellingPriceCents: ZERO_CENTS,
    completedAt: new Date().toISOString().slice(0, 10),
    serviceLineActuals: project.serviceLines.map((line) => ({
      assemblyId: line.assemblyId,
      estimatedQuantity: line.quantity,
      actualQuantity: line.quantity,
      actualLaborHours: 0,
    })),
  };
}

/** DOM anchor id for one project's actuals card — used by the profitability
 * summary's drill-down links to scroll/highlight the underlying project(s)
 * a given number is built from. */
function projectAnchorId(projectId: string): string {
  return `actuals-project-${projectId}`;
}

/** A StatTile that also acts as a drill-down link into the project list
 * below, when `onFocus` is provided — clicking it highlights and scrolls to
 * the project(s) that make up the number. Every aggregate figure in the
 * profitability summary should be reachable this way rather than being an
 * inert number nobody can trace back to real jobs. */
function DrillableStat({
  label,
  value,
  tone,
  onFocus,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "positive" | "warning";
  onFocus?: () => void;
}) {
  if (!onFocus) return <StatTile label={label} value={value} tone={tone} />;
  return (
    <button
      type="button"
      onClick={onFocus}
      className="-m-2 rounded-lg p-2 text-left transition-colors hover:bg-paper-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-surface"
    >
      <StatTile label={label} value={value} tone={tone} />
    </button>
  );
}

export default function ActualsTab() {
  const { workspace } = useWorkspace();
  const { projects, business } = workspace;

  const variance = useMemo(() => calculateAssemblyVariance(projects), [projects]);
  const profitability = useMemo(() => calculateProfitabilitySummary(projects, business), [projects, business]);

  // Which project(s) a click on a summary number is currently pointing at —
  // drives both the "Highlighting N project(s)" banner and the ring
  // highlight on the matching cards below. Cleared explicitly, or replaced
  // by the next click.
  const [highlight, setHighlight] = useState<{ ids: string[]; label: string } | null>(null);

  function focusProjects(ids: string[], label: string) {
    if (ids.length === 0) return;
    setHighlight({ ids, label });
    const target = document.getElementById(projectAnchorId(ids[0]));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (projects.length === 0) {
    return <EmptyState title="No projects yet" description="Save a project on the Estimates tab, then come back here once it's complete to compare estimated vs. actual cost." />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Record what a completed job actually cost to see how your estimate held up.</p>

      {profitability.eligibleCount === 0 && profitability.excludedCount === 0 && (
        <Card>
          <h2 className="text-lg font-bold text-ink">Profitability reporting</h2>
          <p className="mt-1.5 text-sm text-muted">
            No profitability figures yet — this needs at least one project that's been marked <strong className="text-ink">Accepted</strong>, has its actual
            costs recorded below, and is confirmed <strong className="text-ink">Completed</strong>. Nothing is broken and no data has been lost; there's
            simply nothing eligible to report on yet.
          </p>
        </Card>
      )}

      {(profitability.eligibleCount > 0 || profitability.excludedCount > 0) && (
        <Card>
          <h2 className="text-lg font-bold text-ink">Profitability, across every completed job</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-ink">Headline figure: revenue-weighted margin</span> — (total quoted
            revenue − total cost) ÷ total quoted revenue, so a handful of large jobs count for more than one small
            job with an unusual margin. Also a whole-project rollup: a project mixing several services isn't broken
            down service-by-service, since cost and overhead are allocated to the project as a whole. Every number
            below is clickable — it jumps to and highlights the project(s) it's built from.
          </p>

          {highlight && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-lime-surface/40 px-3 py-2 text-xs font-semibold text-ink">
              <span>
                Highlighting {highlight.ids.length} project{highlight.ids.length === 1 ? "" : "s"} — {highlight.label}
              </span>
              <button type="button" onClick={() => setHighlight(null)} className="tap-target underline underline-offset-2 hover:no-underline">
                Clear
              </button>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-4">
            <DrillableStat
              label="Eligible jobs"
              value={profitability.eligibleCount}
              onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
            />
            <DrillableStat
              label="Revenue-weighted expected margin"
              value={formatPercent(profitability.weightedExpectedMargin)}
              onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
            />
            <DrillableStat
              label="Revenue-weighted actual margin"
              value={formatPercent(profitability.weightedActualMargin)}
              tone={
                profitability.weightedActualMargin !== null &&
                profitability.weightedExpectedMargin !== null &&
                profitability.weightedActualMargin < profitability.weightedExpectedMargin
                  ? "warning"
                  : "positive"
              }
              onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
            />
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Dollar totals — same eligible jobs as above</p>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <DrillableStat
                label="Total quoted revenue"
                value={formatCurrency(profitability.totalQuotedRevenueCents, { cents: true })}
                onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
              />
              <DrillableStat
                label="Total actual true cost"
                value={formatCurrency(profitability.totalActualTrueCostCents, { cents: true })}
                onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
              />
              <DrillableStat
                label="Total gross profit"
                value={
                  profitability.totalGrossProfitCents === null
                    ? "—"
                    : `${profitability.totalGrossProfitCents >= 0 ? "+" : ""}${formatCurrency(profitability.totalGrossProfitCents as MoneyCents, { cents: true })}`
                }
                tone={profitability.totalGrossProfitCents === null ? "neutral" : profitability.totalGrossProfitCents < 0 ? "warning" : "positive"}
                onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
              />
            </div>
          </div>

          {(profitability.mostOverBudgetProjectIds.length > 0 || profitability.largestMarginDeteriorationProjectIds.length > 0) && (
            <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              {profitability.mostOverBudgetProjectIds.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Most over-budget projects</p>
                  <ul className="mt-2 space-y-3">
                    {profitability.mostOverBudgetProjectIds.slice(0, 3).map((id) => {
                      const detail = profitability.perProjectDetail.find((p) => p.projectId === id);
                      if (!detail) return null;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => focusProjects([id], detail.projectName)}
                            className="tap-target flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-paper-dim"
                          >
                            <span className="font-medium text-ink">{detail.projectName}</span>
                            <span className="font-semibold tabular-nums text-red">+{formatCurrency(detail.costVarianceCents as MoneyCents, { cents: true })}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {profitability.largestMarginDeteriorationProjectIds.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Largest margin deterioration vs. quoted</p>
                  <ul className="mt-2 space-y-3">
                    {profitability.largestMarginDeteriorationProjectIds.slice(0, 3).map((id) => {
                      const detail = profitability.perProjectDetail.find((p) => p.projectId === id);
                      if (!detail) return null;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => focusProjects([id], detail.projectName)}
                            className="tap-target flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-paper-dim"
                          >
                            <span className="font-medium text-ink">{detail.projectName}</span>
                            <span className="font-semibold tabular-nums text-red">{(detail.marginDeltaPoints as number).toFixed(1)} pts</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Secondary — simple average and median (not the headline)</p>
            <p className="mt-1 text-xs text-muted">
              These treat every job equally regardless of size — a single unusually large or small job can swing them
              in a way the revenue-weighted figure above protects against.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <DrillableStat
                label="Simple average actual margin"
                value={formatPercent(profitability.averageActualMarginPerJob)}
                onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
              />
              <DrillableStat
                label="Median actual margin"
                value={formatPercent(profitability.medianActualMarginPerJob)}
                onFocus={profitability.eligibleCount > 0 ? () => focusProjects(profitability.eligibleProjectIds, "every eligible job") : undefined}
              />
            </div>
          </div>

          {profitability.excludedCount > 0 && (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted">
              <button
                type="button"
                onClick={() => focusProjects(profitability.excludedProjectIds, "excluded jobs")}
                className="font-semibold text-ink underline underline-offset-2 hover:no-underline"
              >
                {profitability.excludedCount}
              </button>{" "}
              completed job{profitability.excludedCount === 1 ? "" : "s"} excluded from every figure above:{" "}
              {Object.entries(profitability.exclusionReasons)
                .map(([reason, count]) => `${count} — ${reason}`)
                .join("; ")}
              .
            </p>
          )}
        </Card>
      )}

      {variance.length > 0 && (
        <Card padded={false}>
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <h2 className="text-lg font-bold text-ink">Historical variance by service</h2>
            <p className="mt-1 text-sm text-muted">
              How your production-rate and quantity assumptions have held up across completed jobs. This never
              changes your saved rates automatically — it's information, not an auto-correction.
            </p>
          </div>
          <div className="mt-4 table-scroll">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-3 sm:px-6">Service</th>
                  <th scope="col" className="px-3 py-3">Jobs</th>
                  <th scope="col" className="px-3 py-3">Est. qty (avg)</th>
                  <th scope="col" className="px-3 py-3">Actual qty (avg)</th>
                  <th scope="col" className="px-3 py-3">Material variance</th>
                  <th scope="col" className="px-3 py-3">Labor variance</th>
                  <th scope="col" className="px-3 py-3">Actual rate</th>
                  <th scope="col" className="px-3 py-3">Excluded</th>
                </tr>
              </thead>
              <tbody>
                {variance.map((v) => (
                  <tr key={`${v.assemblyId}-${v.unit}`} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-3 font-semibold text-ink sm:px-6">{v.assemblyName}</td>
                    <td className="px-3 py-3 tabular-nums">{v.completedCount}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {v.avgEstimatedQuantity.toFixed(1)} {formatUnitLabel(v.unit)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {v.avgActualQuantity.toFixed(1)} {formatUnitLabel(v.unit)}
                    </td>
                    <td className="px-3 py-3">
                      <VarianceValue percent={v.materialVariancePercent} />
                    </td>
                    <td className="px-3 py-3">
                      <VarianceValue percent={v.laborVariancePercent} />
                    </td>
                    <td className="px-3 py-3 tabular-nums text-muted">
                      {v.avgActualProductionRate !== null ? `${v.avgActualProductionRate.toFixed(2)} ${formatUnitLabel(v.unit)}/hr` : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {v.excludedRecordCount > 0 ? (
                        <span title={Object.entries(v.exclusionReasons).map(([reason, count]) => `${count}× ${reason}`).join(", ")}>
                          {v.excludedRecordCount} record{v.excludedRecordCount === 1 ? "" : "s"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {projects.map((project) => (
          <div
            key={project.id}
            id={projectAnchorId(project.id)}
            className={highlight?.ids.includes(project.id) ? "rounded-2xl ring-2 ring-lime-surface ring-offset-2 transition-shadow" : ""}
          >
            <ProjectActualsCard project={project} />
          </div>
        ))}
      </div>
    </div>
  );
}

function VarianceValue({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-muted">—</span>;
  const isOver = percent > 2;
  const isUnder = percent < -2;
  const Icon = isOver ? TrendingUp : isUnder ? TrendingDown : null;
  const colorClass = isOver ? "text-red" : isUnder ? "text-mint-ink" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${colorClass}`}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {percent >= 0 ? "+" : ""}
      {percent.toFixed(1)}%
    </span>
  );
}

type ActualMoneyFieldKey = "actualMaterialsCostCents" | "actualEquipmentCostCents" | "actualDeliveryCostCents" | "actualOtherCostCents";

const MONEY_FIELD_LABELS: Record<ActualMoneyFieldKey, string> = {
  actualMaterialsCostCents: "Actual materials cost",
  actualEquipmentCostCents: "Actual equipment cost",
  actualDeliveryCostCents: "Actual delivery cost",
  actualOtherCostCents: "Actual other cost",
};

function lineFieldKey(assemblyId: string, field: "actualQuantity" | "actualLaborHours"): string {
  return `${assemblyId}:${field}`;
}

/** Which cost-category comparison row a saved job's "actual" side is
 * currently tied to a genuine entered value for — see the `entered` set
 * built in `ProjectActualsCard` and its doc comment for why this can only
 * be tracked for the current editing session, not persisted. */
function categoryHasEnteredActual(category: CategoryCostComparison["category"], entered: Set<string>, draft: ProjectActuals): boolean {
  if (category === "materials") return entered.has("actualMaterialsCostCents");
  if (category === "equipment") return entered.has("actualEquipmentCostCents");
  if (category === "delivery") return entered.has("actualDeliveryCostCents");
  if (category === "other") return entered.has("actualOtherCostCents");
  // labor: entered if ANY service line's actual labor hours has been
  // deliberately entered, since the labor category total is the sum of them.
  return (draft.serviceLineActuals ?? []).some((l) => entered.has(lineFieldKey(l.assemblyId, "actualLaborHours")));
}

function ProjectActualsCard({ project }: { project: Project }) {
  const { workspace, updateProject } = useWorkspace();
  const { assemblies, materials, equipment, business } = workspace;
  const idPrefix = useId();
  const [draft, setDraft] = useState<ProjectActuals>(project.actual ?? emptyActuals(project));
  const [saved, setSaved] = useState(Boolean(project.actual));

  // Tracks which fields the contractor has DELIBERATELY entered, as opposed
  // to a field still sitting at its internal default (0, or the estimated
  // quantity as a starting guess). Without this, a never-touched field and a
  // field genuinely entered as zero/unchanged are indistinguishable, and the
  // UI would show a misleading "$0.00"/"0.0 hrs" for data that was never
  // actually recorded — the exact bug this tracks around.
  //
  // Limitation: `ProjectActuals` itself has no persisted "was this touched"
  // flag (adding one is out of scope here), so this can only be trusted for
  // the current editing session. A previously-saved record is treated as
  // fully entered on (re)mount — the best available signal without a data
  // model change, and still correct for the common case of filling the form
  // out and saving in one sitting.
  const [entered, setEntered] = useState<Set<string>>(() => {
    if (!project.actual) return new Set<string>();
    const s = new Set<string>();
    (Object.keys(MONEY_FIELD_LABELS) as ActualMoneyFieldKey[]).forEach((k) => s.add(k));
    (project.actual.serviceLineActuals ?? []).forEach((l) => {
      s.add(lineFieldKey(l.assemblyId, "actualQuantity"));
      s.add(lineFieldKey(l.assemblyId, "actualLaborHours"));
    });
    return s;
  });

  function setFieldEntered(key: string, isEntered: boolean) {
    setEntered((prev) => {
      const next = new Set(prev);
      if (isEntered) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const estimate = evaluateProject(project, assemblies, materials, equipment, business);
  const activeRevision = getActiveRevision(project);
  const totalActualLaborHours = (draft.serviceLineActuals ?? []).reduce((sum, l) => sum + (l.actualLaborHours || 0), 0);
  const anyLaborHoursEntered = (draft.serviceLineActuals ?? []).some((l) => entered.has(lineFieldKey(l.assemblyId, "actualLaborHours")));
  const actualLaborCostCents: MoneyCents = fromDecimalToCents(new Decimal(totalActualLaborHours).times(safeCents(business.loadedLaborRateCents)));
  const actualDirectCostCents: MoneyCents = safeCents(
    draft.actualMaterialsCostCents + actualLaborCostCents + draft.actualEquipmentCostCents + draft.actualDeliveryCostCents + draft.actualOtherCostCents
  );
  const actualsErrors = getActualsValidationErrors(draft);
  // Comparison is always against the LOCKED quote revision — never a live
  // recalculation — so a job with no revision yet (never actually quoted)
  // has nothing honest to compare against.
  const comparison = saved && activeRevision ? evaluateActualVsEstimate(activeRevision, actualDirectCostCents) : null;
  const categoryComparison = saved && activeRevision ? calculateActualsCategoryComparison(activeRevision, draft, business.loadedLaborRateCents) : null;

  // Every field the contractor hasn't deliberately entered yet — surfaced so
  // incompleteness is visible before (or after) this job gets marked
  // Completed, without changing how "Completed" itself is derived.
  const incompleteFieldLabels: string[] = [];
  (Object.keys(MONEY_FIELD_LABELS) as ActualMoneyFieldKey[]).forEach((key) => {
    if (!entered.has(key)) incompleteFieldLabels.push(MONEY_FIELD_LABELS[key]);
  });
  (draft.serviceLineActuals ?? []).forEach((line) => {
    const assembly = assemblies.find((a) => a.id === line.assemblyId);
    const name = assembly?.name ?? "a service";
    if (!entered.has(lineFieldKey(line.assemblyId, "actualQuantity"))) incompleteFieldLabels.push(`Actual quantity for ${name}`);
    if (!entered.has(lineFieldKey(line.assemblyId, "actualLaborHours"))) incompleteFieldLabels.push(`Actual labor hours for ${name}`);
  });

  function updateLineActual(assemblyId: string, patch: Partial<ServiceLineActual>) {
    setDraft((prev) => ({
      ...prev,
      serviceLineActuals: (prev.serviceLineActuals ?? []).map((l) => (l.assemblyId === assemblyId ? { ...l, ...patch } : l)),
    }));
  }

  function moneyField(key: ActualMoneyFieldKey, label: string) {
    const isEntered = entered.has(key);
    return (
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-${key}`}>
          {label}
        </label>
        <MoneyInput
          id={`${idPrefix}-${key}`}
          valueCents={isEntered ? draft[key] : ""}
          placeholder="Not entered yet"
          onValueCentsChange={(v) => {
            setDraft((prev) => ({ ...prev, [key]: v === "" ? ZERO_CENTS : v }));
            setFieldEntered(key, v !== "");
          }}
        />
      </div>
    );
  }

  if (project.serviceLines.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-ink">{project.name}</h3>
          <p className="text-xs text-muted">Quoted at {formatCurrency(activeRevision?.actualQuotedPriceCents ?? estimate.displayPriceCents)} · {formatPercent(estimate.expectedMargin)} expected margin</p>
          {!activeRevision && (
            <p className="mt-1 text-xs text-amber">Not yet quoted — actuals can be recorded, but expected-vs-actual comparison needs a quote revision from the Estimates tab first.</p>
          )}
        </div>
      </div>

      {(draft.serviceLineActuals?.length ?? 0) > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="py-2 pr-3">Service</th>
                <th scope="col" className="px-3 py-2">Estimated qty</th>
                <th scope="col" className="px-3 py-2">Actual qty</th>
                <th scope="col" className="px-3 py-2">Actual labor (hrs)</th>
              </tr>
            </thead>
            <tbody>
              {draft.serviceLineActuals!.map((line) => {
                const assembly = assemblies.find((a) => a.id === line.assemblyId);
                const qtyKey = lineFieldKey(line.assemblyId, "actualQuantity");
                const hoursKey = lineFieldKey(line.assemblyId, "actualLaborHours");
                return (
                  <tr key={line.assemblyId} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 font-medium text-ink">{assembly?.name ?? "Unknown service"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {line.estimatedQuantity} {assembly ? formatUnitLabel(assembly.unit) : ""}
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        value={entered.has(qtyKey) ? line.actualQuantity : ""}
                        placeholder="Not entered"
                        onValueChange={(v) => {
                          updateLineActual(line.assemblyId, { actualQuantity: v === "" ? 0 : v });
                          setFieldEntered(qtyKey, v !== "");
                        }}
                        className="w-28"
                        aria-label={`Actual quantity for ${assembly?.name ?? "service"}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        value={entered.has(hoursKey) ? line.actualLaborHours : ""}
                        placeholder="Not entered"
                        onValueChange={(v) => {
                          updateLineActual(line.assemblyId, { actualLaborHours: v === "" ? 0 : v });
                          setFieldEntered(hoursKey, v !== "");
                        }}
                        className="w-28"
                        aria-label={`Actual labor hours for ${assembly?.name ?? "service"}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {moneyField("actualMaterialsCostCents", "Actual materials $")}
        {moneyField("actualEquipmentCostCents", "Actual equipment $")}
        {moneyField("actualDeliveryCostCents", "Actual delivery $")}
        {moneyField("actualOtherCostCents", "Actual other $")}
      </div>
      <p className="mt-2 text-xs text-muted">
        Total actual labor: {anyLaborHoursEntered ? `${totalActualLaborHours.toFixed(1)} hrs` : "Not entered yet"} (from the service rows above)
      </p>

      {incompleteFieldLabels.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-light p-3 text-xs font-medium text-amber">
          <p className="font-semibold">
            {incompleteFieldLabels.length} field{incompleteFieldLabels.length === 1 ? "" : "s"} not entered yet
            {saved ? " — this job is marked Completed with incomplete actual data:" : " — fill these in before marking this job Completed:"}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {incompleteFieldLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}

      {actualsErrors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-red-light p-3 text-xs font-medium text-red">
          {actualsErrors.map((error, i) => (
            <li key={i} role="alert">{error}</li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Button
          type="button"
          size="sm"
          disabled={actualsErrors.length > 0}
          onClick={() => {
            // `draft.actualLaborPersonHours` itself is never kept in sync while
            // typing — only the per-line `actualLaborHours` fields are, and
            // `totalActualLaborHours` derives from those at render time. Without
            // also updating local `draft` here, the category-comparison table
            // below (computed from `draft`, not from the just-saved workspace
            // value) would render ONE stale frame showing 0 actual labor hours —
            // a false "-100% labor variance" — until the next remount.
            const withLaborHours = { ...draft, actualLaborPersonHours: totalActualLaborHours };
            updateProject(project.id, { actual: withLaborHours, status: "won" });
            setDraft(withLaborHours);
            setSaved(true);
          }}
        >
          Save actuals
        </Button>
      </div>

      {comparison && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 rounded-xl bg-paper-dim p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Expected margin</p>
              <p className="mt-1 text-xl font-extrabold text-ink">{formatPercent(comparison.expectedMargin)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Actual margin</p>
              <p className={`mt-1 text-xl font-extrabold ${(comparison.actualMargin ?? 0) < (comparison.expectedMargin ?? 0) ? "text-red" : "text-mint-ink"}`}>
                {formatPercent(comparison.actualMargin)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cost variance</p>
              <p className="mt-1 text-xl font-extrabold text-ink">
                {comparison.costVarianceCents >= 0 ? "+" : ""}
                {formatCurrency(comparison.costVarianceCents as MoneyCents, { cents: true })}
                {comparison.costVariancePercent !== null && ` (${comparison.costVariancePercent >= 0 ? "+" : ""}${comparison.costVariancePercent.toFixed(1)}%)`}
              </p>
            </div>
          </div>

          {categoryComparison && (
            <div className="table-scroll rounded-xl border border-border">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                    <th scope="col" className="px-4 py-2">Category</th>
                    <th scope="col" className="px-4 py-2">Estimated</th>
                    <th scope="col" className="px-4 py-2">Actual</th>
                    <th scope="col" className="px-4 py-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryComparison.map((row) => {
                    const actualEntered = categoryHasEnteredActual(row.category, entered, draft);
                    return (
                      <tr key={row.category} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-2 font-semibold text-ink">{row.label}</td>
                        <td className="px-4 py-2 tabular-nums text-muted">{formatCurrency(row.estimatedCents, { cents: true })}</td>
                        <td className="px-4 py-2 tabular-nums text-muted">
                          {actualEntered ? formatCurrency(row.actualCents, { cents: true }) : "Not entered yet"}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {actualEntered ? (
                            <span className={row.varianceCents > 0 ? "font-semibold text-red" : row.varianceCents < 0 ? "font-semibold text-mint-ink" : "text-muted"}>
                              {row.varianceCents >= 0 ? "+" : ""}
                              {formatCurrency(row.varianceCents as MoneyCents, { cents: true })}
                              {row.variancePercent !== null && ` (${row.variancePercent >= 0 ? "+" : ""}${row.variancePercent.toFixed(1)}%)`}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
