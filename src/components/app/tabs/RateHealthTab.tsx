import { useMemo } from "react";
import { calculateAssemblyCost, evaluateMinimumJob, evaluateRateHealth } from "../../../lib/estimateMath";
import { formatCurrency, formatPercent, formatUnitLabel } from "../../../lib/calc";
import { useWorkspace } from "../../../lib/workspaceContext";
import { Badge, Card, EmptyState, StatTile } from "../../ui/primitives";
import { HelpTooltip } from "../../ui/HelpTooltip";
import type { RateHealthStatus } from "../../../lib/types";

const STATUS_LABEL: Record<RateHealthStatus, string> = {
  healthy: "Healthy",
  attention: "Needs attention",
  critical: "Critical",
  invalid: "Invalid target margin",
};

const STATUS_TONE: Record<RateHealthStatus, "mint" | "amber" | "red"> = {
  healthy: "mint",
  attention: "amber",
  critical: "red",
  invalid: "red",
};

export default function RateHealthTab() {
  const { workspace } = useWorkspace();
  const { assemblies, materials, equipment, business } = workspace;

  const rows = useMemo(
    () =>
      assemblies.map((assembly) => {
        const cost = calculateAssemblyCost(assembly, materials, equipment, business.loadedLaborRateCents, business.overheadPercent);
        const health = evaluateRateHealth(cost.trueCostPerUnitCents, assembly.currentRateCents ?? 0, business.targetMarginPercent);
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

  // Deliberately NOT the average true cost across every saved project — a
  // couple of large jobs would silently inflate what "typical small job"
  // means. The contractor designates one representative job cost themselves
  // (Settings tab); until they do, the audit has nothing honest to compare
  // against.
  const minimumAudit = useMemo(() => {
    if (business.representativeMinimumJobTrueCostCents === undefined) return null;
    return evaluateMinimumJob(business.minimumProjectPriceCents, business.representativeMinimumJobTrueCostCents, business.targetMarginPercent);
  }, [business]);

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
          <div className="mt-4 table-scroll">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-3 sm:px-6">Service</th>
                  <th scope="col" className="px-3 py-3">Current rate</th>
                  <th scope="col" className="px-3 py-3">True cost (incl. overhead)</th>
                  <th scope="col" className="px-3 py-3">Margin</th>
                  <th scope="col" className="px-3 py-3">Target</th>
                  <th scope="col" className="px-3 py-3">Required</th>
                  <th scope="col" className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      Status
                      <HelpTooltip label="Rate health status">
                        <strong>Healthy</strong> meets your target margin. <strong>Below target</strong> covers its true cost but falls short of your target margin — worth a price review. <strong>Critical</strong> means the current rate doesn't even cover true cost, so you lose money on every unit sold at it.
                      </HelpTooltip>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ assembly, cost, health }) => (
                  <tr key={assembly.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-3 font-semibold text-ink sm:px-6">
                      {assembly.name} <span className="font-normal text-muted">/ {formatUnitLabel(assembly.unit)}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(health.currentRateCents, { cents: true })}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(cost.trueCostPerUnitCents, { cents: true })}</td>
                    <td className="px-3 py-3 tabular-nums">{formatPercent(health.currentMargin)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatPercent(business.targetMarginPercent, 0)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(health.requiredRateCents, { cents: true })}</td>
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
              Your current minimum of <strong className="text-ink">{formatCurrency(minimumAudit.currentMinimumCents)}</strong> is a{" "}
              <strong className="text-ink">{formatPercent(minimumAudit.currentMargin)}</strong> margin against your
              designated typical small-job true cost.
            </p>
            {minimumAudit.isBelowTarget ? (
              <p className="mt-2 rounded-xl bg-amber-light p-3 text-sm text-ink">
                That's below your {formatPercent(business.targetMarginPercent, 0)} target. A minimum around{" "}
                <strong>{formatCurrency(minimumAudit.requiredMinimumCents)}</strong> would hit target margin instead.
              </p>
            ) : (
              <p className="mt-2 rounded-xl bg-mint p-3 text-sm text-mint-ink">Your minimum already meets your target margin.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Set a "typical small job" true cost on the Settings tab to audit your minimum project price. This is a
            number you designate yourself — not an average of every saved project, which a couple of large jobs
            would silently skew.
          </p>
        )}
      </Card>
    </div>
  );
}
