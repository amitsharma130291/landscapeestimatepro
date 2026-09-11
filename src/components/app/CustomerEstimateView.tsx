import { formatCurrency } from "../../lib/calc";
import type { CustomerDocument } from "../../lib/customerDocument";

/**
 * The customer-facing document — a pure renderer over an already-allowlisted
 * `CustomerDocument` (built by customerDocument.ts). This component never
 * receives a `Project`, `Assembly`, or `BusinessSettings` object, so there is
 * no internal cost/overhead/margin data anywhere in its props for a CSS rule
 * to merely hide — the privacy boundary is structural, not visual.
 */
export default function CustomerEstimateView({ doc }: { doc: CustomerDocument }) {
  return (
    <div id="customer-estimate-print-root" className="mx-auto max-w-2xl bg-white p-10 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-6 print:break-inside-avoid">
        <div className="flex min-w-0 items-center gap-3">
          {doc.businessLogoDataUrl && (
            <img src={doc.businessLogoDataUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-contain" />
          )}
          <div className="min-w-0">
            <p className="break-words text-lg font-extrabold text-ink">{doc.businessName}</p>
            {doc.businessAddressLines.map((line, i) => (
              <p key={i} className="break-words text-xs text-muted">{line}</p>
            ))}
            {(doc.businessPhone || doc.businessEmail || doc.businessWebsite) && (
              <p className="break-words text-xs text-muted">{[doc.businessPhone, doc.businessEmail, doc.businessWebsite].filter(Boolean).join(" · ")}</p>
            )}
            {doc.businessLicenseNumber && <p className="break-words text-xs text-muted">License #{doc.businessLicenseNumber}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Project Estimate</p>
          <p className="mt-1 text-sm text-muted">{doc.dateLabel}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Customer</p>
          <p className="mt-1 break-words font-semibold text-ink">{doc.customerName}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Project</p>
          <p className="mt-1 break-words font-semibold text-ink">{doc.projectName}</p>
        </div>
      </div>

      {doc.mode !== "project-total" && (
        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Services</p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {doc.lines.map((line) => (
              <li key={line.key} className="flex items-start justify-between gap-3 px-4 py-3 text-sm print:break-inside-avoid">
                <span className="min-w-0 break-words font-medium text-ink">
                  {line.label}
                  {line.quantity !== undefined && line.unit !== undefined && (
                    <span className="ml-2 font-normal text-muted">
                      {line.quantity} {line.unit}
                      {line.rateCents !== undefined && <> @ {formatCurrency(line.rateCents, { cents: true })}</>}
                    </span>
                  )}
                </span>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-ink">{formatCurrency(line.amountCents, { cents: true })}</span>
              </li>
            ))}
            {doc.lines.length === 0 && <li className="px-4 py-3 text-sm text-muted">No services added yet.</li>}
          </ul>
        </div>
      )}

      {doc.notes && (
        <div className="mt-6 print:break-inside-avoid">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Notes</p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-muted">{doc.notes}</p>
        </div>
      )}

      {doc.taxAmountCents > 0 && (
        <div className="mt-6 space-y-1.5 text-sm print:break-inside-avoid">
          <div className="flex items-center justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold text-ink">{formatCurrency(doc.subtotalCents, { cents: true })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Sales tax</span>
            <span className="font-semibold text-ink">{formatCurrency(doc.taxAmountCents, { cents: true })}</span>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between rounded-xl bg-forest px-5 py-4 text-white print:break-inside-avoid">
        <span className="text-sm font-bold uppercase tracking-wider text-lime">Total</span>
        <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(doc.totalCents, { cents: true })}</span>
      </div>
    </div>
  );
}
