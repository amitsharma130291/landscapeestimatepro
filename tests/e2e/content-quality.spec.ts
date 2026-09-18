import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.use({ storageState: { cookies: [], origins: [] } });

test("methodology publishes a labelled, reproducible example and accessible mobile layout", async ({ page }) => {
  await page.goto("/calculation-methodology/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How the calculators turn inputs into results");
  await expect(page.locator("main")).toContainText("This is an illustrative calculation, not a customer case study.");
  for (const value of ["$2,760.00", "$3,335.00", "$575.00", "$1,665.00", "33.30%", "$5,130.77"]) await expect(page.locator("main")).toContainText(value);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("quote-specific reference and validity appear in print without changing prices", async ({ page }) => {
  await page.addInitScript(() => { window.print = () => {}; });
  await page.goto("/landscaping-quote-template/");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await page.getByLabel("Quote date", { exact: true }).fill("2026-09-18");
  await page.getByLabel("Quote reference", { exact: true }).fill("Q-TEST-104");
  const expiry = page.getByLabel("Valid until", { exact: true });
  await expiry.fill("2026-09-17");
  const print = page.getByRole("button", { name: "Print / Save as PDF", exact: true });
  await expect(expiry).toHaveAttribute("aria-invalid", "true");
  await expect(print).toBeDisabled();
  await expiry.fill("2026-10-18");
  await page.getByLabel("Line-item detail", { exact: true }).selectOption("summary");
  await print.click();
  const document = page.locator("#customer-document-print-root");
  await expect(document).toContainText("Reference: Q-TEST-104");
  await expect(document).toContainText("Valid until: October 18, 2026");
  await expect(document).toContainText("$1,930.00");
  await expect(document).not.toContainText("@ $95.00");
  await expect(document).not.toContainText("Calculation methods");
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: "reports/screenshots/quote-reference-print.png", fullPage: true });
});

test("estimate document keeps provisional workflow without quote-only fields", async ({ page }) => {
  await page.goto("/landscaping-estimate-template/");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await expect(page.getByLabel("Quote reference", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Valid until", { exact: true })).toHaveCount(0);
});

test("service worksheet preserves fractional-cent overhead until final ceiling", async ({ page }) => {
  await page.goto("/landscaping-estimate-calculator/");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await page.getByLabel("Quantity", { exact: true }).first().fill("1");
  await page.getByLabel("Direct cost per unit ($)", { exact: true }).first().fill("0.01");
  await page.getByLabel("Quantity", { exact: true }).nth(1).fill("0");
  await page.getByLabel("Delivery ($)", { exact: true }).fill("0");
  await page.getByLabel("Overhead (%)", { exact: true }).fill("25");
  await page.getByLabel("Target margin (%)", { exact: true }).fill("40");
  const price = page.locator('section[aria-label="Multi-service estimate worksheet"] [aria-live]');
  // 0.01 * 1.25 / 0.60 = 0.020833..., ceiling-rounded to 0.03.
  await expect(price).toContainText("Required pre-tax price$0.03");
});
