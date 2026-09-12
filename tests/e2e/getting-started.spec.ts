/**
 * End-to-end coverage for the "How to get started" onboarding section
 * (src/components/app/GettingStartedSection.tsx, derived by
 * src/lib/gettingStarted.ts) — the single authoritative onboarding
 * experience on the Overview tab, replacing the old "Setup checklist".
 * Walks a genuinely fresh workspace through all 5 steps via the real UI,
 * confirming progress advances after each one, survives a reload, reverses
 * when qualifying data is deleted, and reaches the finished state.
 */
import { test, expect, type Page } from "@playwright/test";

async function freshWorkspace(page: Page) {
  await page.goto("/app/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test.describe("Getting started onboarding", () => {
  test("full flow: 0/5 -> each step in turn -> 5/5, surviving reloads and reversing on deletion", async ({ page }) => {
    await freshWorkspace(page);

    await expect(page.getByText("0 of 5 steps complete")).toBeVisible();
    // Untouched sample data (materials/equipment/assemblies ship pre-seeded)
    // must never be mistaken for real setup.
    await expect(page.getByText("Sample data — replace with your business costs").first()).toBeVisible();
    await page.screenshot({ path: "test-results/getting-started-fresh-desktop.png", fullPage: true });

    // Step 1 — business setup.
    await page.getByRole("link", { name: /Open Settings/ }).click();
    await expect(page).toHaveURL(/\/app\/settings\//);
    await page.getByLabel("Business name").fill("Getting Started E2E Co.");
    await page.getByLabel("Business name").blur();
    await page.getByRole("textbox", { name: "Loaded labor rate" }).fill("45.00");
    await page.getByRole("textbox", { name: "Loaded labor rate" }).blur();
    await page.getByRole("textbox", { name: "Overhead", exact: true }).fill("18");
    await page.getByRole("textbox", { name: "Overhead", exact: true }).blur();
    await page.getByRole("textbox", { name: "Target margin" }).fill("30");
    await page.getByRole("textbox", { name: "Target margin" }).blur();
    await page.getByRole("textbox", { name: "Minimum project price" }).fill("600.00");
    await page.getByRole("textbox", { name: "Minimum project price" }).blur();
    await page.waitForTimeout(300);

    await page.goto("/app/");
    await expect(page.getByText("1 of 5 steps complete")).toBeVisible();

    // Reload after an intermediate step — derived progress must survive it
    // exactly, since nothing about it is a separately-stored flag.
    await page.reload();
    await expect(page.getByText("1 of 5 steps complete")).toBeVisible();

    // Step 2 — add a real, valid material.
    await page.goto("/app/catalog/");
    await page.getByRole("button", { name: "Add material" }).click();
    const materialNameInput = page.locator('input[id*="mat-name-"]').last();
    await materialNameInput.fill("E2E Mulch");
    await materialNameInput.blur();
    const materialCostInput = page.locator('input[id*="mat-cost-"]').last();
    await materialCostInput.fill("40.00");
    await materialCostInput.blur();
    await page.waitForTimeout(300);

    await page.goto("/app/");
    await expect(page.getByText("2 of 5 steps complete")).toBeVisible();
    await page.screenshot({ path: "test-results/getting-started-partial-desktop.png", fullPage: true });

    // Step 3 — build a real, valid service assembly using that material.
    await page.goto("/app/templates/");
    await page.getByRole("button", { name: "Add assembly" }).click();
    const assemblyNameInput = page.locator('input[id*="-name-"]').last();
    await assemblyNameInput.fill("E2E Mulch Install");
    await assemblyNameInput.blur();
    const laborInput = page.getByLabel("Person-hours per unit").last();
    await laborInput.fill("0.4");
    await laborInput.blur();
    await page.getByRole("button", { name: "+ Add material" }).last().click();
    // "+ Add material" defaults to the catalog's first item — point this
    // line at OUR material specifically so deleting it later is a genuine
    // "still referenced" case.
    await page.locator('select[aria-label="Material"]').last().selectOption({ label: "E2E Mulch" });
    await page.waitForTimeout(300);

    await page.goto("/app/");
    await expect(page.getByText("3 of 5 steps complete")).toBeVisible();

    // Step 4 — a saved, quotable estimate using that service.
    await page.goto("/app/estimates/");
    await page.getByRole("button", { name: "New estimate" }).click();
    await page.getByRole("button", { name: "+ Add service" }).click();
    await page.getByLabel("Service assembly").selectOption({ label: "E2E Mulch Install" });
    await page.getByLabel("Quantity").first().fill("10");
    await page.getByLabel("Quantity").first().blur();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Review and quote" }).click();
    await expect(page.getByText("Locked", { exact: true })).toBeVisible();
    const statusSelect = page.locator("#project-status");
    await statusSelect.selectOption("won");
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();

    await page.goto("/app/");
    await expect(page.getByText("4 of 5 steps complete")).toBeVisible();

    // Step 5 — record actuals for that same (now "won") project.
    await page.goto("/app/actuals/");
    const qtyActual = page.locator('input[aria-label^="Actual quantity"]').first();
    await qtyActual.fill("10");
    const hoursActual = page.locator('input[aria-label^="Actual labor hours"]').first();
    await hoursActual.fill("4");
    await hoursActual.blur();
    await page.getByRole("button", { name: "Save actuals" }).click();
    await page.waitForTimeout(300);

    await page.goto("/app/");
    await expect(page.getByText("5 of 5 steps complete")).toBeVisible();
    await expect(page.getByText("You're ready to estimate with confidence.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create New Estimate" })).toHaveAttribute("href", "/app/estimates/");
    await expect(page.getByRole("link", { name: "Review Service Rate Health" })).toHaveAttribute("href", "/app/rate-health/");

    await page.reload();
    await expect(page.getByText("5 of 5 steps complete")).toBeVisible();

    await page.screenshot({ path: "test-results/getting-started-complete-desktop.png", fullPage: true });

    // Deleting the qualifying material reverses BOTH the catalog step and,
    // since the assembly now references a material that no longer exists,
    // the service step — proving these are derived live, not cached.
    await page.goto("/app/catalog/");
    const removeMaterialButton = page.getByRole("button", { name: /Remove E2E Mulch/ });
    await removeMaterialButton.click();
    // The material is still referenced by the assembly built above, so
    // removing it opens an in-app confirm dialog first.
    await page.getByRole("dialog").getByRole("button", { name: "Delete anyway" }).click();
    await page.waitForTimeout(300);

    await page.goto("/app/");
    await expect(page.getByText(/[0-3] of 5 steps complete/)).toBeVisible();
    await expect(page.getByText("5 of 5 steps complete")).not.toBeVisible();
  });

  test("collapsed/expanded presentation preference persists independently of completion", async ({ page }) => {
    await freshWorkspace(page);
    const toggle = page.getByRole("button", { name: /How to get started/ });
    await toggle.click();
    const collapsedToggle = page.getByRole("button", { name: /Show getting-started guide/ });
    await expect(collapsedToggle).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: /Show getting-started guide/ })).toHaveAttribute("aria-expanded", "false");

    // Completion is untouched by having collapsed the section.
    await page.getByRole("button", { name: /Show getting-started guide/ }).click();
    await expect(page.getByText("0 of 5 steps complete")).toBeVisible();
  });

  test("the whole section is keyboard-operable end to end, no mouse", async ({ page }) => {
    await freshWorkspace(page);
    // The toggle's accessible name itself flips between the expanded and
    // collapsed labels, so it's queried by its stable aria-controls target
    // rather than by name.
    const toggle = page.locator('button[aria-controls="getting-started-body"]');
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const settingsLink = page.getByRole("link", { name: /Open Settings/ });
    await settingsLink.focus();
    await expect(settingsLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/settings\//);
  });

  test("mobile viewport: no horizontal overflow and every action stays reachable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await freshWorkspace(page);
    await expect(page.getByText("0 of 5 steps complete")).toBeVisible();
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    await expect(page.getByRole("link", { name: /Open Settings/ })).toBeVisible();
    await page.screenshot({ path: "test-results/getting-started-fresh-mobile.png", fullPage: true });
  });

  test("tablet viewport: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await freshWorkspace(page);
    await expect(page.getByText("0 of 5 steps complete")).toBeVisible();
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
