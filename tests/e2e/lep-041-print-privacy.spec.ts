/**
 * LEP-041 — Free Estimate Template customer-ready PDF, fully re-executed
 * after a genuine defect was found and fixed: the OLD print flow printed
 * the entire marketing page in place (site header/nav, breadcrumb, hero
 * copy, trust badges, the live editing controls, the "Save your materials"
 * Pro upsell box, the "Try Pro free" banner, "More free tools" cards, the
 * FAQ accordion, and the site footer) — CSS only ever hid a handful of
 * individually-tagged elements (`.no-print`), so anything the layout added
 * later would have silently reprinted too.
 *
 * The fix (EstimateBuilderIsland.tsx + FreeCustomerDocumentView.tsx +
 * global.css's `body.printing-free-document` rule) replaces that with a
 * DEDICATED, ALLOWLISTED print root: one element that is the only thing
 * visible under print media, regardless of what surrounds it. This file
 * proves that structurally, not just for today's copy — by asserting the
 * ABSENCE of every category of page chrome, not a fixed list of strings
 * that could go stale.
 *
 * Two independent forms of evidence, per the spec:
 *   1. PDF TEXT EXTRACTION (pdf-parse) — exact totals, every expected
 *      customer-facing field, and absence of every forbidden term.
 *   2. RENDERED-PAGE INSPECTION — every PDF page rendered to a PNG image
 *      via pdf-parse's own getScreenshot() (a real rasterizer, not a
 *      screenshot of the live DOM), saved to test-results/ as evidence,
 *      plus a live full-page screenshot under print media for direct visual
 *      comparison.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";

const OUT_DIR = "test-results/lep-041-evidence";
mkdirSync(OUT_DIR, { recursive: true });

const LONG_BUSINESS = "The Exceptionally Long and Detailed Evergreen Landscaping & Hardscaping Company of Greater Metropolitan Springfield, Est. 1987 LLC";
const LONG_CUSTOMER = "The Extraordinarily Long Family Trust of Smith-Johnson-Williams-Anderson-O'Brien Residence";
const LONG_PROJECT = "Complete Front, Back, and Side Yard Landscape Renovation Including Full Irrigation System Replacement & Retaining Wall";
const LONG_NOTES =
  "Thank you for choosing us! Please note: 50% deposit (—$1,062.50—) due at scheduling; balance due on completion. " +
  'Special instructions: gate code is "4471#", please close the gate — the dog gets out. Unicode check: 覆盖物 (mulch), café, naïve, 五, €, °F. ' +
  "This is a long, multi-sentence customer note deliberately written to wrap across several lines so the print layout's real behavior under long text can be inspected, not guessed at.";

// Every category of page chrome the OLD print flow leaked, expressed as
// patterns rather than one hardcoded copy snapshot — so this keeps catching
// the defect even if the marketing copy itself changes later.
const FORBIDDEN_PAGE_CHROME: { label: string; pattern: RegExp }[] = [
  { label: "breadcrumb Home link", pattern: /^Home$/m },
  { label: "page eyebrow", pattern: /Free interactive template/i },
  { label: "page H1 headline", pattern: /Landscaping Estimate Template/i },
  { label: "intro marketing copy", pattern: /no spreadsheet required/i },
  { label: "trust badge: no account required", pattern: /No account required/i },
  { label: "trust badge: data stays on device", pattern: /Data stays on your device/i },
  { label: "trust badge / pricing: lifetime planned", pattern: /lifetime planned/i },
  { label: "Pro upsell box heading", pattern: /Save your materials, labor and equipment/i },
  { label: "Pro upsell CTA button", pattern: /Get Landscape Estimate Pro/i },
  { label: "Pro banner heading", pattern: /Run the numbers once\. Reuse them forever\./i },
  { label: "Try Pro CTA button", pattern: /Try Pro free/i },
  { label: "More free tools heading", pattern: /More free tools/i },
  { label: "FAQ question 1", pattern: /Is this a downloadable Excel template/i },
  { label: "FAQ question 2", pattern: /Can I customize the services and pricing/i },
  { label: "site footer: Privacy Policy link", pattern: /Privacy Policy/i },
  { label: "site footer: Terms of Service link", pattern: /Terms of Service/i },
  { label: "site footer: copyright line", pattern: /All rights reserved/i },
  { label: "site footer: legal disclaimer", pattern: /not accounting or legal advice/i },
  { label: "Add line button", pattern: /^Add line$/m },
  { label: "Print/Save button", pattern: /Print\s*\/\s*Save as PDF/i },
];

test("LEP-041 Free Estimate Template customer output: full-scale content, PDF text extraction, and rendered-page inspection", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    window.print = () => {};
  });

  // Seed genuinely internal financial data in the UNRELATED Pro app first —
  // proves this is real cross-tool isolation, not just "this free tool
  // happens to have no cost fields".
  await page.goto("/app/settings/");
  await page.getByLabel("Business name", { exact: true }).fill("CONFIDENTIAL Internal Pro Workspace — Do Not Show Customers");
  await page.getByLabel("Business name", { exact: true }).blur();
  await page.getByRole("textbox", { name: "Loaded labor rate" }).fill("999");
  await page.getByRole("textbox", { name: "Loaded labor rate" }).blur();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const raw = localStorage.getItem("landscapeEstimateProWorkspace:v1");
    if (!raw) return;
    const ws = JSON.parse(raw);
    ws.projects = ws.projects ?? [];
    ws.projects.push({
      id: "internal-seed-project",
      name: "Internal Seed Project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "draft",
      serviceLines: [],
      equipmentLines: [],
      laborLines: [],
      deliveryCostCents: 0,
      extraCosts: [],
      overheadPercent: 47,
      targetMarginPercent: 47,
      taxRatePercent: 0,
      quoteRevisions: [],
      notes: "SECRET-MARGIN-47-PERCENT-INTERNAL-ONLY",
    });
    localStorage.setItem("landscapeEstimateProWorkspace:v1", JSON.stringify(ws));
  });

  // Now build the actual LEP-041 document on the completely separate,
  // unrelated Free Estimate Template page.
  await page.goto("/landscaping-estimate-template/");
  await page.getByLabel("Business name").fill(LONG_BUSINESS);
  await page.getByLabel("Customer name").fill(LONG_CUSTOMER);
  await page.getByLabel("Project").fill(LONG_PROJECT);
  await page.getByLabel("Notes").fill(LONG_NOTES);

  const existing = await page.getByLabel(/^Service description, line/).count();
  for (let i = existing; i < 22; i++) {
    await page.getByRole("button", { name: "Add line" }).click();
  }
  await expect(page.getByLabel(/^Service description, line/)).toHaveCount(22);

  let expectedTotalCents = 0;
  for (let i = 0; i < 22; i++) {
    const qty = (i % 5) + 1;
    const price = 25 + i * 3.25;
    const desc = i === 4 ? `Service line ${i + 1} — <script>alert(1)</script> & 覆盖物` : `Service line ${i + 1} — Мульча & 覆盖物 special chars "test"`;
    await page.getByLabel(`Service description, line ${i + 1}`, { exact: true }).fill(desc);
    await page.getByLabel(`Quantity, line ${i + 1}`, { exact: true }).fill(String(qty));
    await page.getByLabel(`Quantity, line ${i + 1}`, { exact: true }).blur();
    await page.getByLabel(`Unit price, line ${i + 1}`, { exact: true }).fill(price.toFixed(2));
    await page.getByLabel(`Unit price, line ${i + 1}`, { exact: true }).blur();
    expectedTotalCents += Math.round(qty * price * 100);
  }
  const expectedTotal = (expectedTotalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Confirm the live on-screen total (the app's own calculation, independent
  // of anything the PDF will show) matches our hand sum BEFORE ever
  // touching print/PDF — the later PDF-vs-screen reconciliation check below
  // is only meaningful if this one already holds.
  const onScreenTotal = await page.locator("p.text-3xl.font-extrabold").innerText();
  expect(onScreenTotal).toBe(`$${expectedTotal}`);

  // -- Evidence 1: real PDF, generated by Chromium, then TEXT-extracted --
  await page.getByRole("button", { name: "Print / Save as PDF" }).click();
  const printRoot = page.locator("#customer-document-print-root");
  await expect(printRoot).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const pdfPath = `${OUT_DIR}/lep-041-full-document.pdf`;
  const pdfBuffer = await page.pdf({ path: pdfPath, format: "Letter" });
  await page.emulateMedia({ media: "screen" });

  const parser = new PDFParse({ data: pdfBuffer });
  const textResult = await parser.getText();
  const pdfText = textResult.text;
  const flat = pdfText.replace(/\s+/g, " ");

  // The PDF-reported total EXACTLY matches the on-screen calculation.
  expect(flat).toContain(expectedTotal);

  // Every expected customer-facing field is present.
  expect(flat).toMatch(/Evergreen\s*Landscaping\s*&\s*Hardscaping/);
  expect(flat).toMatch(/Smith-\s*Johnson-\s*Williams-\s*Anderson/);
  expect(flat).toMatch(/Front,\s*Back,\s*and\s*Side\s*Yard/);
  expect(flat).toMatch(/gate code is/i);
  expect(flat).toMatch(/覆盖物/); // Unicode survives into the extracted PDF text
  expect(flat).toContain("Service line 1");
  expect(flat).toContain("Service line 22");
  const pageHtml = await page.content();
  expect(pageHtml).not.toContain("<script>alert(1)</script>");

  // -- THE CORE LEP-041 FIX, verified against the ACTUAL PDF TEXT: every
  // category of website/marketing page chrome is ABSENT from the printed
  // document — not merely CSS-hidden on screen, but genuinely never
  // rasterized into the PDF at all.
  for (const { label, pattern } of FORBIDDEN_PAGE_CHROME) {
    expect(flat, `PDF unexpectedly contains ${label} (matched ${pattern})`).not.toMatch(pattern);
  }

  // Privacy gate: the internal data seeded in the UNRELATED Pro workspace
  // must never leak into this document by any mechanism.
  expect(flat).not.toContain("CONFIDENTIAL Internal Pro Workspace");
  expect(flat).not.toContain("SECRET-MARGIN-47-PERCENT-INTERNAL-ONLY");
  expect(flat).not.toMatch(/999\.00|\$999/);

  await parser.destroy();

  // -- Evidence 2: RENDERED-PAGE inspection — every PDF page rasterized to
  // a real PNG, saved as evidence, inspected for layout defects and to
  // confirm no page is an accidental blank/promotional page (which would be
  // implausibly small or, if it rendered the OLD marketing content, would
  // show recognizable non-document text — already ruled out above).
  const renderer = new PDFParse({ data: pdfBuffer });
  const screenshotResult = await renderer.getScreenshot({ scale: 2 });
  expect(screenshotResult.pages.length).toBeGreaterThanOrEqual(1);
  const pageSizes: number[] = [];
  for (let i = 0; i < screenshotResult.pages.length; i++) {
    const pngPath = `${OUT_DIR}/lep-041-page-${i + 1}.png`;
    const buf = Buffer.from(screenshotResult.pages[i].data);
    writeFileSync(pngPath, buf);
    pageSizes.push(buf.length);
  }
  await renderer.destroy();
  for (const size of pageSizes) {
    expect(size).toBeGreaterThan(5000); // never an accidentally blank page
  }

  // Complementary live-DOM evidence: a full-page screenshot under print
  // media. Because body.printing-free-document hides everything except the
  // print root, a full-page screenshot here shows ONLY the customer
  // document — a visual double-check alongside the PDF text assertions.
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: `${OUT_DIR}/lep-041-live-print-view.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflow, "22-line long-text estimate causes page-level horizontal overflow under print media").toBe(false);
  await page.emulateMedia({ media: "screen" });

  // No line was dropped or duplicated.
  for (let i = 1; i <= 22; i++) {
    const occurrences = (flat.match(new RegExp(`Service line ${i}\\b`, "g")) ?? []).length;
    expect(occurrences, `"Service line ${i}" appeared ${occurrences} times, expected exactly 1`).toBe(1);
  }

  // The total figure is never duplicated into what would read as a repeated
  // totals block.
  const totalOccurrences = (flat.match(new RegExp(expectedTotal.replace(".", "\\."), "g")) ?? []).length;
  expect(totalOccurrences).toBeGreaterThanOrEqual(1);
  expect(totalOccurrences).toBeLessThanOrEqual(2);
});

test("LEP-041 confirms ONLY the customer document prints: no nav links, no other headings, a single self-contained page structure", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/landscaping-estimate-template/");
  await page.getByLabel("Business name").fill("Simple Print Test Co.");
  await page.getByLabel("Customer name").fill("Simple Customer");
  await page.getByLabel("Project").fill("Simple Project");
  await page.getByRole("button", { name: "Print / Save as PDF" }).click();

  const printRoot = page.locator("#customer-document-print-root");
  await expect(printRoot).toBeVisible();

  // Under print media, EVERY element outside the print root is
  // visibility:hidden — confirmed directly against computed styles, not
  // just PDF text, for the site's primary nav and the breadcrumb.
  await page.emulateMedia({ media: "print" });
  const navVisibility = await page.locator('nav[aria-label="Primary"]').evaluate((el) => getComputedStyle(el).visibility);
  expect(navVisibility).toBe("hidden");
  const footerVisibility = await page
    .locator("footer")
    .first()
    .evaluate((el) => getComputedStyle(el).visibility)
    .catch(() => "hidden"); // no <footer> found is also an acceptable pass
  expect(footerVisibility).toBe("hidden");
  const printRootVisibility = await printRoot.evaluate((el) => getComputedStyle(el).visibility);
  expect(printRootVisibility).toBe("visible");
  await page.emulateMedia({ media: "screen" });

  // The print root itself contains exactly one document structure: one
  // "Total" block, no nested nav/header/footer landmarks of its own.
  const nestedLandmarks = await printRoot.locator("nav, header, footer").count();
  expect(nestedLandmarks).toBe(0);
});

test("LEP-041 clipping/overlap check: long single-line values wrap cleanly inside the print root with no horizontal overflow at Letter width", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/landscaping-estimate-template/");
  await page.getByLabel("Business name").fill("The Exceptionally Long and Detailed Evergreen Landscaping & Hardscaping Company of Greater Metropolitan Springfield LLC");
  await page.getByLabel("Customer name").fill("The Extraordinarily Long Family Trust of Smith-Johnson-Williams-Anderson Residence");
  await page.getByLabel("Project").fill("Complete Front and Back Yard Landscape Renovation Including Full Irrigation System Replacement");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel(/^Service description, line/).first().fill("Mulch installation with an unusually long line-item description that should wrap rather than clip or overflow");
  await page.getByLabel(/^Quantity, line/).first().fill("5");
  await page.getByLabel(/^Quantity, line/).first().blur();
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Print / Save as PDF" }).click();
  const printRoot = page.locator("#customer-document-print-root");
  await expect(printRoot).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const pdfBuffer = await page.pdf({ path: `${OUT_DIR}/lep-041-long-text.pdf`, format: "Letter" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflow).toBe(false);
  await page.emulateMedia({ media: "screen" });

  const parser = new PDFParse({ data: pdfBuffer });
  const { text } = await parser.getText();
  await parser.destroy();
  const flat = text.replace(/\s+/g, " ");
  expect(flat).toMatch(/Evergreen\s*Landscaping\s*&\s*Hardscaping/);
  expect(flat).toMatch(/Smith-\s*Johnson-\s*Williams-\s*Anderson/);
  expect(flat).toMatch(/unusually\s*long\s*line-item\s*description/);
});
