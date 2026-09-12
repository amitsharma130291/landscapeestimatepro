import { useId, useMemo, useState } from "react";
import { Printer, Plus, Trash2 } from "lucide-react";
import { formatCurrency, percentToFraction } from "../../lib/calc";
import { addCents, multiplyCentsByQuantity, multiplyCentsByRate, sumCents, ZERO_CENTS, type MoneyCents } from "../../lib/money";
import { validateQuantity, validateTaxRatePercent } from "../../lib/validation";
import { Button, Card, DraftNumberInput, Field, MoneyInput, PrintableTextField, TextInput } from "../ui/primitives";

interface LineItem {
  id: string;
  description: string;
  quantity: number | "";
  unitPriceCents: MoneyCents | "";
}

/** Exact line total, in cents, from a possibly-in-progress line item —
 * cleared/blank quantity or unit price contribute 0 rather than NaN. Uses
 * Decimal.js under the hood (via `multiplyCentsByQuantity`) so a fractional
 * quantity never introduces floating-point drift.
 *
 * A unit price can individually be a safe, representable amount and still
 * overflow once multiplied by quantity — `multiplyCentsByQuantity` throws in
 * that case. With `MoneyInput`'s `liveUpdate` (see `ui/primitives.tsx`) this
 * island commits a price the instant each keystroke parses to a valid
 * amount, so an extreme value typed digit-by-digit can transiently reach
 * this multiplication before the user finishes typing. Treat that as "not
 * computable yet" rather than crashing the calculator — it self-corrects
 * the moment the amount lands back in a representable range. */
function lineTotalCents(line: LineItem): MoneyCents {
  const quantity = line.quantity === "" ? 0 : line.quantity;
  const unitPriceCents = line.unitPriceCents === "" ? ZERO_CENTS : line.unitPriceCents;
  try {
    return multiplyCentsByQuantity(unitPriceCents, quantity);
  } catch {
    return ZERO_CENTS;
  }
}

export default function InvoiceBuilderIsland() {
  const idPrefix = useId();
  const [businessName, setBusinessName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("1001");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxPercent, setTaxPercent] = useState<number | "">(0);
  const [notes, setNotes] = useState("Thank you for your business. Payment due within 15 days.");
  const [lines, setLines] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: "Mulch installation — 8 yd³", quantity: 1, unitPriceCents: 76000 as MoneyCents },
    { id: crypto.randomUUID(), description: "Shrub planting — 18 each", quantity: 1, unitPriceCents: 117000 as MoneyCents },
  ]);

  const subtotalCents = useMemo(() => {
    try {
      return sumCents(lines.map(lineTotalCents));
    } catch {
      return ZERO_CENTS;
    }
  }, [lines]);
  const taxAmountCents = useMemo(() => {
    try {
      return multiplyCentsByRate(subtotalCents, percentToFraction(taxPercent === "" ? 0 : taxPercent));
    } catch {
      return ZERO_CENTS;
    }
  }, [subtotalCents, taxPercent]);
  const totalCents = useMemo(() => {
    try {
      return addCents(subtotalCents, taxAmountCents);
    } catch {
      return ZERO_CENTS;
    }
  }, [subtotalCents, taxAmountCents]);

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.id !== id) : prev));
  }

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="text-lg font-bold text-ink">Business</h2>
          <div className="mt-4 space-y-4">
            <Field label="Business name" htmlFor={`${idPrefix}-business`}>
              <PrintableTextField id={`${idPrefix}-business`} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Greenscape Landscaping" />
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-ink">Customer</h2>
          <div className="mt-4 space-y-4">
            <Field label="Customer name" htmlFor={`${idPrefix}-customer`}>
              <PrintableTextField id={`${idPrefix}-customer`} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Smith Residence" />
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-ink">Invoice details</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Invoice #" htmlFor={`${idPrefix}-number`}>
              <TextInput id={`${idPrefix}-number`} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </Field>
            <Field label="Date" htmlFor={`${idPrefix}-date`}>
              <TextInput id={`${idPrefix}-date`} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
          <h2 className="text-lg font-bold text-ink">Services</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLines((prev) => [...prev, { id: crypto.randomUUID(), description: "", quantity: 1, unitPriceCents: ZERO_CENTS }])}
          >
            <Plus size={16} aria-hidden="true" /> Add line
          </Button>
        </div>

        <div className="mt-4 table-scroll">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3 sm:px-6">Description</th>
                <th scope="col" className="px-3 py-3">Qty</th>
                <th scope="col" className="px-3 py-3">Price</th>
                <th scope="col" className="px-3 py-3 text-right">Subtotal</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                return (
                  <tr key={line.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-2.5 sm:px-6 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-desc-${index}`}>Description, line {index + 1}</label>
                      <PrintableTextField id={`${idPrefix}-desc-${index}`} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-qty-${index}`}>Quantity, line {index + 1}</label>
                      <DraftNumberInput
                        id={`${idPrefix}-qty-${index}`}
                        value={line.quantity}
                        onValueChange={(v) => updateLine(line.id, { quantity: v })}
                        validate={validateQuantity}
                        className="w-20 text-left"
                        liveUpdate
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-price-${index}`}>Price, line {index + 1}</label>
                      <MoneyInput
                        id={`${idPrefix}-price-${index}`}
                        valueCents={line.unitPriceCents}
                        onValueCentsChange={(v) => updateLine(line.id, { unitPriceCents: v })}
                        className="w-28"
                        liveUpdate
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{formatCurrency(lineTotalCents(line), { cents: true })}</td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => removeLine(line.id)} className="tap-target no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove line ${index + 1}`}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 border-t border-border p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <label htmlFor={`${idPrefix}-notes`} className="mb-1.5 block text-sm font-semibold text-ink">Notes</label>
            <textarea
              id={`${idPrefix}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="no-print block w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-surface"
            />
            {notes && <p aria-hidden="true" className="hidden whitespace-pre-wrap break-words text-sm print:block">{notes}</p>}
          </div>
          <div className="space-y-2 text-right">
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span className="font-semibold text-ink">{formatCurrency(subtotalCents, { cents: true })}</span>
            </div>
            <div className="flex items-center justify-end gap-2 text-sm text-muted">
              <label htmlFor={`${idPrefix}-tax`}>Tax</label>
              <DraftNumberInput
                id={`${idPrefix}-tax`}
                value={taxPercent}
                onValueChange={setTaxPercent}
                validate={validateTaxRatePercent}
                className="w-20 text-right"
                liveUpdate
              />
              <span>%</span>
              <span className="w-24 font-semibold text-ink">{formatCurrency(taxAmountCents, { cents: true })}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-base">
              <span className="font-bold text-ink">Total</span>
              <span className="text-2xl font-extrabold tabular-nums text-ink">{formatCurrency(totalCents, { cents: true })}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="no-print mt-6 flex justify-end">
        <Button type="button" onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" /> Print / Save as PDF
        </Button>
      </div>
    </div>
  );
}
