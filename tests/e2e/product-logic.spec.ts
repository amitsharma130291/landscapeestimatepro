/**
 * Product Logic Test Suite audit — real-browser evidence for cases the
 * workbook's own rules say a unit test cannot satisfy (Execution Mode
 * Browser/UI, or explicit language requiring rendered evidence).
 *
 * Every test here drives the actual built application through Playwright;
 * none of it mocks or reaches into React internals.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openOrCreateProject } from "./helpers";

/** Reloading `/app/estimates/` always lands back on the LIST view — which
 * project (if any) is open lives only in React state, not the URL. Re-opens
 * the one project this test created so assertions can resume on its detail
 * view, proving the underlying persisted data survived the reload. */
async function reloadAndReopen(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Estimates", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open" }).first().click();
  await expect(page.getByText("Estimate summary")).toBeVisible();
}

test("LEP-095 project-editing atomicity: an invalid draft never persists, is never partially saved, and creates no quote revision; only an explicit valid commit saves", async ({ page }) => {
  await openOrCreateProject(page);

  const addService = page.getByRole("button", { name: "+ Add service" });
  if (await addService.isEnabled().catch(() => false)) {
    await addService.click();
  }
  const qtyInput = page.getByLabel("Quantity").first();
  await qtyInput.fill("5");
  await qtyInput.blur();
  await page.waitForTimeout(400); // autosave debounce

  const summaryBefore = await page.locator('dl[aria-live="polite"]').innerText();

  // Type an invalid value — this must remain a local DRAFT only, never
  // committed to the project's actual quantity.
  await qtyInput.fill("-1");
  await expect(qtyInput).toHaveValue("-1");

  // Navigate to another field (blur) — DraftNumberInput must discard an
  // invalid draft on commit, not coerce it to 0 or leave it as -1.
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);
  await expect(qtyInput).toHaveValue("5");

  const summaryAfterDiscard = await page.locator('dl[aria-live="polite"]').innerText();
  expect(summaryAfterDiscard).toBe(summaryBefore); // no partial aggregate leaked through
  await expect(page.getByText("Locked", { exact: true })).not.toBeVisible(); // no quote revision was created by this edit

  // Reload the whole application: the ONLY persisted truth must be the last
  // valid committed value, never the rejected draft.
  await reloadAndReopen(page);
  const qtyAfterReload = page.getByLabel("Quantity").first();
  await expect(qtyAfterReload).toHaveValue("5");
  const summaryAfterReload = await page.locator('dl[aria-live="polite"]').innerText();
  expect(summaryAfterReload).toBe(summaryBefore);
  await expect(page.getByText("Locked", { exact: true })).not.toBeVisible(); // still no revision

  // Now correct the value and EXPLICITLY commit a valid one.
  await qtyAfterReload.fill("10");
  await qtyAfterReload.blur();
  await page.waitForTimeout(400);
  const summaryAfterValidCommit = await page.locator('dl[aria-live="polite"]').innerText();
  expect(summaryAfterValidCommit).not.toBe(summaryBefore); // the valid aggregate actually changed, exactly once

  // Reload again: the valid commit — and only that commit — persisted.
  await reloadAndReopen(page);
  await expect(page.getByLabel("Quantity").first()).toHaveValue("10");
  const summaryFinal = await page.locator('dl[aria-live="polite"]').innerText();
  expect(summaryFinal).toBe(summaryAfterValidCommit);
});

test("LEP-082 unit-incompatibility warning: real DOM, names both units, invents no conversion, stays keyboard/screen-reader accessible", async ({ page }) => {
  await page.goto("/app/templates/");
  await expect(page.getByRole("heading", { name: "Service assemblies" })).toBeVisible();

  // The sample workspace's "Edging" assembly (unit "linear-ft" — a LENGTH)
  // starts with zero materials. Clicking its own "+ Add material" defaults
  // the new line to materials[0] ("Mulch", unit "yd3" — a VOLUME) — see
  // TemplatesTab.tsx's addMaterial handler. Length vs volume is exactly the
  // dimensionally-incompatible pair describeUnitRelationship's "incompatible"
  // branch exists for — no dropdown interaction needed to reach it.
  const removeEdging = page.getByRole("button", { name: "Remove Edging" });
  await expect(removeEdging).toBeVisible();
  const addMaterialForEdging = removeEdging.locator('xpath=following::button[normalize-space(text())="+ Add material"][1]');
  await addMaterialForEdging.click();

  const warning = removeEdging.locator('xpath=following::p[contains(., "Different unit types")][1]');
  await expect(warning).toBeVisible();
  const warningText = (await warning.textContent()) ?? "";
  // Both units named explicitly — the resource's (yd³) and the assembly's own (linear ft).
  expect(warningText).toMatch(/yd.?/i);
  expect(warningText).toMatch(/linear ft/i);
  // Purely descriptive per the module's own contract — never claims to have
  // performed or assumed a conversion on the user's behalf.
  expect(warningText).not.toMatch(/we (converted|assumed|calculated)/i);
  expect(warningText).toMatch(/never guesses a conversion/i);

  await page.screenshot({ path: "test-results/lep-082-unit-incompatibility-warning.png", fullPage: true });

  // Accessible to assistive tech: it's real DOM text (a <p>, not a
  // CSS-only/aria-hidden visual overlay), so it shows up in the
  // accessibility tree itself, not just visually on screen.
  expect(await warning.evaluate((el) => window.getComputedStyle(el).display)).not.toBe("none");
  expect(await warning.getAttribute("aria-hidden")).not.toBe("true");
  const axSnapshot = await page.locator("main").ariaSnapshot();
  expect(axSnapshot).toMatch(/Different unit types/i);

  // The quantity-per-unit input itself must remain fully usable — the
  // warning is advisory only and never disables or blocks the field (per
  // the module's own contract: "purely descriptive", never blocking).
  await expect(page.getByLabel("Quantity per unit").last()).toBeEditable();

  const axeResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = axeResults.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, serious.map((v) => v.id).join(", ")).toEqual([]);
});

