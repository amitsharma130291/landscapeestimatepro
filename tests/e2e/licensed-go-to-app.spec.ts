/**
 * Once a visitor has a stored license (they've already paid, or activated
 * a key), every "buy Pro" / "try Pro free" surface sitewide should offer a
 * fast way back into the app instead — never a buy button or a pitch for
 * something they already own. This exercises that swap everywhere it's
 * wired: the global header, the sales page's CTAs and sticky bar, the
 * homepage/pricing/sales-page PurchaseButton islands, and the free-tool
 * pages' Pro-upsell surfaces (ToolCardGrid's card and ToolPageLayout's
 * banner, which together cover all 7 free-tool pages plus the homepage and
 * resources page).
 *
 * All of this is a pure client-side localStorage check (see
 * hasStoredLicense() in src/lib/license.ts) — never trusted for actual
 * access control, which LicenseGate.tsx still independently enforces on
 * /app/ itself (covered by license-gate.spec.ts).
 */
import { test, expect, type Page } from "@playwright/test";

const FAKE_LICENSE = "LEP-PRO-e2e-fixture";

async function setLicensed(page: Page): Promise<void> {
  await page.addInitScript((license) => {
    window.localStorage.setItem("landscapeEstimateProLicense", license);
  }, FAKE_LICENSE);
}

test.describe("licensed visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("global header shows Go to App instead of See Pricing", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/");
    const cta = page.locator("nav[aria-label='Primary']").getByRole("link", { name: "Go to App" });
    await expect(cta).toHaveAttribute("href", "/app/");
    await expect(page.getByRole("link", { name: "See Pricing" })).toHaveCount(0);
  });

  test("header CTA still says See Pricing for an unlicensed visitor (no false positive)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav[aria-label='Primary']").getByRole("link", { name: "See Pricing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to App" })).toHaveCount(0);
  });

  test("nav 'Estimating Software' link redirects straight to /app/ once licensed, but keeps its label", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/");
    const navLink = page.locator("nav[aria-label='Primary']").getByRole("link", { name: "Estimating Software" });
    await expect(navLink).toHaveAttribute("href", "/app/");
  });

  test("nav 'Estimating Software' link still points at the sales page for an unlicensed visitor", async ({ page }) => {
    await page.goto("/");
    const navLink = page.locator("nav[aria-label='Primary']").getByRole("link", { name: "Estimating Software" });
    await expect(navLink).toHaveAttribute("href", "/landscaping-estimating-software/");
  });

  test("sales page: every BuyCtaButton placement and the sticky bar show Go to App", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/landscaping-estimating-software/");

    const goToAppLinks = page.getByRole("link", { name: "Go to App" });
    expect(await goToAppLinks.count()).toBeGreaterThanOrEqual(4); // sticky bar hidden until scrolled
    for (const link of await goToAppLinks.all()) {
      await expect(link).toHaveAttribute("href", "/app/");
    }
    await expect(page.getByRole("button", { name: /Get Landscape Estimate Pro|Protect My Margin|Build More Confident/ })).toHaveCount(0);

    await page.locator("#service-rate-health").scrollIntoViewIfNeeded();
    await expect(page.locator("#sales-sticky-cta")).toHaveCSS("opacity", "1");
    await expect(page.locator("#sales-sticky-cta").getByRole("link", { name: "Go to App" })).toBeVisible();
    await expect(page.locator(".js-sticky-cta-caption")).toHaveText("Your license is active");
  });

  test("sales page pricing section's PurchaseButton island also shows Go to App", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/landscaping-estimating-software/");
    const pricing = page.locator("#pricing");
    await pricing.scrollIntoViewIfNeeded();
    await expect(pricing.getByRole("link", { name: "Go to App" })).toHaveAttribute("href", "/app/");
  });

  test("/pricing/ page's PurchaseButton shows Go to App", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/pricing/");
    await expect(page.locator("#main-content").getByRole("link", { name: "Go to App" })).toHaveAttribute("href", "/app/");
    await expect(page.getByRole("button", { name: /Get Landscape Estimate Pro/ })).toHaveCount(0);
  });

  test("homepage: both the pricing section's PurchaseButton and the free-tools grid's Pro card show Go to App", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/");
    const goToAppLinks = page.getByRole("link", { name: "Go to App" });
    expect(await goToAppLinks.count()).toBeGreaterThanOrEqual(2); // header + pricing PurchaseButton, at minimum
    await expect(page.locator('a[href="/app/"]').filter({ hasText: "Go to App" }).first()).toBeVisible();
  });

  test("homepage's example preview card: 'Create customer estimate' goes straight to /app/ once licensed", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Create customer estimate" })).toHaveAttribute("href", "/app/");
  });

  const TOOL_PAGES = [
    "/landscaping-cost-calculator/",
    "/landscaping-estimate-calculator/",
    "/landscaping-estimate-template/",
    "/landscaping-invoice-template/",
    "/landscaping-price-list/",
    "/landscaping-quote-template/",
    "/landscape-pricing-guide/",
  ];

  for (const url of TOOL_PAGES) {
    test(`${url}: the Pro-upsell card and the bottom banner both show Go to App`, async ({ page }) => {
      await setLicensed(page);
      await page.goto(url);
      const goToAppLinks = page.locator('a[href="/app/"]').filter({ hasText: "Go to App" });
      expect(await goToAppLinks.count()).toBeGreaterThanOrEqual(2);
      await expect(page.getByText("Try Pro free")).toHaveCount(0);
    });
  }

  test("resources page: the bottom Pro banner shows Go to App", async ({ page }) => {
    await setLicensed(page);
    await page.goto("/resources/");
    await expect(page.locator('a[href="/app/"]').filter({ hasText: "Go to App" }).first()).toBeVisible();
    await expect(page.getByText("Try Pro free")).toHaveCount(0);
  });
});
