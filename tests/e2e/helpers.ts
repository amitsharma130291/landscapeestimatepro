import { expect, type Page } from "@playwright/test";

/**
 * Every Playwright test gets a fresh, isolated browser context (no
 * localStorage) — the Pro app's sample workspace seeds Catalog/Assemblies
 * data automatically, but NOT a sample project, so `/app/estimates/`
 * starts with zero projects. Use this instead of assuming an "Open" button
 * already exists.
 */
export async function openOrCreateProject(page: Page): Promise<void> {
  await page.goto("/app/estimates/");
  await expect(page.getByRole("heading", { name: "Estimates", exact: true })).toBeVisible();
  const openButton = page.getByRole("button", { name: "Open" }).first();
  if (await openButton.isVisible().catch(() => false)) {
    await openButton.click();
  } else {
    await page.getByRole("button", { name: "New estimate" }).click();
  }
  await expect(page.getByText("Estimate summary")).toBeVisible();
}
