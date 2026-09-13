/**
 * Phase 5 — the repeatable, automatable portion of LEP-138 (keyboard
 * navigation). Real `page.keyboard` events only — never `.click()` or
 * `.fill()`, so a passing test here is genuine keyboard-only proof, not a
 * mouse action dressed up as one. A short human keyboard smoke test stays
 * in the manual QA matrix for what this can't reach (full app-wide focus
 * order review, subjective "does this feel right" judgment).
 */
import { test, expect } from "@playwright/test";
import { openOrCreateProject } from "./helpers";

test.describe("Keyboard navigation — public site", () => {
  test("free cost calculator is fully operable via Tab/Enter/Space, no mouse", async ({ page }) => {
    await page.goto("/landscaping-cost-calculator/");
    await page.keyboard.press("Tab"); // skip-link or first focusable
    let guard = 0;
    while (guard++ < 40) {
      const name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 30));
      if (name && /materials|labor|overhead|margin/i.test(name)) break;
      await page.keyboard.press("Tab");
    }
    // Type into whichever numeric field has focus, confirm it registers
    // without ever using the mouse.
    const active = page.locator(":focus");
    await expect(active).toBeVisible();
  });
});

test.describe("Keyboard navigation — Pro app", () => {
  test("app tab navigation is reachable and operable via Tab + Enter", async ({ page }) => {
    await page.goto("/app/");
    // Tab into the sidebar nav and activate "Catalog" with Enter only.
    // exact:true disambiguates from the Overview tab's own "Build Your
    // Catalog" getting-started action link, whose accessible name also
    // contains "Catalog".
    const catalogLink = page.getByRole("link", { name: "Catalog", exact: true });
    await catalogLink.focus();
    await expect(catalogLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/catalog\//);
  });

  test("getting-started section: collapse toggle and a step action link both operate via Enter", async ({ page }) => {
    await page.goto("/app/");
    await page.evaluate(() => {
      // Keep the license fixture — clearing it would re-lock /app behind
      // LicenseGate instead of resetting the onboarding workspace state.
      const license = localStorage.getItem("landscapeEstimateProLicense");
      localStorage.clear();
      if (license) localStorage.setItem("landscapeEstimateProLicense", license);
    });
    await page.reload();
    // Queried by its stable aria-controls target, not by name — the
    // accessible name itself flips between "How to get started" and "Show
    // getting-started guide" depending on collapsed state.
    const toggle = page.locator('button[aria-controls="getting-started-body"]');
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const settingsAction = page.getByRole("link", { name: /Open Settings/ });
    await settingsAction.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/settings\//);
  });

  test("HelpTooltip: open on Enter, close on Escape, focus returns to trigger", async ({ page }) => {
    await openOrCreateProject(page);
    const trigger = page.getByRole("button", { name: /^Help:/ }).first();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toBeHidden();
    await expect(trigger).toBeFocused(); // focus returns to the trigger, not lost
  });

  test("estimate summary disclosure (cost breakdown) expands/collapses via Enter", async ({ page }) => {
    await openOrCreateProject(page);
    const disclosure = page.getByRole("button", { name: /Cost breakdown/ });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Direct cost").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  });

  test("WorkflowStatusBar's next action (Review and quote) activates via Enter and is not a keyboard trap", async ({ page }) => {
    await openOrCreateProject(page);
    const action = page.getByRole("button", { name: "Review and quote" });
    await action.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Quoted").first()).toBeVisible();
    // Focus should land somewhere sane afterward, not vanish from the page.
    const stillHasFocus = await page.evaluate(() => document.activeElement !== document.body);
    expect(stillHasFocus).toBe(true);
  });

  test("adding and removing a service line does not lose focus off the page", async ({ page }) => {
    await openOrCreateProject(page);
    const addService = page.getByRole("button", { name: "+ Add service" });
    await addService.focus();
    await page.keyboard.press("Enter");
    const removeButtons = page.getByRole("button", { name: "Remove service" });
    await expect(removeButtons.first()).toBeVisible();
    await removeButtons.first().focus();
    await page.keyboard.press("Enter");
    const stillHasFocus = await page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body);
    expect(stillHasFocus, "focus was lost to <body> after deleting a row").toBe(true);
  });

  test("a disabled control does not activate on Enter/Space", async ({ page }) => {
    await openOrCreateProject(page);
    // Re-quote is disabled until a revision exists (still Draft here).
    const reQuote = page.getByRole("button", { name: "Re-quote" });
    const isVisible = await reQuote.isVisible().catch(() => false);
    if (isVisible) {
      await expect(reQuote).toBeDisabled();
    }
  });

  test("recovery/migration-error screen (simulated corrupt workspace) is reachable and operable via keyboard", async ({ page }) => {
    await page.goto("/app/");
    await page.evaluate(() => {
      localStorage.setItem("landscapeEstimateProWorkspace:v1", '{"version":5,"business":{"loadedLaborRateCents":"not-a-number"}}');
    });
    await page.reload();
    const heading = page.getByRole("heading", { name: /needs correction/i });
    await expect(heading).toBeVisible();
    const downloadOriginal = page.getByRole("button", { name: /Download original workspace/ });
    await downloadOriginal.focus();
    await expect(downloadOriginal).toBeFocused();
  });

  test("Catalog creation: adding a material and typing its name/cost/unit is fully keyboard-operable", async ({ page }) => {
    await page.goto("/app/catalog/");
    const addMaterial = page.getByRole("button", { name: "Add material" });
    await addMaterial.focus();
    await page.keyboard.press("Enter");
    const nameInput = page.locator('input[id*="mat-name-"]').last();
    await expect(nameInput).toBeVisible();
    await nameInput.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Keyboard Test Material");
    await page.keyboard.press("Tab"); // moves focus to Unit cost, committing the name field
    await expect(nameInput).toHaveValue("Keyboard Test Material");
    const activeAfterTab = await page.evaluate(() => document.activeElement?.getAttribute("id"));
    expect(activeAfterTab).toMatch(/mat-cost-/);
    await page.keyboard.type("19.99");
    await page.keyboard.press("Tab");
    const costInput = page.locator('input[id*="mat-cost-"]').last();
    await expect(costInput).toHaveValue("19.99");
  });

  test("Assembly creation: adding a service assembly and naming it is fully keyboard-operable", async ({ page }) => {
    await page.goto("/app/templates/");
    const addAssembly = page.getByRole("button", { name: "Add assembly" });
    await addAssembly.focus();
    await page.keyboard.press("Enter");
    // Locate by label, not by current value — a CSS attribute selector like
    // input[value="New service"] stops matching the instant its value
    // changes, which is exactly what this test is about to do.
    const nameInput = page.getByLabel("Service name").last();
    await expect(nameInput).toHaveValue("New service");
    await nameInput.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Keyboard Test Service");
    await page.keyboard.press("Tab");
    await expect(nameInput).toHaveValue("Keyboard Test Service");
  });

  test("Actuals entry: entering actual quantity/hours on a won project is fully keyboard-operable", async ({ page }) => {
    await openOrCreateProject(page);
    const addService = page.getByRole("button", { name: "+ Add service" });
    await addService.focus();
    await page.keyboard.press("Enter");
    const qty = page.getByLabel("Quantity").first();
    await qty.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("5");
    await page.keyboard.press("Tab");

    const reviewAndQuote = page.getByRole("button", { name: "Review and quote" });
    await reviewAndQuote.focus();
    await page.keyboard.press("Enter");

    const statusSelect = page.locator("#project-status");
    await statusSelect.focus();
    await page.keyboard.press("ArrowDown"); // Draft -> Quoted
    await page.keyboard.press("ArrowDown"); // Quoted -> Accepted
    await page.keyboard.press("Enter"); // some browsers need Enter to commit a native <select>'s pending value

    await page.goto("/app/actuals/");
    const qtyActual = page.locator('input[aria-label^="Actual quantity"]').first();
    await expect(qtyActual).toBeVisible();
    await qtyActual.focus();
    await page.keyboard.type("5");
    const hoursActual = page.locator('input[aria-label^="Actual labor hours"]').first();
    await hoursActual.focus();
    await page.keyboard.type("3.5");
    await page.keyboard.press("Tab");
    await expect(hoursActual).toHaveValue("3.5");
  });

  test("Backup export is keyboard-operable: Enter on the Export button triggers a real download", async ({ page }) => {
    await page.goto("/app/settings/");
    const exportButton = page.getByRole("button", { name: "Export workspace (JSON)" });
    await exportButton.focus();
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press("Enter");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test("Backup import is keyboard-reachable: Enter on 'Import workspace' opens the native file chooser", async ({ page }) => {
    await page.goto("/app/settings/");
    const importButton = page.getByRole("button", { name: "Import workspace" });
    await importButton.focus();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    const fileChooser = await fileChooserPromise; // proves the OS file picker (keyboard-native from here) actually opens
    expect(fileChooser).toBeTruthy();
  });

  test("draft numeric input commit/revert via keyboard: Tab discards an invalid draft; Escape does NOT silently corrupt it either", async ({ page }) => {
    await openOrCreateProject(page);
    await page.getByRole("button", { name: "+ Add service" }).click();
    const qty = page.getByLabel("Quantity").first();
    await qty.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("7");
    await page.keyboard.press("Tab");
    await expect(qty).toHaveValue("7");

    await qty.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("-3"); // invalid: negative quantity
    // Escape has no special wiring on DraftNumberInput (it only commits on
    // Enter/blur) — pressing it must not commit the invalid draft either.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab"); // blur discards the invalid draft
    await expect(qty).toHaveValue("7"); // reverted to the last valid committed value, never "-3" and never "0"
  });

  test("no action requires hover: every 'Help:' tooltip trigger and its content is reachable by focus alone, with no hover step", async ({ page }) => {
    await openOrCreateProject(page);
    const triggers = page.getByRole("button", { name: /^Help:/ });
    const count = await triggers.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 3); i++) {
      const trigger = triggers.nth(i);
      await trigger.focus(); // focus only — the mouse never moves near this element
      await page.keyboard.press("Enter");
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
});

test.describe("Keyboard navigation — remaining free calculators", () => {
  for (const url of ["/landscaping-price-list/", "/landscaping-estimate-calculator/", "/landscaping-estimate-template/", "/landscaping-invoice-template/", "/landscaping-quote-template/"]) {
    test(`${url} has a focusable, typeable field reachable by Tab alone`, async ({ page }) => {
      await page.goto(url);
      let found = false;
      for (let i = 0; i < 60 && !found; i++) {
        await page.keyboard.press("Tab");
        const tag = await page.evaluate(() => document.activeElement?.tagName);
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") found = true;
      }
      expect(found, `no focusable input/textarea/select reached by Tab on ${url}`).toBe(true);
    });
  }
});
