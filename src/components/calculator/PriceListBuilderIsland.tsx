import { useId, useState } from "react";
import { Printer, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, MoneyInput, TextInput } from "../ui/primitives";
import { formatCurrency } from "../../lib/calc";
import { ZERO_CENTS, type MoneyCents } from "../../lib/money";

interface PriceRow {
  id: string;
  service: string;
  rateCents: MoneyCents | "";
  unit: string;
}

export default function PriceListBuilderIsland() {
  const idPrefix = useId();
  const [businessName, setBusinessName] = useState("");
  const [minimumProjectCents, setMinimumProjectCents] = useState<MoneyCents | "">(50000 as MoneyCents);
  const [rows, setRows] = useState<PriceRow[]>([
    { id: crypto.randomUUID(), service: "Mulch installation", rateCents: 9500 as MoneyCents, unit: "yd³" },
    { id: crypto.randomUUID(), service: "Topsoil installation", rateCents: 8500 as MoneyCents, unit: "yd³" },
    { id: crypto.randomUUID(), service: "Edging", rateCents: 225 as MoneyCents, unit: "linear ft" },
    { id: crypto.randomUUID(), service: "Shrub installation", rateCents: 6500 as MoneyCents, unit: "each" },
  ]);

  function updateRow(id: string, patch: Partial<PriceRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }

  return (
    <div>
      <Card>
        <Field label="Business name" htmlFor={`${idPrefix}-business`}>
          <TextInput id={`${idPrefix}-business`} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Greenscape Landscaping" className="max-w-sm" />
        </Field>
      </Card>

      <Card className="mt-6" padded={false}>
        <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
          <h2 className="text-lg font-bold text-ink">Price book</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((prev) => [...prev, { id: crypto.randomUUID(), service: "", rateCents: ZERO_CENTS, unit: "each" }])}>
            <Plus size={16} aria-hidden="true" /> Add service
          </Button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3 sm:px-6">Service</th>
                <th scope="col" className="px-3 py-3">Rate</th>
                <th scope="col" className="px-3 py-3">Unit</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-2.5 sm:px-6 align-top">
                    <label className="sr-only" htmlFor={`${idPrefix}-service-${index}`}>Service name, row {index + 1}</label>
                    <TextInput id={`${idPrefix}-service-${index}`} value={row.service} onChange={(e) => updateRow(row.id, { service: e.target.value })} />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <label className="sr-only" htmlFor={`${idPrefix}-rate-${index}`}>Rate, row {index + 1}</label>
                    <MoneyInput id={`${idPrefix}-rate-${index}`} valueCents={row.rateCents} onValueCentsChange={(v) => updateRow(row.id, { rateCents: v })} className="w-28" />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <label className="sr-only" htmlFor={`${idPrefix}-unit-${index}`}>Unit, row {index + 1}</label>
                    <TextInput id={`${idPrefix}-unit-${index}`} value={row.unit} onChange={(e) => updateRow(row.id, { unit: e.target.value })} className="w-28" />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <button type="button" onClick={() => removeRow(row.id)} className="no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${row.service || "row"}`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border p-5 sm:p-6">
          <Field label="Minimum project price" htmlFor={`${idPrefix}-minimum`} hint="The lowest price you'll quote for any job, regardless of size">
            <div className="max-w-[10rem]">
              <MoneyInput id={`${idPrefix}-minimum`} valueCents={minimumProjectCents} onValueCentsChange={setMinimumProjectCents} />
            </div>
          </Field>
        </div>
      </Card>

      <div className="mt-6 rounded-2xl border border-lime-surface bg-mint p-5 sm:p-6">
        <p className="font-bold text-mint-ink">Are these prices actually profitable?</p>
        <p className="mt-1.5 text-sm text-mint-ink/80">
          A price list only tells you what you charge — not what you actually make. Landscape Estimate Pro's Service
          Rate Health checks every rate above against your real cost and target margin, and flags anything priced
          below {formatCurrency(minimumProjectCents === "" ? ZERO_CENTS : minimumProjectCents)} minimum or below target.
        </p>
        <a href="/pricing/" className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-forest px-5 text-sm font-bold text-white hover:bg-forest-light">
          See Service Rate Health in Pro
        </a>
      </div>

      <div className="no-print mt-6 flex justify-end">
        <Button type="button" onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" /> Print price list
        </Button>
      </div>
    </div>
  );
}
