import { useId, useMemo, useState } from "react";
import { Printer, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "../../lib/calc";
import { multiplyCentsByQuantity, sumCents, ZERO_CENTS, type MoneyCents } from "../../lib/money";
import { validateQuantity } from "../../lib/validation";
import { Button, Card, DraftNumberInput, Field, MoneyInput, TextInput } from "../ui/primitives";

interface LineItem {
  id: string;
  description: string;
  quantity: number | "";
  unit: string;
  unitPriceCents: MoneyCents | "";
}

function newLine(): LineItem {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unit: "each", unitPriceCents: ZERO_CENTS };
}

/** Exact line total, in cents, from a possibly-in-progress line item —
 * cleared/blank quantity or unit price contribute 0 rather than NaN. Uses
 * Decimal.js under the hood (via `multiplyCentsByQuantity`) so a fractional
 * quantity (e.g. 2.5 yd³) never introduces floating-point drift. */
function lineTotalCents(line: LineItem): MoneyCents {
  const quantity = line.quantity === "" ? 0 : line.quantity;
  const unitPriceCents = line.unitPriceCents === "" ? ZERO_CENTS : line.unitPriceCents;
  return multiplyCentsByQuantity(unitPriceCents, quantity);
}

export default function EstimateBuilderIsland({ variant = "estimate" }: { variant?: "estimate" | "quote" }) {
  const idPrefix = useId();
  const [businessName, setBusinessName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: "Mulch installation", quantity: 8, unit: "yd³", unitPriceCents: 9500 as MoneyCents },
    { id: crypto.randomUUID(), description: "Shrub planting", quantity: 18, unit: "each", unitPriceCents: 6500 as MoneyCents },
  ]);

  const totalCents = useMemo(() => sumCents(lines.map(lineTotalCents)), [lines]);

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.id !== id) : prev));
  }

  const docLabel = variant === "quote" ? "Quote" : "Estimate";

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-ink">Your business</h2>
          <div className="mt-4 space-y-4">
            <Field label="Business name" htmlFor={`${idPrefix}-business`}>
              <TextInput id={`${idPrefix}-business`} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Greenscape Landscaping" />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-ink">Customer &amp; project</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Customer name" htmlFor={`${idPrefix}-customer`}>
              <TextInput id={`${idPrefix}-customer`} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Smith Residence" />
            </Field>
            <Field label="Project" htmlFor={`${idPrefix}-project`}>
              <TextInput id={`${idPrefix}-project`} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Landscape installation" />
            </Field>
            <Field label={`${docLabel} date`} htmlFor={`${idPrefix}-date`}>
              <TextInput id={`${idPrefix}-date`} type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
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
            onClick={() => setLines((prev) => [...prev, newLine()])}
          >
            <Plus size={16} aria-hidden="true" /> Add line
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3 sm:px-6">Service / item</th>
                <th scope="col" className="px-3 py-3">Qty</th>
                <th scope="col" className="px-3 py-3">Unit</th>
                <th scope="col" className="px-3 py-3">Unit price</th>
                <th scope="col" className="px-3 py-3 text-right">Line total</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                return (
                  <tr key={line.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-2.5 sm:px-6 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-desc-${index}`}>Service description, line {index + 1}</label>
                      <TextInput
                        id={`${idPrefix}-desc-${index}`}
                        value={line.description}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        placeholder="Mulch installation"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-qty-${index}`}>Quantity, line {index + 1}</label>
                      <DraftNumberInput
                        id={`${idPrefix}-qty-${index}`}
                        value={line.quantity}
                        onValueChange={(v) => updateLine(line.id, { quantity: v })}
                        validate={validateQuantity}
                        className="w-24 text-left"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-unit-${index}`}>Unit, line {index + 1}</label>
                      <TextInput
                        id={`${idPrefix}-unit-${index}`}
                        value={line.unit}
                        onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                        className="w-24"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-price-${index}`}>Unit price, line {index + 1}</label>
                      <MoneyInput
                        id={`${idPrefix}-price-${index}`}
                        valueCents={line.unitPriceCents}
                        onValueCentsChange={(v) => updateLine(line.id, { unitPriceCents: v })}
                        className="w-28"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{formatCurrency(lineTotalCents(line), { cents: true })}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
                        aria-label={`Remove line ${index + 1}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border p-5 sm:p-6">
          <div className="max-w-sm">
            <label htmlFor={`${idPrefix}-notes`} className="mb-1.5 block text-sm font-semibold text-ink">Notes</label>
            <textarea
              id={`${idPrefix}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-surface"
              placeholder={variant === "quote" ? "Valid for 30 days. 50% deposit to schedule." : "Optional notes for the customer."}
            />
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Total</p>
            <p className="text-3xl font-extrabold tabular-nums text-ink">{formatCurrency(totalCents, { cents: true })}</p>
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
