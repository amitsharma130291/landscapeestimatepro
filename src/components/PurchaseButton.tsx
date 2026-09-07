import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/primitives";
import { track } from "../lib/analytics";
import { PRICE_DISPLAY } from "../data/site";

/**
 * TODO: wire this button to the real Dodo Payments checkout link once this
 * product's Dodo product/checkout URL exists (see the Dodo Payments
 * integration used by this author's other sites). Until PUBLIC_DODO_CHECKOUT_URL
 * is set, this renders as an honest placeholder — it never collects payment
 * details and never claims a purchase has completed.
 */
export default function PurchaseButton({
  checkoutUrl,
  label,
}: {
  checkoutUrl?: string;
  label?: string;
}) {
  const [clicked, setClicked] = useState(false);
  const buttonLabel = label ?? `Get Landscape Estimate Pro — ${PRICE_DISPLAY} Lifetime`;

  if (checkoutUrl) {
    return (
      <a
        href={checkoutUrl}
        data-track="checkout_started"
        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-lime px-7 py-4 text-base font-bold text-lime-ink transition-colors hover:bg-[#d9ff5e]"
      >
        {buttonLabel}
        <ArrowRight size={18} aria-hidden="true" />
      </a>
    );
  }

  function handleClick() {
    track("checkout_started", { price: 99 });
    setClicked(true);
  }

  return (
    <div>
      <Button size="lg" onClick={handleClick} aria-describedby={clicked ? "checkout-not-connected" : undefined}>
        {buttonLabel}
        <ArrowRight size={18} aria-hidden="true" />
      </Button>
      {clicked && (
        <p id="checkout-not-connected" role="status" className="mt-2 text-sm text-muted">
          Checkout isn't connected yet. This is a placeholder — no payment has been taken.
        </p>
      )}
    </div>
  );
}
