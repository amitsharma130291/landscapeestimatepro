/**
 * Crew-size scenario comparison (spec section 23: "Allow the contractor to
 * compare 2/3/4-person crews using their own productivity assumptions —
 * do not assume that twice the crew means twice the production. Allow an
 * optional crew-efficiency factor.") — a purely additive what-if panel on
 * each ad-hoc "Crew labor" line in the Pro estimator. See
 * src/lib/estimateMath.ts's evaluateCrewSizeScenarios() and
 * estimateMath.test.ts for the exhaustive calculation-level coverage; this
 * file covers the real UI.
 */
import { test, expect } from "@playwright/test";

test("crew-size comparison: matches the spec's own worked example exactly, and shows the panel is collapsed by default", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add labor line" }).click();

  const crewSize = page.getByLabel("Crew size", { exact: true });
  const elapsedHours = page.getByLabel("Elapsed hours", { exact: true });
  await crewSize.fill("3");
  await elapsedHours.fill("8");
  await elapsedHours.blur();
  await page.waitForTimeout(200);
  await expect(page.getByText("= 24.0 person-hours")).toBeVisible();

  // Collapsed by default — no efficiency inputs visible yet.
  await expect(page.getByRole("button", { name: "Compare crew sizes" })).toBeVisible();
  await expect(page.getByLabel("Efficiency, 2-person crew")).toHaveCount(0);

  await page.getByRole("button", { name: "Compare crew sizes" }).click();
  const panel = page.getByText(/Same scope of work/);
  await expect(panel).toBeVisible();

  // At the default 100% efficiency for every crew size, cost is IDENTICAL
  // to the (3-person, 8-hour) baseline — $768.00 — and elapsed time is
  // baseline / crewSize exactly, never a different naive assumption.
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("2 people");
  await expect(rows.nth(0)).toContainText("12.0 hrs");
  await expect(rows.nth(0)).toContainText("$768.00");
  await expect(rows.nth(1)).toContainText("3 people");
  await expect(rows.nth(1)).toContainText("8.0 hrs"); // matches the actual 3-person/8-hour line exactly
  await expect(rows.nth(1)).toContainText("$768.00");
  await expect(rows.nth(2)).toContainText("4 people");
  await expect(rows.nth(2)).toContainText("6.0 hrs");
  await expect(rows.nth(2)).toContainText("$768.00");
});

test("crew-size comparison: lowering a crew size's efficiency below 100% shows it finishing SOONER but costing MORE — never a naive linear assumption", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add labor line" }).click();
  await page.getByLabel("Crew size", { exact: true }).fill("3");
  await page.getByLabel("Elapsed hours").fill("8");
  await page.getByLabel("Elapsed hours").blur();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Compare crew sizes" }).click();

  const efficiency4 = page.getByLabel("Efficiency, 4-person crew");
  await efficiency4.fill("90");
  await efficiency4.blur();
  await page.waitForTimeout(200);

  const rows = page.locator("table tbody tr");
  const fourPersonRow = rows.nth(2);
  await expect(fourPersonRow).toContainText("4 people");
  // Hand: 24 / 0.90 = 26.67 total person-hours -> 26.67/4 = 6.7 hrs elapsed
  // (faster than 8.0 baseline, but NOT the naive 24/4=6.0 hrs a linear
  // assumption would show) and 26.67 x $32.00 = $853.33 (MORE than $768.00).
  await expect(fourPersonRow).toContainText("6.7 hrs");
  await expect(fourPersonRow).toContainText("$853.33");
});

test("crew-size comparison: an invalid (zero/negative) efficiency is rejected inline, never silently accepted", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add labor line" }).click();
  await page.getByLabel("Crew size", { exact: true }).fill("3");
  await page.getByLabel("Elapsed hours").fill("8");
  await page.getByLabel("Elapsed hours").blur();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Compare crew sizes" }).click();

  const efficiency2 = page.getByLabel("Efficiency, 2-person crew");
  await efficiency2.fill("-10");
  await efficiency2.blur();
  await page.waitForTimeout(200);
  // The invalid draft is discarded on blur — the field reverts to its last
  // valid value (100), never committing a negative efficiency.
  await expect(efficiency2).toHaveValue("100");
});

test("crew-size comparison: the panel only appears once the labor line actually has a nonzero scope of work", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add labor line" }).click();
  // Freshly added: crewSize=1, elapsedHours=0 -> 0 person-hours -> no panel yet.
  await expect(page.getByText("= 0.0 person-hours")).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare crew sizes" })).toHaveCount(0);

  await page.getByLabel("Elapsed hours").fill("4");
  await page.getByLabel("Elapsed hours").blur();
  await page.waitForTimeout(200);
  await expect(page.getByRole("button", { name: "Compare crew sizes" })).toBeVisible();
});

test("crew-size comparison: keyboard-operable — Tab to the toggle, Enter to expand, Tab into an efficiency field", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add labor line" }).click();
  await page.getByLabel("Crew size", { exact: true }).fill("3");
  await page.getByLabel("Elapsed hours").fill("8");
  await page.getByLabel("Elapsed hours").blur();
  await page.waitForTimeout(200);

  const toggle = page.getByRole("button", { name: "Compare crew sizes" });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Efficiency, 2-person crew")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Enter"); // collapses again
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("crew-size comparison: never mutates the actual labor line or the estimate's own totals — it's a pure what-if", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add labor line" }).click();
  await page.getByLabel("Crew size", { exact: true }).fill("3");
  await page.getByLabel("Elapsed hours").fill("8");
  await page.getByLabel("Elapsed hours").blur();
  await page.waitForTimeout(200);

  const summaryBefore = await page.locator('dl[aria-live="polite"]').innerText();

  await page.getByRole("button", { name: "Compare crew sizes" }).click();
  const efficiency4 = page.getByLabel("Efficiency, 4-person crew");
  await efficiency4.fill("75");
  await efficiency4.blur();
  await page.waitForTimeout(200);

  // The actual crew-size/elapsed-hours FIELDS on the real labor line are
  // completely unaffected by anything typed into the scenario panel.
  await expect(page.getByLabel("Crew size", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Elapsed hours")).toHaveValue("8");
  // And the estimate's own summary totals never move either.
  const summaryAfter = await page.locator('dl[aria-live="polite"]').innerText();
  expect(summaryAfter).toBe(summaryBefore);
});
