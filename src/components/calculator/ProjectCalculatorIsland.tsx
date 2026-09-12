import { RotateCcw } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { calculateExactPricingChainCents, formatCurrency, formatPercent } from "../../lib/calc";
import { ZERO_CENTS, type MoneyCents } from "../../lib/money";
import { validateOverheadPercent, validateTargetMarginPercent } from "../../lib/validation";
import { Button, Card, DraftNumberInput, Field, MoneyInput } from "../ui/primitives";

interface FieldState {
  materials: MoneyCents | "";
  labor: MoneyCents | "";
  equipment: MoneyCents | "";
  delivery: MoneyCents | "";
  other: MoneyCents | "";
  overheadPercent: number | "";
  targetMarginPercent: number | "";
}

const DEFAULTS: FieldState = {
  materials: 125000 as MoneyCents,
  labor: 76800 as MoneyCents,
  equipment: 18000 as MoneyCents,
  delivery: 18000 as MoneyCents,
  other: 10000 as MoneyCents,
  overheadPercent: 15,
  targetMarginPercent: 35,
};

function n(value: number | ""): number {
  return value === "" ? 0 : value;
}

function c(value: MoneyCents | ""): MoneyCents {
  return value === "" ? ZERO_CENTS : value;
}

export default function ProjectCalculatorIsland({ compact = false }: { compact?: boolean }) {
  const [fields, setFields] = useState<FieldState>(DEFAULTS);
  const idPrefix = useId();

  // A cost field can individually be a safe, representable amount and still
  // overflow once summed/divided through the pricing chain (e.g. dividing a
  // huge true cost by a thin margin remainder). With `MoneyInput`'s
  // `liveUpdate` (see `ui/primitives.tsx`) this island commits each field
  // the instant a keystroke parses to a valid amount, so an extreme value
  // typed digit-by-digit can transiently reach this calculation before the
  // user finishes typing. Rather than crash, hold the last successfully
  // computed result — it self-corrects the moment every field is back in a
  // representable range.
  const lastGoodPricingRef = useRef<ReturnType<typeof calculateExactPricingChainCents> | null>(null);
  const pricing = useMemo(() => {
    try {
      const result = calculateExactPricingChainCents(
        {
          materialsCostCents: c(fields.materials),
          laborCostCents: c(fields.labor),
          equipmentCostCents: c(fields.equipment),
          deliveryCostCents: c(fields.delivery),
          otherCostCents: c(fields.other),
          overheadPercent: n(fields.overheadPercent),
        },
        n(fields.targetMarginPercent),
        100
      );
      lastGoodPricingRef.current = result;
      return result;
    } catch {
      return lastGoodPricingRef.current ?? calculateExactPricingChainCents({ materialsCostCents: ZERO_CENTS, laborCostCents: ZERO_CENTS, equipmentCostCents: ZERO_CENTS, deliveryCostCents: ZERO_CENTS, otherCostCents: ZERO_CENTS, overheadPercent: 0 }, 0, 100);
    }
  }, [fields]);

  function setField<K extends keyof FieldState>(key: K, value: FieldState[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // Only worth confirming when there's actually something to lose — a form
  // still sitting at the untouched sample defaults has nothing "substantial"
  // for a confirmation to protect. Same policy on both calculators, since
  // they share this one component.
  const isDirty = JSON.stringify(fields) !== JSON.stringify(DEFAULTS);

  function handleReset() {
    if (isDirty && !window.confirm("Reset this calculator to its starting values? Anything you've entered will be lost.")) {
      return;
    }
    setFields(DEFAULTS);
  }

  // min-w-0 on both grid children is load-bearing (see EstimatesTab's
  // identical grid for the full explanation) — a CSS grid item's default
  // min-width:auto can leak nested content's min-content size past this
  // grid into the page's own scrollable width on narrow viewports.
  return (
    <div className={`grid gap-6 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_23rem]"}`}>
      <Card className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Project costs</h2>
            <p className="mt-1 text-sm text-muted">Enter what this project actually costs your business.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleReset} aria-label="Reset calculator to starting values">
            <RotateCcw size={16} aria-hidden="true" /> Reset
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Materials" htmlFor={`${idPrefix}-materials`}>
            <MoneyInput
              id={`${idPrefix}-materials`}
              valueCents={fields.materials}
              onValueCentsChange={(v) => setField("materials", v)}
              aria-describedby={`${idPrefix}-materials-hint`}
              liveUpdate
            />
          </Field>

          <Field label="Loaded labor" htmlFor={`${idPrefix}-labor`} hint="Crew wages, taxes, and benefits — total for this job">
            <MoneyInput
              id={`${idPrefix}-labor`}
              valueCents={fields.labor}
              onValueCentsChange={(v) => setField("labor", v)}
              liveUpdate
            />
          </Field>

          <Field label="Equipment" htmlFor={`${idPrefix}-equipment`}>
            <MoneyInput
              id={`${idPrefix}-equipment`}
              valueCents={fields.equipment}
              onValueCentsChange={(v) => setField("equipment", v)}
              liveUpdate
            />
          </Field>

          <Field label="Delivery" htmlFor={`${idPrefix}-delivery`}>
            <MoneyInput
              id={`${idPrefix}-delivery`}
              valueCents={fields.delivery}
              onValueCentsChange={(v) => setField("delivery", v)}
              liveUpdate
            />
          </Field>

          <Field label="Other costs" htmlFor={`${idPrefix}-other`} hint="Permits, disposal, subcontractors, etc.">
            <MoneyInput
              id={`${idPrefix}-other`}
              valueCents={fields.other}
              onValueCentsChange={(v) => setField("other", v)}
              liveUpdate
            />
          </Field>

          <Field label="Overhead" htmlFor={`${idPrefix}-overhead`} hint="Trucks, insurance, admin — as % of direct cost">
            <div className="relative">
              <DraftNumberInput
                id={`${idPrefix}-overhead`}
                value={fields.overheadPercent}
                onValueChange={(v) => setField("overheadPercent", v)}
                validate={validateOverheadPercent}
                className="pr-9"
                liveUpdate
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
        </div>

        <div className="mt-4 max-w-xs">
          <Field label="Target margin" htmlFor={`${idPrefix}-margin`} hint="The profit share of your selling price — not markup on cost">
            <div className="relative">
              <DraftNumberInput
                id={`${idPrefix}-margin`}
                value={fields.targetMarginPercent}
                onValueChange={(v) => setField("targetMarginPercent", v)}
                validate={validateTargetMarginPercent}
                className="pr-9"
                liveUpdate
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
        </div>
      </Card>

      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <Card tone="dark" padded={false}>
          <div className="p-5 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-lime">Your results</h2>
            <div aria-live="polite" className="mt-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-white/70">Direct cost</span>
                <span className="font-semibold tabular-nums">{formatCurrency(pricing.directCostCents)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-white/70">Overhead allocation</span>
                <span className="font-semibold tabular-nums">{formatCurrency(pricing.overheadAmountCents)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-white/70">True project cost</span>
                <span className="font-bold tabular-nums">{formatCurrency(pricing.trueCostCents)}</span>
              </div>

              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Required selling price</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums text-lime">
                  {formatCurrency(pricing.exactRequiredPriceCents, { cents: true })}
                </p>
                <p className="mt-1 text-xs text-white/60">Display price: {formatCurrency(pricing.roundedRecommendedPriceCents)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Gross profit</p>
                  <p className="mt-1 font-bold tabular-nums">{formatCurrency(pricing.expectedGrossProfitCents)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Achieved margin</p>
                  <p className="mt-1 font-bold tabular-nums">{formatPercent(pricing.achievedMargin)}</p>
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
