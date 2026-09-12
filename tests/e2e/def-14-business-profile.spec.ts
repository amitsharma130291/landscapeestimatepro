/**
 * DEF-14 — the Pro app's full business identity/contact fields (LEP-074's
 * fix), end-to-end through the real UI: keyboard/accessibility, invalid
 * email/website behavior, blank-optional-field safety, leading-zero and
 * international addresses, long/Unicode values, HTML/script safety, customer
 * document display (estimate + quote PDFs), backup/restore, and
 * existing-workspace migration. Field-level persistence idempotency and the
 * address-line-joining logic are already covered at the unit level in
 * customerDocument.test.ts — this file covers what requires the real running
 * app (real localStorage, real file import/export, real PDFs, real
 * keyboard events, real migration of a pre-DEF-14 backup file).
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";
import { openOrCreateProject } from "./helpers";

const OUT_DIR = "test-results/def-14-evidence";
mkdirSync(OUT_DIR, { recursive: true });

test("DEF-14 keyboard operation and accessible labels: every new field is reachable and correctly labeled", async ({ page }) => {
  await page.goto("/app/settings/");
  const fields = ["Address line 1", "Address line 2", "City", "State / region", "Postal code", "Country", "Phone", "Email", "Website", "Contractor / license number"];
  for (const label of fields) {
    const input = page.getByLabel(label, { exact: true });
    await expect(input, `field "${label}" has no accessible label`).toBeVisible();
    await input.focus();
    await expect(input).toBeFocused();
  }
  // Tab order reaches every field without getting stuck — spot-check by
  // tabbing from the first field and landing somewhere inside the group.
  await page.getByLabel("Address line 1", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Address line 2", { exact: true })).toBeFocused();
});

test("DEF-14 invalid email/website format: an accessible inline error appears, but the raw text is never rejected or cleared", async ({ page }) => {
  await page.goto("/app/settings/");
  const email = page.getByLabel("Email", { exact: true });
  await email.fill("not-an-email");
  await email.blur();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  const emailErrorId = await email.getAttribute("aria-describedby");
  expect(emailErrorId).toBeTruthy();
  const emailError = page.locator(`#${emailErrorId}`);
  await expect(emailError).toHaveAttribute("role", "alert");
  await expect(emailError).toBeVisible();

  const website = page.getByLabel("Website", { exact: true });
  await website.fill("not a url");
  await website.blur();
  await expect(website).toHaveAttribute("aria-invalid", "true");
  const websiteErrorId = await website.getAttribute("aria-describedby");
  const websiteError = page.locator(`#${websiteErrorId}`);
  await expect(websiteError).toHaveAttribute("role", "alert");

  // The raw (invalid-looking) text still persists across reload — a soft
  // format warning, never a hard block or silent clear.
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("not-an-email");
  await expect(page.getByLabel("Website", { exact: true })).toHaveValue("not a url");

  // Fixing the value clears the error.
  await page.getByLabel("Email", { exact: true }).fill("real@example.com");
  await page.getByLabel("Email", { exact: true }).blur();
  await expect(page.getByLabel("Email", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
});

test("DEF-14 optional blank fields never produce empty punctuation or blank rows on the customer document", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/app/settings/");
  await page.getByLabel("Business name", { exact: true }).fill("Minimal Fields Co.");
  await page.getByLabel("Business name", { exact: true }).blur();
  await page.getByLabel("Address line 1", { exact: true }).fill("100 Main St");
  await page.getByLabel("Address line 1", { exact: true }).blur();
  await page.getByLabel("City", { exact: true }).fill("Portland");
  await page.getByLabel("City", { exact: true }).blur();
  // Address line 2, State, Postal, Country, Phone, Website, License all left
  // BLANK — only city (no state/postal) is filled alongside line 1.
  await page.waitForTimeout(300);

  await openOrCreateProject(page);
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByLabel("Quantity").first().fill("2");
  await page.getByLabel("Quantity").first().blur();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const doc = page.locator("#customer-estimate-print-root");
  await expect(doc).toBeVisible();
  const docText = await doc.innerText();

  expect(docText).toContain("100 Main St");
  // The city/state/postal line is its own single clean line — no stray
  // leading/trailing comma or double-space baked in from the blank
  // state/postal code (checked per-line, since innerText legitimately
  // inserts blank lines BETWEEN separate paragraphs).
  const lines = docText.split("\n").map((l) => l.trim()).filter(Boolean);
  const cityLine = lines.find((l) => l.includes("Portland"));
  expect(cityLine).toBe("Portland");
  // No "License #" line at all when the license number was never set.
  expect(docText).not.toContain("License #");
});

test("DEF-14 leading-zero postal code and a non-US international address both round-trip and print exactly", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/app/settings/");
  await page.getByLabel("Postal code", { exact: true }).fill("02134");
  await page.getByLabel("Postal code", { exact: true }).blur();
  await page.waitForTimeout(300);
  await page.reload();
  // Never coerced to the number 2134 — the leading zero survives exactly.
  await expect(page.getByLabel("Postal code", { exact: true })).toHaveValue("02134");

  // A non-US address: no state/region, a non-numeric postal code, and a
  // named country — no US-only shape is assumed anywhere in the form.
  await page.getByLabel("Business name", { exact: true }).fill("London Landscaping Ltd.");
  await page.getByLabel("Business name", { exact: true }).blur();
  await page.getByLabel("Address line 1", { exact: true }).fill("10 Downing Street");
  await page.getByLabel("Address line 1", { exact: true }).blur();
  await page.getByLabel("City", { exact: true }).fill("London");
  await page.getByLabel("City", { exact: true }).blur();
  await page.getByLabel("State / region", { exact: true }).fill("");
  await page.getByLabel("Postal code", { exact: true }).fill("SW1A 2AA");
  await page.getByLabel("Postal code", { exact: true }).blur();
  await page.getByLabel("Country", { exact: true }).fill("United Kingdom");
  await page.getByLabel("Country", { exact: true }).blur();
  await page.waitForTimeout(300);

  await openOrCreateProject(page);
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByLabel("Quantity").first().fill("2");
  await page.getByLabel("Quantity").first().blur();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const doc = page.locator("#customer-estimate-print-root");
  const docText = await doc.innerText();
  expect(docText).toContain("10 Downing Street");
  expect(docText).toContain("London SW1A 2AA");
  expect(docText).toContain("United Kingdom");
});

test("DEF-14 long values and Unicode survive save/reload and multi-page print without truncation or corruption", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  const longAddress = "Suite 4400, The Exceptionally Long Commercial Tower at Greater Metropolitan Business Park";
  const unicodeBusinessName = "Café Verde Landscaping & Jardinería — 覆盖物专家 Co.";
  await page.goto("/app/settings/");
  await page.getByLabel("Business name", { exact: true }).fill(unicodeBusinessName);
  await page.getByLabel("Business name", { exact: true }).blur();
  await page.getByLabel("Address line 1", { exact: true }).fill(longAddress);
  await page.getByLabel("Address line 1", { exact: true }).blur();
  await page.getByLabel("Website", { exact: true }).fill("www.exceptionally-long-domain-name-for-a-landscaping-company.example.com");
  await page.getByLabel("Website", { exact: true }).blur();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(unicodeBusinessName);
  await expect(page.getByLabel("Address line 1", { exact: true })).toHaveValue(longAddress);

  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  for (let i = 0; i < 40; i++) {
    await page.getByRole("button", { name: "+ Add service" }).click();
  }
  const quantities = page.getByLabel("Quantity");
  await expect(quantities).toHaveCount(40);
  for (let i = 0; i < 40; i++) {
    await quantities.nth(i).fill(String(i + 1));
  }
  await quantities.nth(39).blur();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  await expect(page.locator("#customer-estimate-print-root")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const pdfBuffer = await page.pdf({ path: `${OUT_DIR}/def-14-long-unicode-multipage.pdf`, format: "Letter" });
  await page.emulateMedia({ media: "screen" });
  const parser = new PDFParse({ data: pdfBuffer });
  const { text } = await parser.getText();
  await parser.destroy();
  const flat = text.replace(/\s+/g, " ");
  expect(flat).toMatch(/Caf.\s*Verde\s*Landscaping/);
  expect(flat).toMatch(/Jardiner.a/);
  expect(flat).toContain("覆盖物专家");
  expect(flat).toMatch(/Exceptionally\s*Long\s*Commercial\s*Tower/);

  const renderer = new PDFParse({ data: pdfBuffer });
  const screenshotResult = await renderer.getScreenshot({ scale: 1.5 });
  expect(screenshotResult.pages.length).toBeGreaterThan(1);
  await renderer.destroy();
});

test("DEF-14 HTML/script characters in business fields are never executed and render as literal text", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/app/settings/");
  const payload = '<script>window.__xss = true;</script><img src=x onerror="window.__xss2=true">';
  await page.getByLabel("Address line 1", { exact: true }).fill(payload);
  await page.getByLabel("Address line 1", { exact: true }).blur();
  await page.getByLabel("Contractor / license number", { exact: true }).fill('"><script>window.__xss3=true</script>');
  await page.getByLabel("Contractor / license number", { exact: true }).blur();
  await page.waitForTimeout(300);

  await openOrCreateProject(page);
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByLabel("Quantity").first().fill("2");
  await page.getByLabel("Quantity").first().blur();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const doc = page.locator("#customer-estimate-print-root");
  await expect(doc).toBeVisible();

  const executed = await page.evaluate(() => (window as unknown as { __xss?: boolean; __xss2?: boolean; __xss3?: boolean }).__xss ?? (window as unknown as { __xss2?: boolean }).__xss2 ?? (window as unknown as { __xss3?: boolean }).__xss3 ?? false);
  expect(executed).toBe(false);
  // Never parsed as markup in the page that generated the print output.
  const pageHtml = await page.content();
  expect(pageHtml).not.toContain("<script>window.__xss = true;</script>");
  // The literal text still reaches the document, unescaped-looking but inert.
  const docText = await doc.innerText();
  expect(docText).toContain("<script>");
});

test("DEF-14 customer preview, Estimate PDF, and Quote PDF all display the full business identity", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/app/settings/");
  await page.getByLabel("Business name", { exact: true }).fill("Full Profile Landscaping");
  await page.getByLabel("Business name", { exact: true }).blur();
  await page.getByLabel("Address line 1", { exact: true }).fill("55 Garden Way");
  await page.getByLabel("Address line 1", { exact: true }).blur();
  await page.getByLabel("City", { exact: true }).fill("Boise");
  await page.getByLabel("City", { exact: true }).blur();
  await page.getByLabel("State / region", { exact: true }).fill("ID");
  await page.getByLabel("State / region", { exact: true }).blur();
  await page.getByLabel("Postal code", { exact: true }).fill("83702");
  await page.getByLabel("Postal code", { exact: true }).blur();
  await page.getByLabel("Phone", { exact: true }).fill("208-555-0142");
  await page.getByLabel("Phone", { exact: true }).blur();
  await page.getByLabel("Email", { exact: true }).fill("hello@fullprofile.example.com");
  await page.getByLabel("Email", { exact: true }).blur();
  await page.getByLabel("Contractor / license number", { exact: true }).fill("LIC-00042");
  await page.getByLabel("Contractor / license number", { exact: true }).blur();
  await page.waitForTimeout(300);

  // Estimate PDF — draft, not yet quoted.
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByLabel("Quantity").first().fill("3");
  await page.getByLabel("Quantity").first().blur();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const estimateDoc = page.locator("#customer-estimate-print-root");
  const estimateText = await estimateDoc.innerText();
  for (const expected of ["Full Profile Landscaping", "55 Garden Way", "Boise, ID 83702", "208-555-0142", "hello@fullprofile.example.com", "License #LIC-00042"]) {
    expect(estimateText, `Estimate PDF preview missing "${expected}"`).toContain(expected);
  }
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${OUT_DIR}/def-14-estimate.pdf` });
  await page.emulateMedia({ media: "screen" });

  // Quote PDF — the SAME project, now locked into a quote revision.
  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print customer estimate" }).click();
  const quoteDoc = page.locator("#customer-estimate-print-root");
  const quoteText = await quoteDoc.innerText();
  for (const expected of ["Full Profile Landscaping", "55 Garden Way", "Boise, ID 83702", "208-555-0142", "hello@fullprofile.example.com", "License #LIC-00042"]) {
    expect(quoteText, `Quote PDF preview missing "${expected}"`).toContain(expected);
  }
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${OUT_DIR}/def-14-quote.pdf` });
  await page.emulateMedia({ media: "screen" });
});

test("DEF-14 backup and restore round-trips every new business field exactly", async ({ page }) => {
  await page.goto("/app/settings/");
  const fields: Record<string, string> = {
    "Business name": "Backup Restore Co.",
    "Address line 1": "9 Nursery Ln",
    "Address line 2": "Bldg B",
    City: "Denver",
    "State / region": "CO",
    "Postal code": "80202",
    Country: "United States",
    Phone: "303-555-0100",
    Email: "team@backuprestoreco.example.com",
    Website: "www.backuprestoreco.example.com",
    "Contractor / license number": "CO-LIC-9981",
  };
  for (const [label, value] of Object.entries(fields)) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.blur();
  }
  await page.waitForTimeout(300);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace (JSON)" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  const exported = JSON.parse(readFileSync(backupPath!, "utf-8"));
  for (const [label, value] of Object.entries(fields)) {
    void label;
    expect(Object.values(exported.business)).toContain(value);
  }

  await page.getByRole("button", { name: "Reset workspace" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset workspace" }).click();
  await page.waitForTimeout(300);
  await expect(page.getByLabel("Business name", { exact: true })).not.toHaveValue("Backup Restore Co.");

  const fileInput = page.locator('input[type="file"][accept="application/json"]');
  await fileInput.setInputFiles(backupPath!);
  await expect(page.getByText(/restored from backup/i)).toBeVisible();

  for (const [label, value] of Object.entries(fields)) {
    await expect(page.getByLabel(label, { exact: true }), `field "${label}" did not restore`).toHaveValue(value);
  }
});

test("DEF-14 existing-workspace migration: importing a pre-DEF-14 legacy backup loses no data, and the new fields start blank rather than crashing", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "lep-def14-migration-"));
  const legacyPath = join(dir, "legacy-v4.json");
  // A real pre-DEF-14 v4 schema workspace: fully dollar-denominated money
  // fields, a business name, but NONE of the new address/contact fields —
  // exactly what a contractor's existing backup file looks like today.
  const legacyWorkspace = {
    version: 4,
    business: {
      businessName: "Legacy Contractor Co.",
      loadedLaborRate: 30,
      laborRateBasis: "already-loaded",
      overheadPercent: 12,
      targetMarginPercent: 30,
      defaultDeliveryCost: 100,
      minimumProjectPrice: 400,
      roundingIncrement: 1,
      taxRatePercent: 0,
    },
    materials: [{ id: "m1", name: "Legacy Mulch", unitCost: 40, unit: "yd3" }],
    equipment: [],
    assemblies: [],
    projects: [],
    templates: [],
  };
  writeFileSync(legacyPath, JSON.stringify(legacyWorkspace));

  await page.goto("/app/settings/");
  const fileInput = page.locator('input[type="file"][accept="application/json"]');
  await fileInput.setInputFiles(legacyPath);
  await expect(page.getByText(/restored from backup/i)).toBeVisible();

  // No data lost from the legacy file.
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Legacy Contractor Co.");

  // The new fields exist, are empty (never crash on a missing legacy
  // field), and are immediately usable — proving forward migration
  // compatibility, not just tolerance.
  await expect(page.getByLabel("Address line 1", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await page.getByLabel("Address line 1", { exact: true }).fill("1 New Field St");
  await page.getByLabel("Address line 1", { exact: true }).blur();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Legacy Contractor Co.");
  await expect(page.getByLabel("Address line 1", { exact: true })).toHaveValue("1 New Field St");

  await page.goto("/app/catalog/");
  await expect(page.locator('input[id*="mat-name-"]').first()).toHaveValue("Legacy Mulch");
});
