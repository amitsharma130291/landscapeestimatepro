import { formatCurrency, formatUnitLabel } from "../../lib/calc";
import type { Assembly, BusinessSettings, Project } from "../../lib/types";

/**
 * The customer-facing document — deliberately shows only what a customer
 * should see (business identity, services, total). No cost, overhead, or
 * margin data ever renders here, regardless of what's passed in.
 */
export default function CustomerEstimateView({
  business,
  project,
  assemblies,
  displayPrice,
}: {
  business: BusinessSettings;
  project: Project;
  assemblies: Assembly[];
  displayPrice: number;
}) {
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  const today = new Date(project.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div id="customer-estimate-print-root" className="mx-auto max-w-2xl bg-white p-10 print:p-0">
      <div className="flex items-start justify-between border-b border-border pb-6">
        <div className="flex items-center gap-3">
          {business.businessLogoDataUrl && (
            <img src={business.businessLogoDataUrl} alt="" className="h-14 w-14 rounded-lg object-contain" />
          )}
          <div>
            <p className="text-lg font-extrabold text-ink">{business.businessName || "Your Business Name"}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Project Estimate</p>
          <p className="mt-1 text-sm text-muted">{today}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Customer</p>
          <p className="mt-1 font-semibold text-ink">{project.customerName || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Project</p>
          <p className="mt-1 font-semibold text-ink">{project.name}</p>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Services</p>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {project.serviceLines.map((line) => {
            const assembly = assemblyById.get(line.assemblyId);
            if (!assembly) return null;
            return (
              <li key={line.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium text-ink">{assembly.name}</span>
                <span className="text-muted">
                  {line.quantity} {formatUnitLabel(assembly.unit)}
                </span>
              </li>
            );
          })}
          {project.deliveryCost > 0 && (
            <li className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium text-ink">Delivery</span>
            </li>
          )}
          {project.serviceLines.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No services added yet.</li>
          )}
        </ul>
      </div>

      {project.notes && (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Notes</p>
          <p className="mt-1.5 text-sm text-muted">{project.notes}</p>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between rounded-xl bg-forest px-5 py-4 text-white">
        <span className="text-sm font-bold uppercase tracking-wider text-lime">Total</span>
        <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(displayPrice)}</span>
      </div>
    </div>
  );
}
