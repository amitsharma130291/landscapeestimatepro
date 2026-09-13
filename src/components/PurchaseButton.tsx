import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SALES_CONFIG } from "../data/salesConfig";
import { PRICE_DISPLAY } from "../data/site";
import { startCheckout } from "../lib/license";

/**
 * Starts a real Dodo Payments checkout (api/checkout-create.ts) and redirects
 * to Dodo's hosted checkout page. When SALES_CONFIG.salesEnabled is false
 * (checkout taken offline temporarily), falls back to an honest disabled
 * state instead of a dead or fake button.
 */
export default function PurchaseButton({ label, variant = "dark" }: { label?: string; variant?: "dark" | "light" }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  if (SALES_CONFIG.salesEnabled) {
    async function handleClick() {
      if (status === "loading") return;
      setStatus("loading");
      try {
        await startCheckout();
        // startCheckout() redirects the browser on success — execution
        // effectively ends here; status only ever resets on failure below.
      } catch {
        setStatus("error");
      }
    }

    return (
      <div>
        <button
          type="button"
          onClick={handleClick}
          disabled={status === "loading"}
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-lime px-7 py-4 text-base font-bold text-lime-ink transition-colors hover:bg-[#d9ff5e] disabled:cursor-wait disabled:opacity-80"
        >
          {status === "loading" && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {label ?? `Get Landscape Estimate Pro — ${PRICE_DISPLAY} Lifetime`}
        </button>
        {status === "error" && (
          <p role="alert" className={`mt-2 text-sm font-medium ${variant === "dark" ? "text-red-200" : "text-red"}`}>
            Couldn't start checkout. Please try again.
          </p>
        )}
      </div>
    );
  }

  const disabledClasses =
    variant === "dark" ? "bg-white/15 text-white/70 border border-white/20" : "bg-paper-dim text-muted border border-border";
  const captionClass = variant === "dark" ? "text-white/60" : "text-muted";

  return (
    <div>
      <button type="button" disabled aria-disabled="true" className={`inline-flex min-h-[52px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl px-7 py-4 text-base font-bold ${disabledClasses}`}>
        Purchasing temporarily unavailable
      </button>
      <p className={`mt-2 text-sm ${captionClass}`}>
        Pro is {PRICE_DISPLAY} lifetime. Check back shortly, or use the free tools below in the meantime — the same
        estimating math runs under all of them.
      </p>
    </div>
  );
}
