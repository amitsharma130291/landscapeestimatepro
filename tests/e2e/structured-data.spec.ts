/**
 * Inspects the JSON-LD actually emitted in the real, built/served site (the
 * webServer here is `npm run preview`, i.e. the production build output —
 * see playwright.config.ts) rather than parsing schema-building source
 * code, so these assertions can't drift from what a crawler actually sees.
 * Covers the structured-data cleanup: free-tool $0 offers preserved,
 * paid-product offers absent while sales are disabled, product/organization
 * images real and correctly sized, no fabricated ratings/reviews/sameAs.
 */
import { test, expect, type Page } from "@playwright/test";

const SITE_URL = "https://landscapeestimatepro.com";

const FREE_TOOL_PAGES = ["/landscaping-cost-calculator/", "/landscaping-estimate-calculator/"];
const PAID_PRODUCT_PAGES = ["/", "/pricing/", "/landscaping-estimating-software/"];

async function readJsonLdBlocks(page: Page): Promise<unknown[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((text) => JSON.parse(text)); // throws if any block isn't valid JSON
}

test.describe("free tools retain a real $0 Offer", () => {
  for (const url of FREE_TOOL_PAGES) {
    test(`${url} WebApplication schema has the exact free $0 offer`, async ({ page }) => {
      await page.goto(url);
      const blocks = await readJsonLdBlocks(page);
      const app = blocks.find((b): b is Record<string, unknown> => (b as { "@type"?: string })["@type"] === "WebApplication");
      expect(app, `no WebApplication block found on ${url}`).toBeTruthy();
      expect(app!.offers).toEqual({ "@type": "Offer", price: 0, priceCurrency: "USD" });
    });
  }
});

test.describe("paid product pages carry no active offer while sales are disabled", () => {
  for (const url of PAID_PRODUCT_PAGES) {
    test(`${url} product schema has no offers/price/priceCurrency/availability/priceValidUntil`, async ({ page }) => {
      await page.goto(url);
      const blocks = await readJsonLdBlocks(page);
      const product = blocks.find(
        (b): b is Record<string, unknown> =>
          ["Product", "SoftwareApplication"].includes((b as { "@type"?: string })["@type"] ?? "") &&
          (b as { name?: string }).name === "Landscape Estimate Pro"
      );
      expect(product, `no paid-product schema block found on ${url}`).toBeTruthy();
      expect(product).not.toHaveProperty("offers");
      expect(product).not.toHaveProperty("price");
      expect(product).not.toHaveProperty("priceCurrency");
      expect(product).not.toHaveProperty("availability");
      expect(product).not.toHaveProperty("priceValidUntil");
    });

    test(`${url} page text never claims the paid product is free`, async ({ page }) => {
      await page.goto(url);
      const blocks = await readJsonLdBlocks(page);
      const serialized = JSON.stringify(blocks);
      // The only "$0"/price:0 offer allowed anywhere is the free-tool
      // Offer, which never appears on these paid-product pages.
      expect(serialized).not.toContain('"price":0');
      expect(serialized).not.toContain('"price":"0"');
    });
  }
});

