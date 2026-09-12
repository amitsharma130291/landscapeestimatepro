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
  /** An optional, REAL price-expiration date for the planned lifetime
   * price, as a valid future ISO `YYYY-MM-DD` string — or `null` when the
   * price has no scheduled expiration (the ordinary case for a "lifetime"
   * price; a permanent price has nothing to set here). Only ever surfaces
   * in structured data via `buildOfferSchema()`, and only when it is a
   * genuinely valid future date AND sales are enabled — see
   * `getValidPriceValidUntil()`. Set this only when a real deadline exists
   * and that SAME deadline is also visibly disclosed on the sales page;
   * never set it merely to make a price look more urgent. */
  priceValidUntil: null as string | null,
} as const;

/**
 * Validates `SALES_CONFIG.priceValidUntil` before it is ever allowed into a
 * structured-data `Offer` — must be present, in strict `YYYY-MM-DD` form,
 * a real calendar date (not one `Date` silently "corrects", e.g.
 * 2026-02-30), and strictly in the future relative to `referenceDate`
 * (defaults to now; overridable so tests are never time-dependent/flaky).
 * A missing, malformed, or past date returns `null` rather than throwing —
 * this represents "no valid expiration to disclose," not an error, since a
 * permanent lifetime price legitimately has none.
 */
export function getValidPriceValidUntil(referenceDate: Date = new Date()): string | null {
  const raw = SALES_CONFIG.priceValidUntil;
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Date's own constructor silently rolls an invalid day/month forward
  // (e.g. 2026-02-30 -> 2026-03-02) instead of rejecting it — comparing the
  // parsed fields back against the input catches that rather than trusting
  // a "corrected" date the config never actually specified.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;

  if (parsed.getTime() <= referenceDate.getTime()) return null;
  return raw;
}

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
export function buildOfferSchema(
  url?: string
): { "@type": "Offer"; price: string; priceCurrency: string; availability: string; url?: string; priceValidUntil?: string } | undefined {
  if (!SALES_CONFIG.salesEnabled || !SALES_CONFIG.checkoutUrl) return undefined;
  const priceValidUntil = getValidPriceValidUntil();
  return {
    "@type": "Offer",
    price: String(SALES_CONFIG.plannedLifetimePriceCents / 100),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    ...(url ? { url } : {}),
    // Omitted entirely for a permanent lifetime price with no scheduled
    // expiration — see getValidPriceValidUntil()'s own doc comment for
    // exactly which conditions must hold before this is ever included.
    ...(priceValidUntil ? { priceValidUntil } : {}),
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
