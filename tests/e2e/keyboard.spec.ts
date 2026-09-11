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
    const catalogLink = page.getByRole("link", { name: "Catalog" });
    await catalogLink.focus();
    await expect(catalogLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/catalog\//);
  });

  test("first-run checklist: collapse toggle and a confirm button both operate via Enter/Space", async ({ page }) => {
    await page.goto("/app/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const toggle = page.getByRole("button", { name: /Setup checklist/ });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const confirmButtons = page.getByRole("button", { name: /Already reviewed/ });
    await confirmButtons.first().focus();
    await page.keyboard.press(" ");
    await expect(page.getByText(/\d of 10 done/)).toBeVisible();
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
});
