import { useId, useState } from "react";
import { calculateExpansion, calculatorFields, validateCalculatorInput, type CalculatorKind } from "../../lib/expansionCalculators";

export default function ExpansionCalculator({ kind }: { kind: CalculatorKind }) {
  const fields = calculatorFields[kind];
  const defaults = Object.fromEntries(fields.map(f => [f.key, f.value]));
  const [values, setValues] = useState(defaults);
  const id = useId();
  const errors = Object.fromEntries(fields.map(f => [f.key, validateCalculatorInput(f, values[f.key])]));
  const valid = !Object.values(errors).some(Boolean);
  const results = valid ? calculateExpansion(kind, values) : [];
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]" data-calculator={kind}>
    <div className="min-w-0 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Enter your numbers</h2><button type="button" className="min-h-[44px] rounded-lg border border-border px-4 font-semibold" onClick={() => setValues(defaults)}>Reset example</button></div>
      <p className="mt-2 text-sm text-muted">Sample values demonstrate the calculation; replace them with your own costs. USD. Entries stay in this page and are not saved.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {fields.map(f => <div key={f.key}>
          <label className="mb-2 block text-sm font-semibold" htmlFor={`${id}-${f.key}`}>{f.label}</label>
          <input id={`${id}-${f.key}`} type="text" inputMode="decimal" value={values[f.key]} aria-invalid={!!errors[f.key]} aria-describedby={`${id}-${f.key}-help`} className="min-h-[44px] w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-forest" onChange={e => setValues({ ...values, [f.key]: e.target.value })} />
          <p id={`${id}-${f.key}-help`} className={`mt-1 text-xs ${errors[f.key] ? "text-red" : "text-muted"}`}>{errors[f.key] || f.hint}</p>
        </div>)}
      </div>
    </div>
    <section aria-label="Calculator results" aria-live="polite" aria-atomic="true" className="min-w-0 rounded-2xl bg-forest p-6 text-white">
      <h2 className="text-xl font-bold">Your results</h2>
      {!valid ? <p className="mt-4">Correct the highlighted inputs to calculate. No result is shown while an input is invalid.</p> : <dl className="mt-4 space-y-4">{results.map(r => <div key={r.label} className="border-b border-white/20 pb-3"><dt className="text-sm text-white/80">{r.label}</dt><dd className="mt-1 break-words text-xl font-bold text-lime">{r.value}</dd></div>)}</dl>}
      <p className="mt-4 text-sm text-white/80">Required prices round up to the next cent. Sales tax is excluded. {kind === "mulch" ? "Contractor pricing uses the bulk option; bagged cost excludes delivery." : kind === "topsoil" ? "Contractor pricing uses the cubic-yard quote; the ton quote is a separate comparison." : "Profit reflects only the costs you enter."}</p>
    </section>
  </div>;
}
