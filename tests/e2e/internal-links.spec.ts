/**
 * /landscaping-estimating-software/ is the one page that tells the full,
 * honest sales story and carries the real purchase flow — every "upsell to
 * Pro" surface sitewide should land there, never on the bare, license-gated
 * /app/ (which has no pitch at all for someone who hasn't bought yet) or on
 * a stale/broken anchor. This file locks in the fix: ToolCardGrid.astro's
 * and ToolPageLayout.astro's shared upsell CTAs, and the one page-specific
 * link that had drifted to a dead anchor.
 */
import { test, expect } from "@playwright/test";

// These upsell CTAs are meant for a visitor who hasn't bought Pro yet, so
// this file opts out of the suite's default "already licensed" fixture
// (see playwright.config.ts) — otherwise every "Try Pro free" surface here
// would render as "Go to App" instead (see licensed-go-to-app.spec.ts for
// that behavior's own coverage).
test.use({ storageState: { cookies: [], origins: [] } });

const TOOL_PAGES_WITH_PRO_UPSELL = [
  "/landscaping-cost-calculator/",
  "/landscaping-estimate-calculator/",
  "/landscaping-estimate-template/",
  "/landscaping-invoice-template/",
  "/landscaping-price-list/",
  "/landscaping-quote-template/",
  "/landscape-pricing-guide/",
];

for (const url of TOOL_PAGES_WITH_PRO_UPSELL) {
  test(`${url}: the "More free tools" Pro card and the bottom Pro banner both link to the sales page, never /app/`, async ({ page }) => {
    await page.goto(url);
    const proLinks = page.locator('a[href="/landscaping-estimating-software/"]');
    expect(await proLinks.count(), "expected at least the ToolCardGrid Pro card and the ToolPageLayout banner").toBeGreaterThanOrEqual(2);
    await expect(page.locator('a[href="/app/"]')).toHaveCount(0);
  });
}

test("homepage: the free-tools grid's Pro card links to the sales page, not /app/", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Try Pro free/ }).first()).toHaveAttribute("href", "/landscaping-estimating-software/");
  await expect(page.locator('a[href="/app/"]')).toHaveCount(0);
});

test("resources page: none of the three tool grids (including the Guide grid, which doesn't opt out of the Pro card) link to /app/", async ({ page }) => {
  await page.goto("/resources/");
  await expect(page.locator('a[href="/app/"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Try Pro free/ }).first()).toHaveAttribute("href", "/landscaping-estimating-software/");
});

test("price-list page: the Service Rate Health walkthrough link points at the real anchor on the sales page, not a dead homepage anchor", async ({ page }) => {
  await page.goto("/landscaping-price-list/");
  const links = page.locator('a[href="/landscaping-estimating-software/#service-rate-health"]');
  expect(await links.count(), "expected both the inline copy link and the embedded Rate Health CTA to point here").toBeGreaterThanOrEqual(2);
  await page.goto("/landscaping-estimating-software/");
  await expect(page.locator("#service-rate-health")).toHaveCount(1);
});

test("main nav includes a direct link to the sales page on every page type", async ({ page }) => {
  for (const url of ["/", "/pricing/", "/resources/", ...TOOL_PAGES_WITH_PRO_UPSELL]) {
    await page.goto(url);
    await expect(page.getByRole("link", { name: "Estimating Software" }).first()).toHaveAttribute("href", "/landscaping-estimating-software/");
  }
});

test("footer's Product column links directly to the sales page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Landscaping Estimating Software" })).toHaveAttribute("href", "/landscaping-estimating-software/");
});

test("homepage's example preview card: 'Create customer estimate' points at the sales page, not the free calculator (which can't produce a document)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create customer estimate" })).toHaveAttribute("href", "/landscaping-estimating-software/");
});

test("homepage's 'See How It Works' hero link goes to the sales page's workflow section, not an in-page anchor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "See How It Works" })).toHaveAttribute("href", "/landscaping-estimating-software/#how-it-works");
  await page.getByRole("link", { name: "See How It Works" }).click();
  await expect(page).toHaveURL(/\/landscaping-estimating-software\/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "From job quantities to a customer-ready price" })).toBeInViewport();
});

// An unlicensed visitor to /app/ is now redirected straight to the sales
// page — see tests/e2e/license-gate.spec.ts, which owns that behavior.

test("homepage: 'See every free tool and guide' links to the resources hub", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "See every free tool and guide" })).toHaveAttribute("href", "/resources/");
});

for (const url of TOOL_PAGES_WITH_PRO_UPSELL) {
  test(`${url}: 'More free tools' also links back to the resources hub`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("link", { name: "See every free tool and guide" })).toHaveAttribute("href", "/resources/");
  });
}

test("resources page's own tool grids do not link back to themselves", async ({ page }) => {
  await page.goto("/resources/");
  await expect(page.getByRole("link", { name: "See every free tool and guide" })).toHaveCount(0);
});

test("privacy and terms cross-reference each other", async ({ page }) => {
  await page.goto("/privacy/");
  await expect(page.locator("#main-content").getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms/");
  await page.goto("/terms/");
  await expect(page.locator("#main-content").getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "/privacy/");
});

test("pricing page links to the refund policy before purchasing, same as the sales page", async ({ page }) => {
  await page.goto("/pricing/");
  await expect(page.locator("#main-content").getByRole("link", { name: "refund policy" })).toHaveAttribute("href", "/refund/");
});
