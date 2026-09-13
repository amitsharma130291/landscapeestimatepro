import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { resolvePendingCheckout } from "../lib/license";

/**
 * Mounted on the estimating-software page — Dodo's checkout return_url.
 * On mount, resolves a just-completed checkout (see resolvePendingCheckout()
 * in src/lib/license.ts). A normal page visit has no pending checkout to
 * resolve and this renders nothing. A successful payment redirects straight
 * into the unlocked app; a failed one shows this banner above the fold
 * instead of silently doing nothing.
 */
export default function CheckoutResultBanner() {
  const [state, setState] = useState<"idle" | "checking" | "redirecting" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setState("checking");
      const result = await resolvePendingCheckout();
      if (cancelled) return;
      if (!result) {
        setState("idle");
        return;
      }
      if (result.ok) {
        setState("redirecting");
        window.location.href = `/app/?license=${encodeURIComponent(result.licenseKey)}`;
        return;
      }
      setState("failed");
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "idle") return null;

  if (state === "checking" || state === "redirecting") {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-paper-dim px-4 py-3 text-sm font-semibold text-ink sm:px-6 lg:px-8">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        {state === "checking" ? "Confirming your payment…" : "Payment confirmed — taking you to the app…"}
      </div>
    );
  }

  return (
    <div role="alert" className="flex items-start gap-3 border-b border-red/30 bg-red/10 px-4 py-4 text-sm text-ink sm:px-6 lg:px-8">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red" aria-hidden="true" />
      <div>
        <p className="font-bold text-red">Payment didn't go through</p>
        <p className="mt-1 text-muted">
          Your card wasn't charged (or the charge didn't complete). No license was issued. You can try again below, or{" "}
          <a href="/contact/" className="font-semibold text-forest underline">
            contact us
          </a>{" "}
          if you think this is a mistake.
        </p>
      </div>
    </div>
  );
}
