import { useMemo } from "react";
import { calculateAssemblyCost, evaluateMinimumJob, evaluateProject, evaluateRateHealth } from "../../../lib/estimateMath";
import { formatCurrency, formatPercent, formatUnitLabel } from "../../../lib/calc";
import { useWorkspace } from "../../../lib/workspaceContext";
import { Badge, Card, EmptyState, StatTile } from "../../ui/primitives";
import type { RateHealthStatus } from "../../../lib/types";

const STATUS_LABEL: Record<RateHealthStatus, string> = {
  healthy: "Healthy",
  attention: "Needs attention",
  critical: "Critical",
};

const STATUS_TONE: Record<RateHealthStatus, "mint" | "amber" | "red"> = {
  healthy: "mint",
  attention: "amber",
  critical: "red",
};

export default function RateHealthTab() {
  const { workspace } = useWorkspace();
  const { assemblies, materials, equipment, business, projects } = workspace;

  const rows = useMemo(
    () =>
      assemblies.map((assembly) => {
        const cost = calculateAssemblyCost(assembly, materials, equipment, business.loadedLaborRate);
        const health = evaluateRateHealth(cost.trueCostPerUnit, assembly.currentRate ?? 0, business.targetMarginPercent);
        return { assembly, cost, health };
      }),
    [assemblies, materials, equipment, business]
  );

  const counts = rows.reduce(
    (acc, row) => {
      acc[row.health.status] += 1;
      return acc;
    },
    { healthy: 0, attention: 0, critical: 0 } as Record<RateHealthStatus, number>
  );

  const minimumAudit = useMemo(() => {
    if (projects.length === 0) return null;
    const trueCosts = projects.map((p) => evaluateProject(p, assemblies, materials, equipment, business.loadedLaborRate).trueCost);
    const typicalTrueCost = trueCosts.reduce((sum, v) => sum + v, 0) / trueCosts.length;
    return evaluateMinimumJob(business.minimumProjectPrice, typicalTrueCost, business.targetMarginPercent);
  }, [projects, assemblies, materials, equipment, business]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <StatTile label="Healthy services" value={counts.healthy} tone="positive" />
        </Card>
        <Card>
          <StatTile label="Below target" value={counts.attention} tone="warning" />
        </Card>
        <Card>
          <StatTile label="Critical" value={counts.critical} tone="warning" />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <h2 className="text-lg font-bold text-ink">Service Rate Health</h2>
          <p className="mt-1 text-sm text-muted">Every saved service, compared against the rate required to hit your target margin.</p>
        </div>

        {rows.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState title="No services yet" description="Add a service assembly with a current rate on the Assemblies & Templates tab to see its rate health here." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-3 sm:px-6">Service</th>
                  <th scope="col" className="px-3 py-3">Current rate</th>
                  <th scope="col" className="px-3 py-3">True cost</th>
                  <th scope="col" className="px-3 py-3">Margin</th>
                  <th scope="col" className="px-3 py-3">Target</th>
                  <th scope="col" className="px-3 py-3">Required</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ assembly, cost, health }) => (
                  <tr key={assembly.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-3 font-semibold text-ink sm:px-6">
                      {assembly.name} <span className="font-normal text-muted">/ {formatUnitLabel(assembly.unit)}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(health.currentRate, { cents: true })}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(cost.trueCostPerUnit, { cents: true })}</td>
                    <td className="px-3 py-3 tabular-nums">{formatPercent(health.currentMargin)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatPercent(business.targetMarginPercent, 0)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(health.requiredRate, { cents: true })}</td>
                    <td className="px-3 py-3">
                      <Badge tone={STATUS_TONE[health.status]}>{STATUS_LABEL[health.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">Minimum job audit</h2>
        {minimumAudit ? (
          <div className="mt-3">
            <p className="text-sm text-muted">
              Your current minimum of <strong className="text-ink">{formatCurrency(minimumAudit.currentMinimum)}</strong> is a{" "}
              <strong className="text-ink">{formatPercent(minimumAudit.currentMargin)}</strong> margin against your saved
              projects' typical true cost.
            </p>
            {minimumAudit.isBelowTarget ? (
              <p className="mt-2 rounded-xl bg-amber-light p-3 text-sm text-ink">
                That's below your {formatPercent(business.targetMarginPercent, 0)} target. Based on your saved
                projects, a minimum around <strong>{formatCurrency(minimumAudit.requiredMinimum)}</strong> would hit
                target margin instead.
              </p>
            ) : (
              <p className="mt-2 rounded-xl bg-mint p-3 text-sm text-mint-ink">Your minimum already meets your target margin.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Save at least one project on the Estimates tab to audit your minimum project price.</p>
        )}
      </Card>
    </div>
  );
}
