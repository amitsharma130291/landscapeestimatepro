import { Plus } from "lucide-react";
import { useWorkspace } from "../../lib/workspaceContext";

/**
 * Global "New Estimate" shortcut in the app header — the product's primary
 * call-to-action, reachable from every tab so a contractor never has to
 * detour through the Estimates list just to start pricing the next job.
 * Creates a blank draft project (identical defaults to EstimatesTab's own
 * "New estimate" button, minus the optional starting-template step) and
 * lands directly in its editor via ?open=<id>, which EstimatesTab reads on
 * mount — a plain full-page navigation, matching how every other tab link
 * in this app already works (there's no client-side router between tabs).
 */
export default function NewEstimateButton() {
  const { workspace, addProject } = useWorkspace();
  const { business } = workspace;

  function handleClick() {
    const created = addProject({
      name: "New Project",
      status: "draft",
      serviceLines: [],
      equipmentLines: [],
      laborLines: [],
      deliveryCostCents: business.defaultDeliveryCostCents,
      extraCosts: [],
      overheadPercent: business.overheadPercent,
      targetMarginPercent: business.targetMarginPercent,
      taxRatePercent: business.taxRatePercent,
      quoteRevisions: [],
    });
    window.location.href = `/app/estimates/?open=${created.id}`;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="tap-target inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-xl bg-lime px-3 text-sm font-bold text-lime-ink transition-colors hover:bg-[#d9ff5e] sm:px-4"
    >
      <Plus size={16} aria-hidden="true" />
      <span className="hidden sm:inline">New Estimate</span>
    </button>
  );
}
