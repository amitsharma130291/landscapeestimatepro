import { formatCurrency, formatUnitLabel } from "../../lib/calc";
import { ZERO_CENTS, type MoneyCents } from "../../lib/money";
import type { Assembly, BusinessSettings, Project } from "../../lib/types";

/**
 * The customer-facing document — deliberately shows only what a customer
 * should see (business identity, services, total). No cost, overhead, or
 * margin data ever renders here, regardless of what's passed in.
 *
 * Every line item below (services, delivery, ad-hoc labor, other costs) is
 * shown by DESCRIPTION ONLY, never by its underlying cost/rate figure — the
 * app doesn't compute a customer-facing price for an individual line (the
 * quoted price is a single bundled figure derived from total true cost +
 * margin), so showing a line's raw cost input (a material/labor/equipment
 * cost, a loaded labor rate, an "other cost" dollar amount) would leak
 * exactly the internal cost basis this document must never expose. Only the
 * aggregate subtotal/tax/total — already-computed, post-margin,
 * customer-facing figures — carry a dollar amount.
 */
export default function CustomerEstimateView({
  business,
  project,
  assemblies,
  displayPriceCents,
  taxAmountCents = ZERO_CENTS,
  customerTotalCents = displayPriceCents,
}: {
  business: BusinessSettings;
  project: Project;
  assemblies: Assembly[];
  displayPriceCents: MoneyCents;
  taxAmountCents?: MoneyCents;
  customerTotalCents?: MoneyCents;
}) {
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  const today = new Date(project.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div id="customer-estimate-print-root" className="mx-auto max-w-2xl bg-white p-10 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-6 print:break-inside-avoid">
        <div className="flex min-w-0 items-center gap-3">
          {business.businessLogoDataUrl && (
            <img src={business.businessLogoDataUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-contain" />
          )}
          <div className="min-w-0">
            <p className="break-words text-lg font-extrabold text-ink">{business.businessName || "Your Business Name"}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Project Estimate</p>
          <p className="mt-1 text-sm text-muted">{today}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Customer</p>
          <p className="mt-1 break-words font-semibold text-ink">{project.customerName || "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Project</p>
          <p className="mt-1 break-words font-semibold text-ink">{project.name}</p>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Services</p>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {project.serviceLines.map((line) => {
            const assembly = assemblyById.get(line.assemblyId);
            if (!assembly) return null;
            return (
              <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm print:break-inside-avoid">
                <span className="min-w-0 break-words font-medium text-ink">{assembly.name}</span>
                <span className="shrink-0 whitespace-nowrap text-muted">
                  {line.quantity} {formatUnitLabel(assembly.unit)}
                </span>
              </li>
            );
          })}
          {project.laborLines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm print:break-inside-avoid">
              <span className="min-w-0 break-words font-medium text-ink">{line.label}</span>
            </li>
          ))}
          {project.extraCosts.map((extra) => (
            <li key={extra.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm print:break-inside-avoid">
              <span className="min-w-0 break-words font-medium text-ink">{extra.label}</span>
            </li>
          ))}
          {project.deliveryCostCents > 0 && (
            <li className="flex items-start justify-between gap-3 px-4 py-3 text-sm print:break-inside-avoid">
              <span className="min-w-0 break-words font-medium text-ink">Delivery</span>
            </li>
          )}
          {project.serviceLines.length === 0 &&
            project.laborLines.length === 0 &&
            project.extraCosts.length === 0 &&
            project.deliveryCostCents <= 0 && <li className="px-4 py-3 text-sm text-muted">No services added yet.</li>}
        </ul>
      </div>

      {project.notes && (
        <div className="mt-6 print:break-inside-avoid">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Notes</p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-muted">{project.notes}</p>
        </div>
      )}

      {taxAmountCents > 0 && (
        <div className="mt-6 space-y-1.5 text-sm print:break-inside-avoid">
          <div className="flex items-center justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold text-ink">{formatCurrency(displayPriceCents, { cents: true })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Sales tax</span>
            <span className="font-semibold text-ink">{formatCurrency(taxAmountCents, { cents: true })}</span>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between rounded-xl bg-forest px-5 py-4 text-white print:break-inside-avoid">
        <span className="text-sm font-bold uppercase tracking-wider text-lime">Total</span>
        <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(customerTotalCents, { cents: true })}</span>
      </div>
    </div>
  );
}
