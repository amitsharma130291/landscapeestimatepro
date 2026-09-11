import { formatCurrency } from "../../lib/calc";
import type { MoneyCents } from "../../lib/money";

export interface FreeDocumentLine {
  key: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPriceCents?: MoneyCents;
  amountCents: MoneyCents;
}

/**
 * The allowlisted, print-ready shape of a free-tool customer document
 * (Estimate/Quote template) — every field here is customer-facing by
 * design; there is no internal cost/margin concept in these free tools to
 * begin with, so this model's job is purely to be the ONE thing that ever
 * prints, never the surrounding marketing page.
 */
export interface FreeCustomerDocument {
  docLabel: string;
  businessName: string;
  customerName: string;
  projectName: string;
  dateLabel: string;
  notes?: string;
  /** false in "summary" mode (Free Quote Template only) — shows just the
   * total, no line-item breakdown at all. */
  showBreakdown: boolean;
  lines: FreeDocumentLine[];
  totalCents: MoneyCents;
}

/**
 * The free-tool customer document — a dedicated, allowlisted print root
 * (LEP-041). This component receives ONLY already-safe, already-computed
 * customer-facing fields, never the host page's marketing chrome (header,
 * breadcrumb, hero copy, trust badges, "More free tools", FAQs, footer,
 * Pro CTAs) or the live editing controls — those are excluded structurally
 * (this component doesn't render them) AND visually (global.css's
 * `body.printing-free-document` rule hides everything on the page except
 * this element's own subtree, regardless of what future marketing content
 * gets added around it).
 */
export default function FreeCustomerDocumentView({ doc }: { doc: FreeCustomerDocument }) {
  return (
    <div id="customer-document-print-root" className="mx-auto max-w-2xl bg-white p-10 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-6 print:break-inside-avoid">
        <div className="min-w-0">
          <p className="break-words text-lg font-extrabold text-ink">{doc.businessName || "Your Business Name"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">{doc.docLabel}</p>
          <p className="mt-1 text-sm text-muted">{doc.dateLabel}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Customer</p>
          <p className="mt-1 break-words font-semibold text-ink">{doc.customerName || "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Project</p>
          <p className="mt-1 break-words font-semibold text-ink">{doc.projectName || "—"}</p>
        </div>
      </div>

      {doc.showBreakdown && (
        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Services</p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {doc.lines.map((line) => (
              <li key={line.key} className="flex items-start justify-between gap-3 px-4 py-3 text-sm print:break-inside-avoid">
                <span className="min-w-0 break-words font-medium text-ink">
                  {line.description || "Untitled service"}
                  {line.quantity !== undefined && line.unit !== undefined && (
                    <span className="ml-2 font-normal text-muted">
                      {line.quantity} {line.unit}
                      {line.unitPriceCents !== undefined && <> @ {formatCurrency(line.unitPriceCents, { cents: true })}</>}
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

      <div className="mt-8 flex items-center justify-between rounded-xl bg-forest px-5 py-4 text-white print:break-inside-avoid">
        <span className="text-sm font-bold uppercase tracking-wider text-lime">Total</span>
        <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(doc.totalCents, { cents: true })}</span>
      </div>

      <p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted print:break-inside-avoid">
        Thank you for considering {doc.businessName || "us"} for your project.
      </p>
    </div>
  );
}
