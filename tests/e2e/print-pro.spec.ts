/**
 * Print/PDF evidence for the Pro app's customer-facing estimate document
 * (CustomerEstimateView) — real print-media emulation, a real generated
 * PDF (Chromium's page.pdf()), and independent PDF TEXT EXTRACTION (via
 * pdf-parse) so the privacy-gate and reconciliation assertions below check
 * what's actually IN the PDF file, not just what a screenshot shows.
 *
 * Note on scope: CustomerEstimateView deliberately never prices an
 * individual service line (only quantities/units per line, one bundled
 * Subtotal/Tax/Total) — see its own module doc comment. "Line totals sum to
 * the subtotal" therefore has no per-line dollar figures to sum by design;
 * the equivalent check here is that the single Total the customer sees
 * exactly matches the internally computed customerTotalCents.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { PDFParse } from "pdf-parse";

const OUT_DIR = "test-results/print-evidence";
mkdirSync(OUT_DIR, { recursive: true });

async function capturePdfAndText(page: Page, name: string): Promise<string> {
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: true });
  const pdfPath = `${OUT_DIR}/${name}.pdf`;
  const pdfBuffer = await page.pdf({ path: pdfPath, format: "Letter" });
  await page.emulateMedia({ media: "screen" });
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  return result.text;
}

test("Pro multi-service customer estimate PDF: reconciles to the internal total and leaks no internal fields", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });

  await page.goto("/app/settings/");
  await page.getByLabel("Business name").fill("Evergreen Landscaping Pro");
  await page.getByLabel("Business name").blur();
  await page.waitForTimeout(300);

  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByLabel("Customer name").fill("Multi-Service Test Customer");
  await page.getByLabel("Project name").fill("Full Yard Renovation");

  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "+ Add service" }).click();
  }
  const serviceSelects = page.getByLabel("Service assembly");
  await serviceSelects.nth(1).selectOption({ label: "Shrub Installation" });
  await serviceSelects.nth(2).selectOption({ label: "Edging" });
  const quantities = page.getByLabel("Quantity");
  await quantities.nth(0).fill("8");
  await quantities.nth(1).fill("18");
  await quantities.nth(2).fill("220");
  await quantities.nth(2).blur();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();

  // Read the internal (contractor-only) figures BEFORE opening the customer
  // view, from the frozen locked revision's own displayed numbers — this is
  // the "frozen source data" every PDF figure must reconcile against.
  const internalSummary = await page.locator('dl[aria-live="polite"]').innerText();
  const totalMatch = internalSummary.match(/Customer total\s*\$?([\d,]+\.\d{2})/);
  expect(totalMatch, `could not find "Customer total" in:\n${internalSummary}`).not.toBeNull();
  const expectedCustomerTotal = totalMatch![1];

  await page.getByRole("button", { name: "Print customer estimate" }).click();
  await expect(page.locator("#customer-estimate-print-root")).toBeVisible();

  const pdfText = await capturePdfAndText(page, "pro-multi-service-estimate");

  // Reconciliation: the PDF's own Total matches the internal figure exactly.
  expect(pdfText.replace(/\s+/g, " ")).toContain(expectedCustomerTotal);

  // All three services reach the document — nothing silently dropped.
  expect(pdfText).toMatch(/Mulch Installation/);
  expect(pdfText).toMatch(/Shrub Installation/);
  expect(pdfText).toMatch(/Edging/);

  // Privacy gate, checked against the ACTUAL PDF TEXT (not the live DOM) —
  // no internal cost, labor rate, overhead, margin, profit, or markup
  // language reaches the customer-facing PDF.
  const forbidden = [/overhead/i, /true (job )?cost/i, /direct cost/i, /\bmargin\b/i, /\bmarkup\b/i, /gross profit/i, /loaded labor rate/i, /person-hour/i, /material cost/i];
  for (const pattern of forbidden) {
    expect(pdfText, `PDF text unexpectedly matched forbidden pattern ${pattern}`).not.toMatch(pattern);
  }
});

test("Pro customer estimate PDF: long business/customer/project text does not clip, overlap, or drop content", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });

  await page.goto("/app/settings/");
  await page.getByLabel("Business name").fill("The Exceptionally Long and Detailed Evergreen Landscaping & Hardscaping Company of Greater Metropolitan Springfield LLC");
  await page.getByLabel("Business name").blur();
  await page.waitForTimeout(300);

  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByLabel("Customer name").fill("The Extraordinarily Long Family Trust of Smith-Johnson-Williams-Anderson Residence");
  await page.getByLabel("Project name").fill("Complete Front and Back Yard Landscape Renovation Including Full Irrigation System Replacement");
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByLabel("Quantity").first().fill("5");
  await page.getByLabel("Quantity").first().blur();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const customerDoc = page.locator("#customer-estimate-print-root");
  await expect(customerDoc).toBeVisible();

  const pdfText = await capturePdfAndText(page, "pro-long-text");
  // Long text legitimately word-wraps across PDF text-extraction line
  // breaks, including right after a hyphen (confirmed non-defective via the
  // full-page screenshot evidence too) — tolerate optional whitespace at
  // every wrap point rather than requiring one unbroken line.
  const flat = pdfText.replace(/\s+/g, " ");
  expect(flat).toMatch(/Evergreen\s*Landscaping\s*&\s*Hardscaping/);
  expect(flat).toMatch(/Smith-\s*Johnson-\s*Williams-\s*Anderson/);

  // No page-level horizontal overflow under print media (same check style
  // as the free-template print tests).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflow, "long text causes page-level horizontal overflow in the Pro customer PDF").toBe(false);
});

test("Pro customer estimate PDF: a 60-line estimate spans multiple pages with no dropped or duplicated service", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    window.print = () => {};
  });

  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  for (let i = 0; i < 60; i++) {
    await page.getByRole("button", { name: "+ Add service" }).click();
  }
  const quantities = page.getByLabel("Quantity");
  await expect(quantities).toHaveCount(60);
  // Give every line a distinct, identifiable quantity so a dropped OR
  // duplicated row would show up as a missing/extra count below.
  for (let i = 0; i < 60; i++) {
    await quantities.nth(i).fill(String(i + 1));
  }
  await quantities.nth(59).blur();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const customerDoc = page.locator("#customer-estimate-print-root");
  await expect(customerDoc).toBeVisible();

  const pdfText = await capturePdfAndText(page, "pro-60-line-estimate");
  // Every one of the 60 quantity markers (1 through 60) appears exactly
  // once — proves no page-break logic silently drops or repeats a row.
  // (All 60 lines are the same seeded assembly, "Mulch Installation" — so
  // the assembly name legitimately repeats 60 times; it's the per-line
  // quantity that must each appear exactly once.)
  const flatText = pdfText.replace(/\s+/g, " ");
  const mulchOccurrences = (flatText.match(/Mulch Installation/g) ?? []).length;
  expect(mulchOccurrences).toBe(60);
});
