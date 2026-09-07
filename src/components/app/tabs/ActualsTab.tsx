import { useId, useState } from "react";
import { evaluateActualVsEstimate, evaluateProject } from "../../../lib/estimateMath";
import { formatCurrency, formatPercent } from "../../../lib/calc";
import { useWorkspace } from "../../../lib/workspaceContext";
import { Button, Card, EmptyState, NumberInput } from "../../ui/primitives";
import type { Project, ProjectActuals } from "../../../lib/types";

function emptyActuals(): ProjectActuals {
  return {
    actualLaborPersonHours: 0,
    actualMaterialsCost: 0,
    actualEquipmentCost: 0,
    actualDeliveryCost: 0,
    actualOtherCost: 0,
    finalSellingPrice: 0,
    completedAt: new Date().toISOString().slice(0, 10),
  };
}

export default function ActualsTab() {
  const { workspace } = useWorkspace();
  const { projects } = workspace;

  if (projects.length === 0) {
    return <EmptyState title="No projects yet" description="Save a project on the Estimates tab, then come back here once it's complete to compare estimated vs. actual cost." />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Record what a completed job actually cost to see how your estimate held up.</p>
      {projects.map((project) => (
        <ProjectActualsCard key={project.id} project={project} />
      ))}
    </div>
  );
}

function ProjectActualsCard({ project }: { project: Project }) {
  const { workspace, updateProject } = useWorkspace();
  const { assemblies, materials, equipment, business } = workspace;
  const idPrefix = useId();
  const [draft, setDraft] = useState<ProjectActuals>(project.actual ?? emptyActuals());
  const [saved, setSaved] = useState(Boolean(project.actual));

  const estimate = evaluateProject(project, assemblies, materials, equipment, business.loadedLaborRate);
  const actualDirectCost =
    draft.actualMaterialsCost + draft.actualLaborPersonHours * business.loadedLaborRate + draft.actualEquipmentCost + draft.actualDeliveryCost + draft.actualOtherCost;
  const comparison = saved ? evaluateActualVsEstimate(estimate, actualDirectCost, project.overheadPercent) : null;

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

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-ink">{project.name}</h3>
          <p className="text-xs text-muted">Quoted at {formatCurrency(estimate.displayPrice)} · {formatPercent(estimate.expectedMargin)} expected margin</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {field("actualMaterialsCost", "Actual materials $")}
        {field("actualLaborPersonHours", "Actual labor (hrs)")}
        {field("actualEquipmentCost", "Actual equipment $")}
        {field("actualDeliveryCost", "Actual delivery $")}
        {field("actualOtherCost", "Actual other $")}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            updateProject(project.id, { actual: draft, status: "won" });
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
