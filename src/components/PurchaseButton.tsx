import { Clock } from "lucide-react";
import { SALES_CONFIG } from "../data/salesConfig";
import { PRICE_DISPLAY } from "../data/site";

/**
 * Purchasing is not active — this app has no backend, no payment provider,
 * and no entitlement system (a deliberate product decision, not a gap to
 * patch over). This component's whole job is to say that honestly: no fake
 * checkout, no pretending a click unlocks anything, no claim that access is
 * "protected." When SALES_CONFIG.salesEnabled ever flips true with a real
 * checkoutUrl, this becomes a real link and nothing else about this file
 * needs to change.
 */
export default function PurchaseButton({ label, variant = "dark" }: { label?: string; variant?: "dark" | "light" }) {
  if (SALES_CONFIG.salesEnabled && SALES_CONFIG.checkoutUrl) {
    return (
      <a
        href={SALES_CONFIG.checkoutUrl}
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-lime px-7 py-4 text-base font-bold text-lime-ink transition-colors hover:bg-[#d9ff5e]"
      >
        {label ?? `Get Landscape Estimate Pro — ${PRICE_DISPLAY} Lifetime`}
      </a>
    );
  }

  const disabledClasses =
    variant === "dark" ? "bg-white/15 text-white/70 border border-white/20" : "bg-paper-dim text-muted border border-border";
  const captionClass = variant === "dark" ? "text-white/60" : "text-muted";

  return (
    <div>
      <button type="button" disabled aria-disabled="true" className={`inline-flex min-h-[52px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl px-7 py-4 text-base font-bold ${disabledClasses}`}>
        <Clock size={18} aria-hidden="true" />
        Purchasing not yet open
      </button>
      <p className={`mt-2 text-sm ${captionClass}`}>
        Pro is planned at {PRICE_DISPLAY} lifetime. Use the free tools below in the meantime — the same estimating math runs
        under all of them.
      </p>
    </div>
  );
}
