/**
 * Centralized structured-data building blocks that are NOT about the paid
 * product's sale state (see salesConfig.ts for that) — the free-tool
 * Offer, the canonical product/organization images, and the organization's
 * verified external profiles. One home for these so no page hand-rolls its
 * own copy that could drift from the real assets on disk.
 */
import { SITE_URL } from "./site";

/**
 * Genuinely free, no-cost tools (the Cost Calculator and Estimate
 * Calculator) get a real `$0` Offer in their WebApplication schema — this
 * is an accurate statement, not a placeholder, and Google's
 * SoftwareApplication guidance explicitly permits a zero-price Offer for a
 * free app. Deliberately INDEPENDENT of `SALES_CONFIG.salesEnabled`: a
 * separate, genuinely free tool's price has nothing to do with whether the
 * PAID Pro product is currently purchasable. Never call this for the paid
 * product's own schema — see salesConfig.ts's `buildOfferSchema` for that,
 * which instead omits `offers` entirely while sales are disabled.
 */
export function buildFreeToolOfferSchema(): { "@type": "Offer"; price: number; priceCurrency: string } {
  return { "@type": "Offer", price: 0, priceCurrency: "USD" };
}

/**
 * The absolute, canonical URL of the image used to represent Landscape
 * Estimate Pro in Product/SoftwareApplication JSON-LD — the same branded
 * logo lockup already used as the site's Open Graph image (public/og-
 * default.png, 1200x630, real brand artwork, not a placeholder). Built
 * from SITE_URL so it always resolves to the production domain regardless
 * of where this is imported from.
 */
export const PRODUCT_IMAGE_URL = new URL("/og-default.png", SITE_URL).toString();

export interface OrganizationLogo {
  "@type": "ImageObject";
  url: string;
  width: number;
  height: number;
}

/**
 * The square brand mark — the same "LS" icon isolated from the full
 * horizontal lockup used in the site header (public/brand/logo-lockup.png)
 * — used for Organization.logo. Google's Organization-logo guidance wants
 * a square image at least 112x112; this asset is a real 512x512 PNG.
 * Structured as an ImageObject (rather than a bare url string) so width/
 * height travel with the reference — see structuredData.test.ts, which
 * asserts the real file on disk actually matches these dimensions.
 */
export const ORGANIZATION_LOGO: OrganizationLogo = {
  "@type": "ImageObject",
  url: new URL("/icon-512.png", SITE_URL).toString(),
  width: 512,
  height: 512,
};

/**
 * Real, public, canonical external profiles owned by Landscape Estimate
 * Pro (e.g. a verified company LinkedIn/X/GitHub page) — included in
 * Organization.sameAs ONLY when this list is non-empty. Empty today: no
 * such profile exists yet. Never add a placeholder URL, a personal profile
 * unrelated to the product, a search-result link, or the site's own URL
 * here — every consumer of this constant must omit `sameAs` entirely
 * (never emit an empty array) when it's empty. See Layout.astro for the
 * spread pattern that enforces this.
 */
export const ORGANIZATION_SAME_AS: string[] = [];
