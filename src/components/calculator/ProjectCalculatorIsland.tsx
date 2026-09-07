import { useId, useMemo, useState } from "react";
import { calculateProjectCost, calculateQuotePricing, formatCurrency, formatPercent } from "../../lib/calc";
import { Card, Field, NumberInput } from "../ui/primitives";

interface FieldState {
  materials: number | "";
  labor: number | "";
  equipment: number | "";
  delivery: number | "";
  other: number | "";
  overheadPercent: number | "";
  targetMarginPercent: number | "";
}

const DEFAULTS: FieldState = {
  materials: 1250,
  labor: 768,
  equipment: 180,
  delivery: 180,
  other: 100,
  overheadPercent: 15,
  targetMarginPercent: 35,
};

function n(value: number | ""): number {
  return value === "" ? 0 : value;
}

export default function ProjectCalculatorIsland({ compact = false }: { compact?: boolean }) {
  const [fields, setFields] = useState<FieldState>(DEFAULTS);
  const idPrefix = useId();

  const cost = useMemo(
    () =>
      calculateProjectCost({
        materialsCost: n(fields.materials),
        laborCost: n(fields.labor),
        equipmentCost: n(fields.equipment),
        deliveryCost: n(fields.delivery),
        otherCost: n(fields.other),
        overheadPercent: n(fields.overheadPercent),
      }),
    [fields]
  );

  const pricing = useMemo(
    () => calculateQuotePricing(cost.trueCost, n(fields.targetMarginPercent), "dollar"),
    [cost.trueCost, fields.targetMarginPercent]
  );

  function setField<K extends keyof FieldState>(key: K, value: number | "") {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className={`grid gap-6 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_23rem]"}`}>
      <Card>
        <h2 className="text-lg font-bold text-ink">Project costs</h2>
        <p className="mt-1 text-sm text-muted">Enter what this project actually costs your business.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Materials" htmlFor={`${idPrefix}-materials`}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-materials`}
                value={fields.materials}
                onValueChange={(v) => setField("materials", v)}
                className="pl-7"
                aria-describedby={`${idPrefix}-materials-hint`}
              />
            </div>
          </Field>

          <Field label="Loaded labor" htmlFor={`${idPrefix}-labor`} hint="Crew wages, taxes, and benefits — total for this job">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-labor`}
                value={fields.labor}
                onValueChange={(v) => setField("labor", v)}
                className="pl-7"
              />
            </div>
          </Field>

          <Field label="Equipment" htmlFor={`${idPrefix}-equipment`}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-equipment`}
                value={fields.equipment}
                onValueChange={(v) => setField("equipment", v)}
                className="pl-7"
              />
            </div>
          </Field>

          <Field label="Delivery" htmlFor={`${idPrefix}-delivery`}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-delivery`}
                value={fields.delivery}
                onValueChange={(v) => setField("delivery", v)}
                className="pl-7"
              />
            </div>
          </Field>

          <Field label="Other costs" htmlFor={`${idPrefix}-other`} hint="Permits, disposal, subcontractors, etc.">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-other`}
                value={fields.other}
                onValueChange={(v) => setField("other", v)}
                className="pl-7"
              />
            </div>
          </Field>

          <Field label="Overhead" htmlFor={`${idPrefix}-overhead`} hint="Trucks, insurance, admin — as % of direct cost">
            <div className="relative">
              <NumberInput
                id={`${idPrefix}-overhead`}
                value={fields.overheadPercent}
                onValueChange={(v) => setField("overheadPercent", v)}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
        </div>

        <div className="mt-4 max-w-xs">
          <Field label="Target margin" htmlFor={`${idPrefix}-margin`} hint="The profit share of your selling price — not markup on cost">
            <div className="relative">
              <NumberInput
                id={`${idPrefix}-margin`}
                value={fields.targetMarginPercent}
                onValueChange={(v) => setField("targetMarginPercent", v)}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
        </div>
      </Card>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card tone="dark" padded={false}>
          <div className="p-5 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-lime">Your results</h2>
            <div aria-live="polite" className="mt-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-white/70">Direct cost</span>
                <span className="font-semibold tabular-nums">{formatCurrency(cost.directCost)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-white/70">Overhead allocation</span>
                <span className="font-semibold tabular-nums">{formatCurrency(cost.overheadAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-white/70">True project cost</span>
                <span className="font-bold tabular-nums">{formatCurrency(pricing.trueCostRounded)}</span>
              </div>

              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Required selling price</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums text-lime">
                  {formatCurrency(pricing.requiredSellingPrice, { cents: true })}
                </p>
                <p className="mt-1 text-xs text-white/60">Display price: {formatCurrency(pricing.displayPrice)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Gross profit</p>
                  <p className="mt-1 font-bold tabular-nums">{formatCurrency(pricing.expectedGrossProfit)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Effective margin</p>
                  <p className="mt-1 font-bold tabular-nums">{formatPercent(pricing.effectiveMargin)}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
        <p className="mt-3 text-xs text-muted">
          Margin = profit ÷ price. That's different from markup (profit ÷ cost) — see the{" "}
          <a href="/landscape-pricing-guide/#markup-vs-margin" className="font-semibold text-forest underline">
            markup vs. margin guide
          </a>
          .
        </p>
      </div>
    </div>
  );
}
