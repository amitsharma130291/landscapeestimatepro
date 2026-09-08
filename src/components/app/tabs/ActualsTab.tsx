import { useId, useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  calculateAssemblyVariance,
  calculateProfitabilitySummary,
  evaluateActualVsEstimate,
  evaluateProject,
} from "../../../lib/estimateMath";
import { formatCurrency, formatPercent, formatUnitLabel } from "../../../lib/calc";
import { useWorkspace } from "../../../lib/workspaceContext";
import { Card, EmptyState, NumberInput, StatTile } from "../../ui/primitives";
import { Button } from "../../ui/primitives";
import type { Project, ProjectActuals, ServiceLineActual } from "../../../lib/types";

function emptyActuals(project: Project): ProjectActuals {
  return {
    actualLaborPersonHours: 0,
    actualMaterialsCost: 0,
    actualEquipmentCost: 0,
    actualDeliveryCost: 0,
    actualOtherCost: 0,
    finalSellingPrice: 0,
    completedAt: new Date().toISOString().slice(0, 10),
    serviceLineActuals: project.serviceLines.map((line) => ({
      assemblyId: line.assemblyId,
      estimatedQuantity: line.quantity,
      actualQuantity: line.quantity,
      actualLaborHours: 0,
    })),
  };
}

export default function ActualsTab() {
  const { workspace } = useWorkspace();
  const { projects, assemblies, materials, equipment, business } = workspace;

  const variance = useMemo(() => calculateAssemblyVariance(projects, assemblies), [projects, assemblies]);
  const profitability = useMemo(
    () => calculateProfitabilitySummary(projects, assemblies, materials, equipment, business.loadedLaborRate),
    [projects, assemblies, materials, equipment, business.loadedLaborRate]
  );

  if (projects.length === 0) {
    return <EmptyState title="No projects yet" description="Save a project on the Estimates tab, then come back here once it's complete to compare estimated vs. actual cost." />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Record what a completed job actually cost to see how your estimate held up.</p>

      {profitability.completedCount > 0 && (
        <Card>
          <h2 className="text-lg font-bold text-ink">Profitability, across every completed job</h2>
          <p className="mt-1 text-sm text-muted">
            Whole-project margin — a project mixing several services isn't broken down service-by-service, since cost
            and overhead are allocated to the project as a whole.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <StatTile label="Completed jobs" value={profitability.completedCount} />
            <StatTile label="Avg. expected margin" value={formatPercent(profitability.avgExpectedMargin)} />
            <StatTile
              label="Avg. actual margin"
              value={formatPercent(profitability.avgActualMargin)}
              tone={
                profitability.avgActualMargin !== null && profitability.avgExpectedMargin !== null && profitability.avgActualMargin < profitability.avgExpectedMargin
                  ? "warning"
                  : "positive"
              }
            />
          </div>
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
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-3 sm:px-6">Service</th>
                  <th scope="col" className="px-3 py-3">Jobs</th>
                  <th scope="col" className="px-3 py-3">Est. qty (avg)</th>
                  <th scope="col" className="px-3 py-3">Actual qty (avg)</th>
                  <th scope="col" className="px-3 py-3">Material variance</th>
                  <th scope="col" className="px-3 py-3">Labor variance</th>
                </tr>
              </thead>
              <tbody>
                {variance.map((v) => (
                  <tr key={v.assemblyId} className="border-b border-border last:border-b-0">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {projects.map((project) => (
          <ProjectActualsCard key={project.id} project={project} />
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

function ProjectActualsCard({ project }: { project: Project }) {
  const { workspace, updateProject } = useWorkspace();
  const { assemblies, materials, equipment, business } = workspace;
  const idPrefix = useId();
  const [draft, setDraft] = useState<ProjectActuals>(project.actual ?? emptyActuals(project));
  const [saved, setSaved] = useState(Boolean(project.actual));

  const estimate = evaluateProject(project, assemblies, materials, equipment, business.loadedLaborRate);
  // A won job was actually sold at whatever was quoted (if locked in) — not
  // at whatever today's live recalculation would say, which may have moved
  // since.
  const estimateForComparison = { ...estimate, displayPrice: project.quotedPrice ?? estimate.displayPrice };
  const totalActualLaborHours = (draft.serviceLineActuals ?? []).reduce((sum, l) => sum + (l.actualLaborHours || 0), 0);
  const actualDirectCost =
    draft.actualMaterialsCost + totalActualLaborHours * business.loadedLaborRate + draft.actualEquipmentCost + draft.actualDeliveryCost + draft.actualOtherCost;
  const comparison = saved ? evaluateActualVsEstimate(estimateForComparison, actualDirectCost, project.overheadPercent) : null;

  function updateLineActual(assemblyId: string, patch: Partial<ServiceLineActual>) {
    setDraft((prev) => ({
      ...prev,
      serviceLineActuals: (prev.serviceLineActuals ?? []).map((l) => (l.assemblyId === assemblyId ? { ...l, ...patch } : l)),
    }));
  }

  function field<K extends keyof ProjectActuals>(key: K, label: string) {
    return (
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-${key}`}>
          {label}
        </label>
        <NumberInput
          id={`${idPrefix}-${key}`}
          value={draft[key] as number}
          onValueChange={(v) => setDraft((prev) => ({ ...prev, [key]: v === "" ? 0 : v }))}
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
          <p className="text-xs text-muted">Quoted at {formatCurrency(project.quotedPrice ?? estimate.displayPrice)} · {formatPercent(estimate.expectedMargin)} expected margin</p>
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
                return (
                  <tr key={line.assemblyId} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 font-medium text-ink">{assembly?.name ?? "Unknown service"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {line.estimatedQuantity} {assembly ? formatUnitLabel(assembly.unit) : ""}
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        value={line.actualQuantity}
                        onValueChange={(v) => updateLineActual(line.assemblyId, { actualQuantity: v === "" ? 0 : v })}
                        className="w-28"
                        aria-label={`Actual quantity for ${assembly?.name ?? "service"}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        value={line.actualLaborHours}
                        onValueChange={(v) => updateLineActual(line.assemblyId, { actualLaborHours: v === "" ? 0 : v })}
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
        {field("actualMaterialsCost", "Actual materials $")}
        {field("actualEquipmentCost", "Actual equipment $")}
        {field("actualDeliveryCost", "Actual delivery $")}
        {field("actualOtherCost", "Actual other $")}
      </div>
      <p className="mt-2 text-xs text-muted">Total actual labor: {totalActualLaborHours.toFixed(1)} hrs (from the service rows above)</p>

      <div className="mt-4">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            updateProject(project.id, { actual: { ...draft, actualLaborPersonHours: totalActualLaborHours }, status: "won" });
            setSaved(true);
          }}
        >
          Save actuals
        </Button>
      </div>

      {comparison && (
        <div className="mt-5 grid gap-4 rounded-xl bg-paper-dim p-4 sm:grid-cols-3">
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
              {comparison.costVariance >= 0 ? "+" : ""}
              {formatCurrency(comparison.costVariance, { cents: true })}
              {comparison.costVariancePercent !== null && ` (${comparison.costVariancePercent >= 0 ? "+" : ""}${comparison.costVariancePercent.toFixed(1)}%)`}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
