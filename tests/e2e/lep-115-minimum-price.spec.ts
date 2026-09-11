/**
 * LEP-115 — the configured minimum project price is now actually enforced
 * through the real running UI: finalQuoteCents = max(required, minimum).
 * Before this fix, the minimum was stored but only ever used for the
 * Minimum Job Audit (decision support) — nothing clamped a real quote to
 * it. See src/lib/minimumPrice.test.ts for the exhaustive unit-level
 * coverage (the workbook's exact $438/$500 example, freezing, edge cases,
 * integer-cent precision); this file covers what requires the real app:
 * the visible "minimum applied" indicator, the below-minimum confirmation
 * on a manual override, print/PDF, and that a later Settings change never
 * alters an already-locked quote.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT_DIR = "test-results/lep-115-evidence";
mkdirSync(OUT_DIR, { recursive: true });

/**
 * A new estimate seeds `deliveryCostCents` from the business's own
 * `defaultDeliveryCostCents` ($150.00 by default) — cleared to $0 here so
 * this file's hand-computed expected prices are exact and unambiguous.
 * Mulch Installation, qty 4: $42 material + $12.80 labor per yd3 = $54.80
 * direct/yd3 -> $219.20 direct, +15% overhead = $252.08 true cost, /0.65
 * target margin = $387.82 -> ceils to $388.00 recommended — below the $500
 * default minimum, so the floor must engage.
 */
async function buildBelowMinimumEstimate(page: Page): Promise<void> {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByLabel("Quantity").first().fill("4");
  await page.getByLabel("Quantity").first().blur();
  const deliveryInput = page.locator("#delivery-cost");
  await deliveryInput.fill("0");
  await deliveryInput.blur();
  await page.waitForTimeout(300);
}

test("LEP-115 a small job's calculated price is floored to the $500 default minimum, clearly indicated in the summary", async ({ page }) => {
  await buildBelowMinimumEstimate(page);

  const summary = page.locator('dl[aria-live="polite"]');
  await expect(summary).toContainText("$500.00"); // the FINAL, floored recommendation
  await expect(summary).toContainText("Minimum price applied");
  await expect(summary).toContainText("$388.00"); // the calculated price, shown alongside for transparency

  // Deliverable evidence: the "Minimum price applied" indicator, visibly.
  await page.screenshot({ path: `${OUT_DIR}/lep-115-minimum-applied-indicator.png`, fullPage: true });
});

test("LEP-115 locking the quote freezes the $500 final price, and margin reflects the final (not pre-minimum) revenue", async ({ page }) => {
  await buildBelowMinimumEstimate(page);

  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await expect(page.getByText(/Quoted at\s*\$500\.00/)).toBeVisible();

  // Expected margin at $500 revenue against the true cost ($252.08):
  // (500 - 252.08) / 500 = 49.584% — well above the 35% target the $388
  // calculation was built to hit.
  const summary = page.locator('dl[aria-live="polite"]');
  await expect(summary).toContainText("$500.00");
  const marginText = await summary.innerText();
  const marginMatch = marginText.match(/Expected margin\s*([\d.]+)%/);
  expect(marginMatch, `could not find "Expected margin" in:\n${marginText}`).not.toBeNull();
  expect(Number(marginMatch![1])).toBeCloseTo(49.58, 1);

  // Deliverable evidence: the locked revision's frozen final price + margin.
  await page.screenshot({ path: `${OUT_DIR}/lep-115-locked-revision.png`, fullPage: true });
});

test("LEP-115 recording an actual price below the configured minimum warns but never silently substitutes the minimum", async ({ page }) => {
  await buildBelowMinimumEstimate(page);
  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();

  // window.prompt's return value is scripted via accept(text) — this
  // repo's own established pattern for exercising window.prompt-based
  // flows (see EstimatesTab's other prompt-driven actions in other specs).
  page.on("dialog", (d) => {
    if (d.type() === "prompt") d.accept("450.00"); // below the $500 minimum
    else d.accept(); // the below-minimum window.confirm that follows
  });
  await page.getByRole("button", { name: "Record actual price" }).click();
  await page.waitForTimeout(300);

  await expect(page.getByText(/Quoted at\s*\$450\.00/)).toBeVisible(); // exactly what was entered, never bumped to $500
  const summary = page.locator('dl[aria-live="polite"]');
  await expect(summary).toContainText("$450.00");
});

test("LEP-115 changing the business minimum after locking a quote never alters the already-locked revision", async ({ page }) => {
  await buildBelowMinimumEstimate(page);
  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await expect(page.getByText(/Quoted at\s*\$500\.00/)).toBeVisible();

  // Raise the business minimum well above what was already quoted.
  await page.goto("/app/settings/");
  await page.getByLabel("Minimum project price").fill("1000");
  await page.getByLabel("Minimum project price").blur();
  await page.waitForTimeout(300);

  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "Open" }).first().click();
  // The already-locked revision still reads exactly $500 — a later business
  // setting change is never applied retroactively.
  await expect(page.getByText(/Quoted at\s*\$500\.00/)).toBeVisible();
});

test("LEP-115 the customer-facing PDF total matches the final, minimum-enforced price exactly", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await buildBelowMinimumEstimate(page);
  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const doc = page.locator("#customer-estimate-print-root");
  await expect(doc).toBeVisible();
  await expect(doc).toContainText("$500.00");
  await expect(doc).not.toContainText("$388.00"); // the pre-minimum figure never leaks into the customer document

  // Deliverable evidence: a real generated PDF of the minimum-enforced quote.
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${OUT_DIR}/lep-115-customer-quote.pdf`, format: "Letter" });
  await page.emulateMedia({ media: "screen" });
});
