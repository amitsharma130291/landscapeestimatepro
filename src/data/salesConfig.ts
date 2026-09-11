/**
 * Single source of truth for pricing/purchase state — every page, CTA,
 * structured-data block, and legal-copy string that mentions price or
 * "buy" reads from this, so there is exactly one place to flip when real
 * purchasing is ready. This app has no backend and no payment provider
 * wired up (a deliberate architectural decision, not a temporary gap) —
 * `salesEnabled: false` reflects that honestly rather than presenting a
 * checkout that doesn't exist.
 */
export const SALES_CONFIG = {
  /** The intended future one-time price, in cents. $99. */
  plannedLifetimePriceCents: 9900,
  /** Flip to true only once a real checkout is actually wired up somewhere.
   * Every "Buy"/"Get Pro" surface in the app must check this before ever
   * claiming a purchase can be completed. */
  salesEnabled: false,
  /** Where a real purchase action should send the customer, once one
   * exists. null while salesEnabled is false — nothing in this codebase
   * should ever construct a fake checkout destination on its own. */
  checkoutUrl: null as string | null,
} as const;

/**
 * The one place every page decides whether it may include a JSON-LD `offers`
 * block at all. While `salesEnabled` is false there is no purchasable — and
 * no *preorderable* — offer: nothing here lets a customer commit to buying
 * or reserve a purchase, so schema.org's `PreOrder` availability would be
 * just as false a claim as `InStock`. The correct representation of "no
 * active offer" is no `offers` property at all, per schema.org's own
 * Product/SoftwareApplication conventions (`offers` is optional). Returns
 * `undefined` in that case — spread it in with `...(offer && {offers: offer})`,
 * never assign it directly, so a page can't accidentally emit
 * `"offers": undefined`. Once `salesEnabled` is true (with a real
 * `checkoutUrl`), this returns the real InStock offer.
 */
export function buildOfferSchema(url?: string): { "@type": "Offer"; price: string; priceCurrency: string; availability: string; url?: string } | undefined {
  if (!SALES_CONFIG.salesEnabled || !SALES_CONFIG.checkoutUrl) return undefined;
  return {
    "@type": "Offer",
    price: String(SALES_CONFIG.plannedLifetimePriceCents / 100),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    ...(url ? { url } : {}),
  };
}

/**
 * What this deployment IS, independent of pricing. `/app` cannot be
 * protected client-side in this static, no-backend architecture (there is
 * no server to check a credential against) — so rather than imply access is
 * restricted, this names the deployment's real state honestly:
 *
 * - "development": the developer's own local/preview build. No badge shown.
 * - "free-beta": a PUBLIC build where anyone who finds /app can use it,
 *   labeled as such so nobody mistakes an open beta for a purchased,
 *   access-controlled product.
 *
 * "paid-launch" is deliberately NOT a value this app can be set to — it
 * would require a real distribution/access strategy (which this
 * architecture explicitly does not have) to be anything but a false claim.
 * Adding that value back is a product decision for whoever builds that
 * strategy, not a config flip.
 */
export type AppReleaseMode = "development" | "free-beta";

export const APP_RELEASE_MODE: AppReleaseMode = "free-beta";
