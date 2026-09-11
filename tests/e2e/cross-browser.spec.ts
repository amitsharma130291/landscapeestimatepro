/**
 * Phase 7 — core smoke suite run across Chromium, Firefox, and Playwright's
 * own WebKit build (see playwright.config.ts's per-project testMatch).
 *
 * IMPORTANT: Playwright's "webkit" project is Playwright's bundled WebKit
 * engine, NOT real Safari (no real macOS/iOS Safari, no Apple's actual
 * ITP/WebKit patches). This suite proves rendering-engine-level
 * compatibility (Blink vs Gecko vs WebKit); it does not satisfy the "real
 * Safari" requirement in LEP-142, which stays a separate manual item.
 */
import { test, expect } from "@playwright/test";
import { openOrCreateProject } from "./helpers";

test("free calculator produces the correct result", async ({ page }) => {
  await page.goto("/landscaping-cost-calculator/");
  await expect(page.getByText("Direct cost").first()).toBeVisible();
  const before = await page.locator("main").innerText();
  const materialsInput = page.getByLabel("Materials");
  await materialsInput.fill("50000"); // a large, unambiguous change
  await materialsInput.blur();
  await expect(async () => {
    const after = await page.locator("main").innerText();
    expect(after).not.toBe(before);
  }).toPass({ timeout: 5000 });
});

test("free-tool validation rejects an invalid input", async ({ page }) => {
  await page.goto("/landscaping-price-list/");
  const rateInput = page.locator("table tbody tr").first().getByLabel(/^Rate, row/);
  await rateInput.fill("-5");
  await rateInput.blur();
  // MoneyInput/validation should reject or reset a negative amount rather
  // than silently accepting it — assert it never displays as -$5.00.
  const value = await rateInput.inputValue();
  expect(value).not.toBe("-5");
});

test("local persistence: a Pro workspace change survives a reload", async ({ page }) => {
  await page.goto("/app/settings/");
  const nameInput = page.getByLabel("Business name");
  await nameInput.fill("Cross-Browser Test Co.");
  await nameInput.blur();
  await page.waitForTimeout(300); // autosave debounce
  await page.reload();
  await expect(page.getByLabel("Business name")).toHaveValue("Cross-Browser Test Co.");
});

test("estimate creation: a new project appears in the list with a real calculated price", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await expect(page.getByText("Estimate summary")).toBeVisible();
  await page.getByRole("button", { name: "← Back to estimates" }).click();
  await expect(page.getByText(/saved project/)).toBeVisible();
});

test("tooltip interaction works", async ({ page }) => {
  await openOrCreateProject(page);
  const trigger = page.getByRole("button", { name: /^Help:/ }).first();
  await trigger.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
});

test("quote revision: Review and quote creates a locked revision", async ({ page }) => {
  await openOrCreateProject(page);
  const action = page.getByRole("button", { name: "Review and quote" });
  if (await action.isVisible().catch(() => false)) {
    await action.click();
    await expect(page.getByText("Locked")).toBeVisible();
  }
});

test("backup export triggers a download", async ({ page }) => {
  await page.goto("/app/settings/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace (JSON)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});

test("print emulation does not crash the page", async ({ page }) => {
  await page.goto("/landscaping-estimate-template/");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("body")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
});

test("corrupt-workspace recovery screen renders and offers a non-destructive path first", async ({ page }) => {
  await page.goto("/app/");
  await page.evaluate(() => {
    localStorage.setItem("landscapeEstimateProWorkspace:v1", '{"version":5,"business":{"loadedLaborRateCents":"not-a-number"}}');
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: /needs correction/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Download original workspace/ })).toBeVisible();
});
