import { useId, useState } from "react";
import Decimal from "decimal.js";
import { validateCalculatorInput } from "../../lib/expansionCalculators";
import { useDialog } from "../ui/Dialog";

const DEFAULT_LINES = [{ name: "Mulch installation", quantity: "8", unit: "cubic yards", cost: "75" }, { name: "Shrub planting", quantity: "18", unit: "plants", cost: "40" }];
const DEFAULT_SETTINGS = { delivery: "150", other: "0", overhead: "15", margin: "35" };

export default function ServiceEstimateCalculator() {
  const id = useId();
  const [lines, setLines] = useState(DEFAULT_LINES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const { confirm, dialog } = useDialog();
  async function reset() {
    const dirty = JSON.stringify(lines) !== JSON.stringify(DEFAULT_LINES) || JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);
    if (dirty && !await confirm("Reset this worksheet to its example values? Your current entries will be lost.", { confirmLabel: "Reset" })) return;
    setLines(DEFAULT_LINES);
    setSettings(DEFAULT_SETTINGS);
  }
  const labels = { delivery: "Delivery ($)", other: "Other project costs ($)", overhead: "Overhead (%)", margin: "Target margin (%)" };
  const error = (value: string, max?: number) => validateCalculatorInput({ key: "value", label: "Value", value, max }, value);
  const valid = lines.every(l => !error(l.quantity) && !error(l.cost)) && Object.entries(settings).every(([key, value]) => !error(value, key === "margin" ? 99.9 : undefined));
  const direct = valid ? lines.reduce((s, l) => s.plus(new Decimal(l.quantity.trim()).times(l.cost.trim())), new Decimal(settings.delivery.trim()).plus(settings.other.trim())) : new Decimal(0);
  const trueCost = direct.times(new Decimal(valid ? settings.overhead.trim() : 0).div(100).plus(1));
  const requiredPrice = valid ? trueCost.div(new Decimal(1).minus(new Decimal(settings.margin.trim()).div(100))).toDecimalPlaces(2, Decimal.ROUND_CEIL).toFixed(2) : "";
  const control = "min-h-[44px] w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2 focus:ring-2 focus:ring-forest";
  return <section className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-label="Multi-service estimate worksheet">
    {dialog}
    <h2 className="text-xl font-bold">Build the estimate by service</h2>
    <button type="button" className="min-h-[44px] px-3 font-semibold underline" onClick={reset} aria-label="Reset calculator to starting values">Reset example</button>
    <p className="mt-2 text-sm text-muted">Enter a direct cost per service unit, including its materials, labor, and equipment. These are your costs, not customer selling rates. Add shared project expenses once below.</p>
    <div className="mt-6 space-y-4">{lines.map((line, index) => <fieldset key={index} className="rounded-xl border border-border p-4"><legend className="px-2 font-bold">Service {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(["name", "quantity", "unit", "cost"] as const).map(key => {
      const numeric = key === "quantity" || key === "cost";
      const message = numeric ? error(line[key]) : undefined;
      return <div key={key}><label htmlFor={`${id}-${index}-${key}`} className="mb-2 block text-sm font-semibold">{{ name: "Service description", quantity: "Quantity", unit: "Unit", cost: "Direct cost per unit ($)" }[key]}</label><input className={control} id={`${id}-${index}-${key}`} value={line[key]} inputMode={numeric ? "decimal" : "text"} aria-invalid={!!message} aria-describedby={message ? `${id}-${index}-${key}-error` : undefined} onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, [key]: e.target.value } : l))} />{message && <p className="text-sm text-red" id={`${id}-${index}-${key}-error`}>{message}</p>}</div>;
    })}</div><button type="button" className="mt-3 min-h-[44px] px-3 font-semibold underline disabled:opacity-40" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}>Remove service {index + 1}</button></fieldset>)}</div>
    <button type="button" className="my-4 min-h-[44px] rounded-lg bg-forest px-5 font-bold text-white" onClick={() => setLines([...lines, { name: "", quantity: "1", unit: "each", cost: "0" }])}>Add service</button>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(settings) as (keyof typeof settings)[]).map(key => { const message = error(settings[key], key === "margin" ? 99.9 : undefined); return <div key={key}><label className="mb-2 block text-sm font-semibold" htmlFor={`${id}-${key}`}>{labels[key]}</label><input className={control} id={`${id}-${key}`} inputMode="decimal" value={settings[key]} aria-invalid={!!message} aria-describedby={message ? `${id}-${key}-error` : undefined} onChange={e => setSettings({ ...settings, [key]: e.target.value })} />{message && <p id={`${id}-${key}-error`} className="text-sm text-red">{message}</p>}</div>; })}</div>
    <div aria-live="polite" className="mt-6 rounded-xl bg-forest p-5 text-white">{valid ? <dl className="grid gap-4 sm:grid-cols-3"><div><dt>Direct project cost</dt><dd className="text-2xl font-bold">${direct.toFixed(2)}</dd></div><div><dt>True project cost</dt><dd className="text-2xl font-bold">${trueCost.toFixed(2)}</dd></div><div><dt>Required pre-tax price</dt><dd className="text-2xl font-bold text-lime">${requiredPrice}</dd></div></dl> : <p>Correct the highlighted inputs to see your estimate.</p>}</div>
    <p className="mt-3 text-sm text-muted">Free worksheet: entries are not saved. Displayed costs round to cents; the required price uses unrounded cost and rounds up to the next cent.</p>
  </section>;
}
