import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { evaluateCrewSizeScenarios } from "../../lib/estimateMath";
import { formatCurrency } from "../../lib/calc";
import { validateEfficiencyPercent } from "../../lib/validation";
import type { MoneyCents } from "../../lib/money";
import { DraftNumberInput } from "../ui/primitives";
import { HelpTooltip } from "../ui/HelpTooltip";

const CREW_SIZES = [2, 3, 4];

/**
 * "Would sending more people actually finish this faster, and what would it
 * cost me?" — a pure what-if comparison for one ad-hoc crew-labor line,
 * never mutating the line itself. Deliberately never assumes doubling the
 * crew halves the time: each crew size carries its own editable efficiency
 * percent (100% = perfectly linear), defaulting to 100% but adjustable to
 * model real coordination overhead (or a genuine efficiency gain) — see
 * evaluateCrewSizeScenarios()'s own doc comment for the underlying math.
 */
export default function CrewSizeScenarioPanel({ baselinePersonHours, loadedRateCents, label }: { baselinePersonHours: number; loadedRateCents: MoneyCents; label: string }) {
  const idPrefix = useId();
  const [expanded, setExpanded] = useState(false);
  const [efficiencyByCrewSize, setEfficiencyByCrewSize] = useState<Record<number, number | "">>({ 2: 100, 3: 100, 4: 100 });

  const scenarios = evaluateCrewSizeScenarios(
    baselinePersonHours,
    loadedRateCents,
    CREW_SIZES.map((crewSize) => ({ crewSize, efficiencyPercent: efficiencyByCrewSize[crewSize] === "" ? 0 : (efficiencyByCrewSize[crewSize] ?? 100) }))
  );

  const panelId = `${idPrefix}-crew-scenario-panel`;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="tap-target inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline"
      >
        Compare crew sizes
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {expanded && (
        <div id={panelId} className="mt-2 rounded-lg border border-border bg-paper p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            Same scope of work ({baselinePersonHours.toFixed(1)} person-hours for "{label || "this line"}") at a different crew size — never assumes doubling the crew halves the time.
            <HelpTooltip label="Crew size comparison">
              Each crew size has its own editable efficiency — 100% means perfectly linear (the same total person-hours and cost, split across more people, so only the elapsed time changes). Lower it to model real coordination overhead on a bigger crew; raise it only if you genuinely believe that crew size works better than linear.
            </HelpTooltip>
          </p>
          <div className="mt-2 table-scroll">
            <table className="w-full min-w-[380px] border-collapse text-xs">
              <thead>
                <tr className="border-y border-border text-left font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="py-2 pr-2">Crew size</th>
                  <th scope="col" className="py-2 pr-2">Efficiency</th>
                  <th scope="col" className="py-2 pr-2">Elapsed time</th>
                  <th scope="col" className="py-2 text-right">Total labor cost</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.crewSize} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-2 font-semibold text-ink">{s.crewSize} people</td>
                    <td className="py-2 pr-2">
                      <label className="sr-only" htmlFor={`${idPrefix}-efficiency-${s.crewSize}`}>
                        Efficiency, {s.crewSize}-person crew
                      </label>
                      <div className="flex items-center gap-1">
                        <DraftNumberInput
                          id={`${idPrefix}-efficiency-${s.crewSize}`}
                          value={efficiencyByCrewSize[s.crewSize] ?? 100}
                          onValueChange={(v) => setEfficiencyByCrewSize((prev) => ({ ...prev, [s.crewSize]: v }))}
                          validate={validateEfficiencyPercent}
                          className="w-16"
                        />
                        <span className="text-muted">%</span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 tabular-nums text-ink">{s.elapsedHours.toFixed(1)} hrs</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-ink">{formatCurrency(s.totalLaborCostCents, { cents: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