test("LEP-082b a genuine known conversion (1 yd3 = 27 ft3) is shown exactly, never flagged incompatible", async ({ page }) => {
  await page.goto("/app/templates/");

  // Add a brand-new assembly (defaults: unit "each", zero materials), set its
  // unit to "ft3" (a volume, like yd3, so this is NOT the "incompatible"
  // dimension-mismatch case), then add a material — defaults to Mulch
  // (unit "yd3") — hitting the ONE known universal conversion in the app.
  await page.getByRole("button", { name: "Add assembly" }).click();
  const newNameInput = page.locator('input[value="New service"]');
  await expect(newNameInput).toBeVisible();
  const newUnitSelect = newNameInput.locator("xpath=following::select[1]");
  await newUnitSelect.selectOption("ft3");

  const addMaterialForNew = newNameInput.locator('xpath=following::button[normalize-space(text())="+ Add material"][1]');
  await addMaterialForNew.click();

  const conversionHint = newNameInput.locator('xpath=following::p[contains(., "1 yd³ = 27 ft³")][1]');
  await expect(conversionHint).toBeVisible();
  const conversionHintText = (await conversionHint.textContent()) ?? "";
  expect(conversionHintText).toMatch(/mixing units/i); // informational, not a blocking warning
  expect(conversionHintText).not.toMatch(/Different unit types/i); // never misclassified as incompatible
});

test("LEP-129 actuals draft safety: typing quantities/hours without clicking 'Save actuals' leaves the project's saved actual data completely untouched", async ({ page }) => {
  await openOrCreateProject(page);
  await page.getByRole("button", { name: "+ Add service" }).click();
  const qty = page.getByLabel("Quantity").first();
  await qty.fill("5");
  await qty.blur();
  await page.waitForTimeout(300);

  await page.goto("/app/actuals/");
  await expect(page.getByRole("heading", { name: "Profitability reporting" })).toBeVisible();

  const qtyActual = page.locator('input[aria-label^="Actual quantity"]').first();
  await expect(qtyActual).toBeVisible();
  await qtyActual.fill("999"); // a deliberately wrong/partial value that must never reach saved state
  const hoursActual = page.locator('input[aria-label^="Actual labor hours"]').first();
  await hoursActual.fill("42");
  await hoursActual.blur();

  // Navigate away WITHOUT clicking "Save actuals".
  await page.goto("/app/estimates/");
  await page.goto("/app/actuals/");

  // The unsaved draft must be gone — fields show their EMPTY/placeholder
  // state again, never the "999"/"42" that was typed but never saved.
  const qtyActualAfter = page.locator('input[aria-label^="Actual quantity"]').first();
  await expect(qtyActualAfter).toHaveValue("");
  const hoursActualAfter = page.locator('input[aria-label^="Actual labor hours"]').first();
  await expect(hoursActualAfter).toHaveValue("");

  // Reload the whole application — confirms nothing was silently persisted
  // to localStorage either, not just React state having reset.
  await page.reload();
  await page.goto("/app/actuals/");
  await expect(page.locator('input[aria-label^="Actual quantity"]').first()).toHaveValue("");
  await expect(page.locator('input[aria-label^="Actual labor hours"]').first()).toHaveValue("");

  // Now enter valid data AND explicitly click "Save actuals" — this, and
  // only this, is what persists.
  await page.locator('input[aria-label^="Actual quantity"]').first().fill("5");
  await page.locator('input[aria-label^="Actual labor hours"]').first().fill("2.5");
  await page.getByRole("button", { name: "Save actuals" }).click();
  await page.reload();
  await page.goto("/app/actuals/");
  await expect(page.locator('input[aria-label^="Actual quantity"]').first()).toHaveValue("5");
  await expect(page.locator('input[aria-label^="Actual labor hours"]').first()).toHaveValue("2.5");
});
