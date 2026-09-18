import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.use({ storageState: { cookies: [], origins: [] } });
const pages = [
  ["landscape-job-cost-calculator", "$1,665.00"],
  ["landscape-profit-margin-calculator", "$4,615.39"],
  ["mulch-cost-calculator", "138 bags"],
  ["topsoil-cost-calculator", "17.04 US short tons"],
  ["landscape-labor-cost-calculator", "27 hours"],
];
for (const [slug, expected] of pages) {
  test(`${slug}: live calculation, validation, mobile, accessibility and Pro link`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`/${slug}/`);
    const result = page.getByRole("region", { name: "Calculator results" });
    await expect(result).toContainText(expected);
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
    const input = page.locator("[data-calculator] input").first();
    await input.fill("-1");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(result).toContainText("Correct the highlighted inputs");
    await page.getByRole("button", { name: "Reset example" }).click();
    await expect(result).toContainText(expected);
    await input.fill("0");
    await expect(result).not.toContainText("Correct the highlighted inputs");
    await page.getByRole("button", { name: "Reset example" }).click();
    await expect(page.locator(".js-tool-layout-pro-cta")).toHaveAttribute("href", "/landscaping-estimating-software/");
    await expect(page.locator(".js-tool-layout-pro-cta")).toContainText("$79 lifetime");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await page.screenshot({ path: `reports/screenshots/${slug}-desktop.png`, fullPage: false });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/screenshots/${slug}-mobile.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
test("multi-service worksheet totals and quantity edits", async ({ page }) => {
  await page.goto("/landscaping-estimate-calculator/");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  const worksheet = page.getByRole("region", { name: "Multi-service estimate worksheet" });
  await expect(worksheet).toContainText("$2600.77");
  await page.getByLabel("Quantity", { exact: true }).first().fill("0");
  await expect(worksheet).toContainText("$1539.24");
  await page.getByRole("button", { name: "Add service", exact: true }).click();
  await expect(page.getByLabel("Service description", { exact: true })).toHaveCount(3);
  await page.getByLabel("Target margin (%)", { exact: true }).fill("100");
  await expect(worksheet).toContainText("Correct the highlighted inputs");
  await page.getByRole("button", { name: "Reset calculator to starting values" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset", exact: true }).click();
  await expect(worksheet).toContainText("$2600.77");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
