import { useId, useMemo, useState } from "react";
import { Printer, Plus, Trash2 } from "lucide-react";
import { formatCurrency, safe } from "../../lib/calc";
import { Button, Card, Field, NumberInput, TextInput } from "../ui/primitives";

interface LineItem {
  id: string;
  description: string;
  quantity: number | "";
  unitPrice: number | "";
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
    { id: crypto.randomUUID(), description: "Mulch installation — 8 yd³", quantity: 1, unitPrice: 760 },
    { id: crypto.randomUUID(), description: "Shrub planting — 18 each", quantity: 1, unitPrice: 1170 },
  ]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + safe(line.quantity === "" ? 0 : line.quantity) * safe(line.unitPrice === "" ? 0 : line.unitPrice), 0),
    [lines]
  );
  const taxAmount = subtotal * (safe(taxPercent === "" ? 0 : taxPercent) / 100);
  const total = subtotal + taxAmount;

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
              <TextInput id={`${idPrefix}-business`} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Greenscape Landscaping" />
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-ink">Customer</h2>
          <div className="mt-4 space-y-4">
            <Field label="Customer name" htmlFor={`${idPrefix}-customer`}>
              <TextInput id={`${idPrefix}-customer`} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Smith Residence" />
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
            onClick={() => setLines((prev) => [...prev, { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 }])}
          >
            <Plus size={16} aria-hidden="true" /> Add line
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
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
                const lineTotal = safe(line.quantity === "" ? 0 : line.quantity) * safe(line.unitPrice === "" ? 0 : line.unitPrice);
                return (
                  <tr key={line.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-2.5 sm:px-6">
                      <label className="sr-only" htmlFor={`${idPrefix}-desc-${index}`}>Description, line {index + 1}</label>
                      <TextInput id={`${idPrefix}-desc-${index}`} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} />
                    </td>
                    <td className="px-3 py-2.5">
                      <label className="sr-only" htmlFor={`${idPrefix}-qty-${index}`}>Quantity, line {index + 1}</label>
                      <NumberInput id={`${idPrefix}-qty-${index}`} value={line.quantity} onValueChange={(v) => updateLine(line.id, { quantity: v })} className="w-20 text-left" />
                    </td>
                    <td className="px-3 py-2.5">
                      <label className="sr-only" htmlFor={`${idPrefix}-price-${index}`}>Price, line {index + 1}</label>
                      <NumberInput id={`${idPrefix}-price-${index}`} value={line.unitPrice} onValueChange={(v) => updateLine(line.id, { unitPrice: v })} className="w-28" />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{formatCurrency(lineTotal, { cents: true })}</td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => removeLine(line.id)} className="no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove line ${index + 1}`}>
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
              className="block w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-surface"
            />
          </div>
          <div className="space-y-2 text-right">
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span className="font-semibold text-ink">{formatCurrency(subtotal, { cents: true })}</span>
            </div>
            <div className="flex items-center justify-end gap-2 text-sm text-muted">
              <label htmlFor={`${idPrefix}-tax`}>Tax</label>
              <NumberInput id={`${idPrefix}-tax`} value={taxPercent} onValueChange={setTaxPercent} className="w-20 text-right" />
              <span>%</span>
              <span className="w-24 font-semibold text-ink">{formatCurrency(taxAmount, { cents: true })}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-base">
              <span className="font-bold text-ink">Total</span>
              <span className="text-2xl font-extrabold tabular-nums text-ink">{formatCurrency(total, { cents: true })}</span>
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