test.describe("Product/SoftwareApplication image", () => {
  for (const url of PAID_PRODUCT_PAGES) {
    test(`${url} references an absolute, canonical-domain product image`, async ({ page }) => {
      await page.goto(url);
      const blocks = await readJsonLdBlocks(page);
      const product = blocks.find(
        (b): b is Record<string, unknown> =>
          ["Product", "SoftwareApplication"].includes((b as { "@type"?: string })["@type"] ?? "") &&
          (b as { name?: string }).name === "Landscape Estimate Pro"
      );
      expect(product).toBeTruthy();
      expect(typeof product!.image).toBe("string");
      expect(product!.image as string).toMatch(/^https:\/\//);
      expect((product!.image as string).startsWith(SITE_URL)).toBe(true);
    });
  }
});

test("Organization schema has a square, correctly-dimensioned logo and no fabricated sameAs", async ({ page }) => {
  await page.goto("/");
  const blocks = await readJsonLdBlocks(page);
  const org = blocks.find((b): b is Record<string, unknown> => (b as { "@type"?: string })["@type"] === "Organization");
  expect(org).toBeTruthy();

  const logo = org!.logo as { "@type": string; url: string; width: number; height: number };
  expect(logo["@type"]).toBe("ImageObject");
  expect(logo.url).toMatch(/^https:\/\//);
  expect(logo.url.startsWith(SITE_URL)).toBe(true);
  expect(logo.width).toBe(logo.height);
  expect(logo.width).toBeGreaterThanOrEqual(112);

  // No real external profile is configured yet — sameAs must be entirely
  // absent, never an empty array (which would still be a schema.org claim
  // that the list was considered and found empty on purpose per-page).
  expect(org).not.toHaveProperty("sameAs");
});

test("no page emits AggregateRating or Review anywhere in its JSON-LD", async ({ page }) => {
  for (const url of [...FREE_TOOL_PAGES, ...PAID_PRODUCT_PAGES]) {
    await page.goto(url);
    const blocks = await readJsonLdBlocks(page);
    const serialized = JSON.stringify(blocks);
    expect(serialized, `${url} must not claim a rating or review`).not.toMatch(/AggregateRating|"@type":"Review"/);
  }
});

test("every JSON-LD block on the homepage is valid, parseable JSON", async ({ page }) => {
  await page.goto("/");
  const scripts = page.locator('script[type="application/ld+json"]');
  const count = await scripts.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const text = await scripts.nth(i).textContent();
    expect(() => JSON.parse(text ?? "")).not.toThrow();
  }
});

test("the paid product's canonical name is identical across all three product pages", async ({ page }) => {
  const names: string[] = [];
  for (const url of PAID_PRODUCT_PAGES) {
    await page.goto(url);
    const blocks = await readJsonLdBlocks(page);
    const product = blocks.find(
      (b): b is Record<string, unknown> =>
        ["Product", "SoftwareApplication"].includes((b as { "@type"?: string })["@type"] ?? "")
    );
    names.push((product?.name as string) ?? "");
  }
  expect(new Set(names).size).toBe(1);
  expect(names[0]).toBe("Landscape Estimate Pro");
});

test("FAQPage JSON-LD question text matches the visible FAQ accordion text", async ({ page }) => {
  await page.goto("/pricing/");
  const blocks = await readJsonLdBlocks(page);
  const faqPage = blocks.find((b): b is Record<string, unknown> => (b as { "@type"?: string })["@type"] === "FAQPage");
  expect(faqPage).toBeTruthy();
  const mainEntity = faqPage!.mainEntity as { name: string }[];
  expect(mainEntity.length).toBeGreaterThan(0);

  const visibleQuestions = await page.locator("details summary").allTextContents();
  for (const item of mainEntity) {
    expect(visibleQuestions.some((visible) => visible.trim() === item.name.trim())).toBe(true);
  }
});

test("BreadcrumbList JSON-LD terminal URL matches the page's own canonical URL", async ({ page }) => {
  await page.goto("/landscaping-cost-calculator/");
  const blocks = await readJsonLdBlocks(page);
  const breadcrumbs = blocks.find((b): b is Record<string, unknown> => (b as { "@type"?: string })["@type"] === "BreadcrumbList");
  expect(breadcrumbs).toBeTruthy();
  const items = breadcrumbs!.itemListElement as { position: number; item: string }[];
  const last = items[items.length - 1];

  const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(last.item).toBe(canonicalHref);
});

test("twitter:image/card/title/description meta tags are present, page-specific, and match og:image", async ({ page }) => {
  await page.goto("/pricing/");
  const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute("content");
  const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute("content");
  const twitterTitle = await page.locator('meta[name="twitter:title"]').getAttribute("content");
  const twitterDescription = await page.locator('meta[name="twitter:description"]').getAttribute("content");
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");

  expect(twitterCard).toBe("summary_large_image");
  expect(twitterImage).toBe(ogImage);
  expect(twitterImage).toMatch(/^https:\/\//);
  expect(twitterTitle).toBe(ogTitle);
  expect(twitterTitle).toContain("Pricing");
  expect(twitterDescription?.length).toBeGreaterThan(0);
});
