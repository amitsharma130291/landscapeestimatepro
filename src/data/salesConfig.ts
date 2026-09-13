/**
 * Single source of truth for pricing/purchase state — every page, CTA,
 * structured-data block, and legal-copy string that mentions price or
 * "buy" reads from this, so there is exactly one place to flip if that
 * ever needs to change again. Checkout is real: PurchaseButton.tsx starts
 * a Dodo Payments checkout session (api/checkout-create.ts) rather than
 * linking to a static URL, so there is no `checkoutUrl` field here to
 * configure — `salesEnabled` alone is the switch.
 */
export const SALES_CONFIG = {
  /** The one-time price, in cents. $99. */
  plannedLifetimePriceCents: 9900,
  /** Whether a real purchase can actually be completed right now. Every
   * "Buy"/"Get Pro" surface in the app must check this before ever
   * claiming a purchase can be completed — flip back to false if Dodo
   * checkout ever needs to be taken offline temporarily. */
  salesEnabled: true,
  /** An optional, REAL price-expiration date for the lifetime price, as a
   * valid future ISO `YYYY-MM-DD` string — or `null` when the price has
   * no scheduled expiration (the ordinary case for a "lifetime" price; a
   * permanent price has nothing to set here). Only ever surfaces in
   * structured data via `buildOfferSchema()`, and only when it is a
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
 * `"offers": undefined`.
 */
export function buildOfferSchema(
  url?: string
): { "@type": "Offer"; price: string; priceCurrency: string; availability: string; url?: string; priceValidUntil?: string } | undefined {
  if (!SALES_CONFIG.salesEnabled) return undefined;
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
 * What this deployment IS, independent of pricing:
 *
 * - "development": the developer's own local/preview build. No badge shown.
 * - "licensed": the real, deployed product — /app is gated behind a valid
 *   Dodo Payments-issued license key (see src/components/app/LicenseGate.tsx),
 *   checked once per session and re-verifiable against Dodo's API forever
 *   via a self-verifying key (LEP-PRO-<payment id>), never a database.
 *
 * "free-beta" (an earlier, honestly-labeled state where /app had no access
 * control at all) is retired now that real checkout and licensing exist —
 * keeping that value around once it no longer describes reality would be
 * exactly the kind of false claim this type exists to prevent.
 */
export type AppReleaseMode = "development" | "licensed";

export const APP_RELEASE_MODE: AppReleaseMode = "licensed";
