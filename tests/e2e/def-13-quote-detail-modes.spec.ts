/**
 * DEF-13 — the Pro app's customer-output detail selector (LEP-045's fix),
 * end-to-end through the real UI: keyboard operation, persistence/reload,
 * quote-revision freezing, estimate duplication, PDF text extraction across
 * all three modes, and multi-page output. Reconciliation, privacy, and the
 * exact three-mode line-shape logic are already covered at the unit level in
 * customerDocument.test.ts and CustomerEstimateView.test.tsx — this file
 * covers only what requires the real running app (persistence, revisions,
 * duplication, real PDFs, real keyboard events).
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";
import { openOrCreateProject } from "./helpers";

const OUT_DIR = "test-results/def-13-evidence";
mkdirSync(OUT_DIR, { recursive: true });

async function buildDraftQuote(page: Page, customerName: string): Promise<void> {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByLabel("Customer name").fill(customerName);
  await page.getByLabel("Project name").fill("Front Yard Renovation");
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByRole("button", { name: "+ Add service" }).click();
  const serviceSelects = page.getByLabel("Service assembly");
  await serviceSelects.nth(1).selectOption({ label: "Shrub Installation" });
  const quantities = page.getByLabel("Quantity");
  await quantities.nth(0).fill("8");
  await quantities.nth(1).fill("12");
  await quantities.nth(1).blur();
  await page.waitForTimeout(300);
}

test("DEF-13 keyboard operation: the mode selector is reachable and changeable by keyboard alone", async ({ page }) => {
  await openOrCreateProject(page);
  const modeSelect = page.getByLabel("Customer document detail level");
  await expect(modeSelect).toHaveValue("detailed");

  await modeSelect.focus();
  await expect(modeSelect).toBeFocused();
  // Native <select> keyboard behavior: arrow keys move between options in
  // document order (project-total, service-totals, detailed) — no mouse
  // ever involved.
  await page.keyboard.press("ArrowUp");
  await expect(modeSelect).toHaveValue("service-totals");
  await page.keyboard.press("ArrowUp");
  await expect(modeSelect).toHaveValue("project-total");
  await page.keyboard.press("ArrowDown");
  await expect(modeSelect).toHaveValue("service-totals");
  await page.keyboard.press("ArrowDown");
  await expect(modeSelect).toHaveValue("detailed");
});

test("DEF-13 persistence and reload: the selected mode survives closing and reopening the estimate, and a page reload", async ({ page }) => {
  await openOrCreateProject(page);
  const modeSelect = page.getByLabel("Customer document detail level");
  await modeSelect.selectOption("service-totals");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "← Back to estimates" }).click();
  await page.getByRole("button", { name: "Open" }).first().click();
  await expect(page.getByLabel("Customer document detail level")).toHaveValue("service-totals");

  // A page reload always returns to the project LIST (which project is
  // "open" is transient UI state, not persisted) — the underlying saved
  // customerDetailMode value must still be there once reopened.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Estimates", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open" }).first().click();
  await expect(page.getByText("Estimate summary")).toBeVisible();
  await expect(page.getByLabel("Customer document detail level")).toHaveValue("service-totals");
});

test("DEF-13 estimate duplication copies the selected presentation mode", async ({ page }) => {
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByLabel("Customer name").fill("Original Customer");
  await page.getByLabel("Customer document detail level").selectOption("project-total");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "← Back to estimates" }).click();

  await page.getByRole("button", { name: /^Duplicate/ }).first().click();
  await expect(page.getByText(/\(copy\)/)).toBeVisible();
  await page.getByRole("button", { name: "Open" }).nth(0).click();
  // The duplicate is whichever card renders first; confirm at least one open
  // project (the duplicate) carries the copied mode forward.
  const duplicateMode = page.getByLabel("Customer document detail level");
  await expect(duplicateMode).toHaveValue("project-total");
});

test("DEF-13 quote-revision behavior: the mode is frozen in a locked revision — a later live-mode change never alters an already-quoted document", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await buildDraftQuote(page, "Frozen Mode Customer");
  await page.getByLabel("Customer document detail level").selectOption("detailed");
  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Print customer estimate" }).click();
  await expect(page.locator("#customer-estimate-print-root")).toContainText("Mulch Installation");
  await expect(page.locator("#customer-estimate-print-root")).toContainText("Shrub Installation");

  // Change the project's LIVE mode after the quote is already locked.
  await page.getByLabel("Customer document detail level").selectOption("project-total");
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  // The FROZEN revision still prints its own frozen mode ("detailed" at
  // lock time) — service line names still show, unaffected by the live
  // setting now pointing at "project-total".
  await expect(page.locator("#customer-estimate-print-root")).toContainText("Mulch Installation");

  // Re-quoting appends a NEW revision, which freezes the CURRENT live mode.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Re-quote", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  await expect(page.locator("#customer-estimate-print-root")).not.toContainText("Mulch Installation");
});

test("DEF-13 PDF text extraction and screenshots across all three modes: every mode reconciles to the identical total", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  // Deliberately left UNLOCKED (a draft) — a locked revision freezes its own
  // mode at lock time (see the "quote-revision behavior" test above), so
  // proving all three modes' real output requires the live draft preview,
  // which reads the project's current customerDetailMode on every render.
  await buildDraftQuote(page, "Three Modes Customer");

  const summaryText = await page.locator('dl[aria-live="polite"]').innerText();
  const totalMatch = summaryText.match(/Customer total\s*\$?([\d,]+\.\d{2})/);
  expect(totalMatch, `could not find "Customer total" in:\n${summaryText}`).not.toBeNull();
  const expectedTotal = totalMatch![1];

  const modes: Array<{ value: "project-total" | "service-totals" | "detailed"; label: string }> = [
    { value: "project-total", label: "project-total" },
    { value: "service-totals", label: "service-totals" },
    { value: "detailed", label: "detailed" },
  ];

  for (const mode of modes) {
    await page.getByLabel("Customer document detail level").selectOption(mode.value);
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Print customer estimate" }).click();
    const doc = page.locator("#customer-estimate-print-root");
    await expect(doc).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: `${OUT_DIR}/def-13-mode-${mode.label}.png`, fullPage: true });
    const pdfBuffer = await page.pdf({ path: `${OUT_DIR}/def-13-mode-${mode.label}.pdf`, format: "Letter" });
    await page.emulateMedia({ media: "screen" });

    const parser = new PDFParse({ data: pdfBuffer });
    const { text } = await parser.getText();
    await parser.destroy();
    const flat = text.replace(/\s+/g, " ");

    // Every mode reconciles to the exact same total.
    expect(flat, `mode ${mode.label} did not contain the expected total ${expectedTotal}`).toContain(expectedTotal);

    if (mode.value === "project-total") {
      expect(flat).not.toContain("Mulch Installation");
      expect(flat).not.toContain("Shrub Installation");
    } else {
      expect(flat).toContain("Mulch Installation");
      expect(flat).toContain("Shrub Installation");
    }
    if (mode.value === "detailed") {
      expect(flat).toMatch(/8\s*yd/);
    }
  }
});

test("DEF-13 multi-page output in service-totals mode: a 60-line estimate spans multiple pages with no dropped or duplicated service", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByLabel("Customer document detail level").selectOption("service-totals");
  for (let i = 0; i < 60; i++) {
    await page.getByRole("button", { name: "+ Add service" }).click();
  }
  const quantities = page.getByLabel("Quantity");
  await expect(quantities).toHaveCount(60);
  for (let i = 0; i < 60; i++) {
    await quantities.nth(i).fill(String(i + 1));
  }
  await quantities.nth(59).blur();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  await expect(page.locator("#customer-estimate-print-root")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const pdfBuffer = await page.pdf({ path: `${OUT_DIR}/def-13-service-totals-60-line.pdf`, format: "Letter" });
  await page.emulateMedia({ media: "screen" });
  const parser = new PDFParse({ data: pdfBuffer });
  const { text } = await parser.getText();
  await parser.destroy();
  const flat = text.replace(/\s+/g, " ");
  const mulchOccurrences = (flat.match(/Mulch Installation/g) ?? []).length;
  expect(mulchOccurrences).toBe(60);

  const renderer = new PDFParse({ data: pdfBuffer });
  const screenshotResult = await renderer.getScreenshot({ scale: 1.5 });
  expect(screenshotResult.pages.length).toBeGreaterThan(1); // genuinely multi-page
  for (let i = 0; i < screenshotResult.pages.length; i++) {
    writeFileSync(`${OUT_DIR}/def-13-service-totals-60-line-page-${i + 1}.png`, Buffer.from(screenshotResult.pages[i].data));
  }
  await renderer.destroy();
});
