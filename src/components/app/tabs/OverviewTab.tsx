import { useMemo } from "react";
import { calculateAssemblyCost, evaluateRateHealth } from "../../../lib/estimateMath";
import { useWorkspace } from "../../../lib/workspaceContext";
import { Card, StatTile } from "../../ui/primitives";
import GettingStartedSection from "../GettingStartedSection";

export default function OverviewTab() {
  const { workspace } = useWorkspace();
  const { materials, equipment, assemblies, projects, business } = workspace;

  const rateHealthCounts = useMemo(() => {
    const counts = { healthy: 0, attention: 0, critical: 0, invalid: 0 };
    for (const assembly of assemblies) {
      const cost = calculateAssemblyCost(assembly, materials, equipment, business.loadedLaborRateCents, business.overheadPercent);
      const health = evaluateRateHealth(cost.trueCostPerUnitCents, assembly.currentRateCents ?? 0, business.targetMarginPercent);
      counts[health.status] += 1;
    }
    return counts;
  }, [assemblies, materials, equipment, business]);

  return (
    <div className="space-y-6">
      <GettingStartedSection workspace={workspace} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><StatTile label="Materials" value={materials.length} /></Card>
        <Card><StatTile label="Equipment" value={equipment.length} /></Card>
        <Card><StatTile label="Service assemblies" value={assemblies.length} /></Card>
        <Card><StatTile label="Saved estimates" value={projects.length} /></Card>
      </div>

      <Card>
        <h2 className="text-lg font-bold text-ink">Price book health</h2>
        <p className="mt-1 text-sm text-muted">Based on your saved services and current target margin ({business.targetMarginPercent}%).</p>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-extrabold text-mint-ink">{rateHealthCounts.healthy}</p>
            <p className="text-xs text-muted">Healthy</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-amber">{rateHealthCounts.attention}</p>
            <p className="text-xs text-muted">Below target</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-red">{rateHealthCounts.critical}</p>
            <p className="text-xs text-muted">Critical</p>
          </div>
        </div>
        <a href="/app/rate-health/" className="mt-4 inline-block text-sm font-semibold text-forest hover:underline">
          Open Service Rate Health →
        </a>
      </Card>
    </div>
  );
}
