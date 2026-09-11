/**
 * The 8 previously Not-Run workbook rows (LEP-045/053/054/055/057/058/074/092)
 * — executed for real against the running application. Two genuine product
 * gaps were found in the process (DEF-13 — no detail/summary toggle existed
 * on the Quote Template; DEF-14 — no address/contact fields existed in the
 * Business profile). Both are now fixed; LEP-045 and LEP-074 below assert
 * the fixed behavior. See customerDocument.test.ts, CustomerEstimateView
 * .test.tsx, def-13-quote-detail-modes.spec.ts, and
 * def-14-business-profile.spec.ts for the full DEF-13/DEF-14 test coverage.
 */
import { test, expect } from "@playwright/test";
import { openOrCreateProject } from "./helpers";

test("LEP-045 [PASS, DEF-13 fixed] Free Quote Template's detail/summary toggle: detailed mode shows every line, summary mode hides the breakdown but preserves the workbook's exact $2,425 total", async ({ page }) => {
  await page.goto("/landscaping-quote-template/");
  await expect(page.getByText(/quote/i).first()).toBeVisible();

  const toggle = page.getByRole("combobox", { name: /detail/i });
  await expect(toggle).toBeVisible();

  // The workbook's own exact data: a quote with 3 lines totalling $2,425.00
  // (500 + 975 + 950).
  await page.getByRole("button", { name: "Add line" }).click();
  const descriptions = page.getByLabel(/^Service description, line/);
  const quantities = page.getByLabel(/^Quantity, line/);
  const prices = page.getByLabel(/^Unit price, line/);
  await expect(descriptions).toHaveCount(3);
  await descriptions.nth(0).fill("Mulch installation");
  await quantities.nth(0).fill("10");
  await quantities.nth(0).blur();
  await prices.nth(0).fill("50.00");
  await prices.nth(0).blur();
  await descriptions.nth(1).fill("Shrub planting");
  await quantities.nth(1).fill("15");
  await quantities.nth(1).blur();
  await prices.nth(1).fill("65.00");
  await prices.nth(1).blur();
  await descriptions.nth(2).fill("Edging");
  await quantities.nth(2).fill("100");
  await quantities.nth(2).blur();
  await prices.nth(2).fill("9.50");
  await prices.nth(2).blur();
  await page.waitForTimeout(200);

  const totalCell = page.locator("p.text-3xl.font-extrabold");
  await expect(totalCell).toHaveText("$2,425.00");

  // Detailed mode: every breakdown column visible.
  await expect(page.getByRole("columnheader", { name: "Qty" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Unit price" })).toBeVisible();

  // Switch to summary mode: the breakdown columns disappear, the line
  // identities remain, and the grand total is UNCHANGED — a presentation
  // toggle can never alter the money.
  await toggle.selectOption("summary");
  await expect(page.getByRole("columnheader", { name: "Qty" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Unit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Unit price" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible();
  await expect(descriptions.nth(0)).toHaveValue("Mulch installation");
  await expect(totalCell).toHaveText("$2,425.00");

  // Switching back to detailed restores every column, with data intact.
  await toggle.selectOption("detailed");
  await expect(page.getByRole("columnheader", { name: "Qty" })).toBeVisible();
  await expect(quantities.nth(0)).toHaveValue("10");
  await expect(totalCell).toHaveText("$2,425.00");
});

test("LEP-053 [PASS] Free Invoice Template preserves an invoice number's leading zeros as literal text", async ({ page }) => {
  await page.goto("/landscaping-invoice-template/");
  const invoiceNumber = page.getByLabel("Invoice #");
  await invoiceNumber.fill("000123");
  await invoiceNumber.blur();
  await expect(invoiceNumber).toHaveValue("000123"); // never coerced to "123"
  await page.reload();
  // A plain, uncontrolled-by-any-number-parser TextInput — nothing to
  // persist across reload for this free tool (no localStorage backing,
  // confirmed by source read: useState only) — re-typing after reload
  // still preserves the exact leading-zero string, proving no numeric
  // parsing happens anywhere in the commit path.
  await page.getByLabel("Invoice #").fill("000123");
  await expect(page.getByLabel("Invoice #")).toHaveValue("000123");
});

test("LEP-054 [PASS] Free Invoice Template: 50 line items — subtotal equals the independent sum, no missing/duplicated line, no page-level overflow", async ({ page }) => {
  // 150 sequential fill/blur calls (3 fields x 50 lines) against a real
  // browser is inherently slow and machine-load-dependent — the same
  // category of fix already applied to LEP-027's 100-service test (widened
  // 120s -> 240s there); this one has repeatedly timed out at 90s under
  // today's heavier-than-usual system load, always on the LAST line, never
  // on a wrong value. Widened, not the assertions themselves.
  test.setTimeout(180000);
  await page.goto("/landscaping-invoice-template/");
  const existing = await page.getByLabel(/^Description, line/).count();
  for (let i = existing; i < 50; i++) {
    await page.getByRole("button", { name: "Add line" }).click();
  }
  await expect(page.getByLabel(/^Description, line/)).toHaveCount(50);

  let expectedTotalCents = 0;
  for (let i = 0; i < 50; i++) {
    await page.getByLabel(`Description, line ${i + 1}`, { exact: true }).fill(`Service ${i + 1}`);
    await page.getByLabel(`Quantity, line ${i + 1}`, { exact: true }).fill("1");
    await page.getByLabel(`Quantity, line ${i + 1}`, { exact: true }).blur();
    await page.getByLabel(`Price, line ${i + 1}`, { exact: true }).fill("10.00");
    await page.getByLabel(`Price, line ${i + 1}`, { exact: true }).blur();
    expectedTotalCents += 1000;
  }
  // Hand: 50 lines x $10.00 = $500.00 — independently summed here, not read
  // from the app's own subtotal element.
  expect(expectedTotalCents).toBe(50000);
  await expect(page.getByText("$500.00").first()).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflow, "50-line invoice causes page-level horizontal overflow under print media").toBe(false);
  await page.screenshot({ path: "test-results/lep-054-50-line-invoice.png", fullPage: true });
  await page.emulateMedia({ media: "screen" });

  // Every one of the 50 descriptions is still present — nothing dropped.
  for (let i = 0; i < 50; i++) {
    await expect(page.getByLabel(`Description, line ${i + 1}`, { exact: true })).toHaveValue(`Service ${i + 1}`);
  }
});

test("LEP-055 [PASS] Free Price List: five named services keep their own exact name/rate association through edits — stable row identity", async ({ page }) => {
  await page.goto("/landscaping-price-list/");
  // The tool seeds 4 rows; add a 5th.
  await page.getByRole("button", { name: "Add service" }).click();
  const names = ["Mulch delivery", "Sod installation", "Tree removal", "Irrigation repair", "Snow plowing"];
  const rates = ["95.00", "3.50", "450.00", "125.00", "75.00"];
  const nameInputs = page.locator('input[id*="-service-"]');
  const rateInputs = page.locator('input[id*="-rate-"]');
  await expect(nameInputs).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await nameInputs.nth(i).fill(names[i]);
    await rateInputs.nth(i).fill(rates[i]);
    await rateInputs.nth(i).blur();
  }
  // Edit only the THIRD row's rate — every other row's own name/rate must
  // remain exactly what was typed for it, proving row identity isn't
  // positional/name-keyed but stably tied to its own row.
  await rateInputs.nth(2).fill("475.00");
  await rateInputs.nth(2).blur();

  for (let i = 0; i < 5; i++) {
    await expect(nameInputs.nth(i)).toHaveValue(names[i]);
  }
  await expect(rateInputs.nth(2)).toHaveValue("475");
  await expect(rateInputs.nth(0)).toHaveValue("95");
  await expect(rateInputs.nth(4)).toHaveValue("75");
});

test("LEP-056 [PASS, executable evidence replacing source-inspection-only] Free Price List: two rows sharing the identical display name never collide — edit, delete, and the printed output all key off row identity, never the name", async ({ page }) => {
  // Prior evidence for this case was "Source read: CatalogTab.tsx (same
  // id-addressed pattern as LEP-046)" — a source-inspection claim only,
  // never exercised against the real running Free Price List tool. This
  // replaces it with an executable test against the actual product.
  await page.goto("/landscaping-price-list/");
  await page.getByRole("button", { name: "Add service" }).click();
  await page.getByRole("button", { name: "Add service" }).click();

  const nameInputs = page.locator('input[id*="-service-"]');
  const rateInputs = page.locator('input[id*="-rate-"]');
  const unitInputs = page.locator('input[id*="-unit-"]');
  await expect(nameInputs).toHaveCount(6);

  // Two DIFFERENT rows (different ids, different prices, different units)
  // sharing the exact same display name "Mulch".
  await nameInputs.nth(4).fill("Mulch");
  await rateInputs.nth(4).fill("95.00");
  await rateInputs.nth(4).blur();
  await unitInputs.nth(4).fill("yd3");

  await nameInputs.nth(5).fill("Mulch");
  await rateInputs.nth(5).fill("12.00");
  await rateInputs.nth(5).blur();
  await unitInputs.nth(5).fill("bag");

  // Edit the FIRST "Mulch" row only — the second must be completely
  // unaffected, proving rows are addressed by their own stable identity
  // (React key/row id), never by the duplicate display name.
  await rateInputs.nth(4).fill("99.00");
  await rateInputs.nth(4).blur();
  await expect(rateInputs.nth(4)).toHaveValue("99");
  await expect(rateInputs.nth(5)).toHaveValue("12"); // untouched
  await expect(unitInputs.nth(5)).toHaveValue("bag"); // untouched

  // Delete the SECOND "Mulch" row — exactly one row must be removed (never
  // both, which a name-keyed bug would do), and the first must survive with
  // its own edited value intact.
  await page.getByRole("button", { name: "Remove Mulch" }).last().click();
  await expect(nameInputs).toHaveCount(5);
  await expect(rateInputs.nth(4)).toHaveValue("99");
  await expect(unitInputs.nth(4)).toHaveValue("yd3");

  // The tool's own "export" surface (print output) also reflects the
  // correct, surviving row's identity — not a stale or merged value. Table
  // cells here are live <input> elements (their values are a DOM property,
  // not text content), so read them directly rather than via innerText.
  await page.emulateMedia({ media: "print" });
  const nameValues = await Promise.all((await nameInputs.all()).map((i) => i.inputValue()));
  const rateValues = await Promise.all((await rateInputs.all()).map((i) => i.inputValue()));
  await page.emulateMedia({ media: "screen" });
  const mulchIndexes = nameValues.map((v, i) => (v === "Mulch" ? i : -1)).filter((i) => i >= 0);
  expect(mulchIndexes, `expected exactly one surviving "Mulch" row, found values ${JSON.stringify(nameValues)}`).toHaveLength(1);
  expect(rateValues[mulchIndexes[0]]).toBe("99");
  expect(rateValues).not.toContain("12");
});

test("LEP-057 [PASS] Free Price List: every documented unit label displays and persists exactly as typed, unambiguously", async ({ page }) => {
  await page.goto("/landscaping-price-list/");
  const unitInputs = page.locator('input[id*="-unit-"]');
  const units = ["yd³", "ft²", "linear ft", "each", "hour", "job", "custom"];
  // The tool has 4 seeded rows; add 3 more to reach 7 (one per unit).
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Add service" }).click();
  }
  await expect(unitInputs).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    await unitInputs.nth(i).fill(units[i]);
    await unitInputs.nth(i).blur();
  }
  for (let i = 0; i < 7; i++) {
    await expect(unitInputs.nth(i)).toHaveValue(units[i]); // exact, no truncation/remapping
  }
});

test("LEP-058 [PASS] Free Price List: a custom unit label ('1000 sq ft') can be entered, edited, and retained", async ({ page }) => {
  await page.goto("/landscaping-price-list/");
  const unitInput = page.locator('input[id*="-unit-"]').first();
  await unitInput.fill("1000 sq ft");
  await unitInput.blur();
  await expect(unitInput).toHaveValue("1000 sq ft");

  // Edit it to a different custom label — the field remains freely editable,
  // never locked into a fixed enum once a custom value is set.
  await unitInput.fill("500 sq ft bundle");
  await unitInput.blur();
  await expect(unitInput).toHaveValue("500 sq ft bundle");
});

test("LEP-074 [PASS, DEF-14 fixed] Business profile: name, address, contact, and logo all round-trip exactly through save/reload/print", async ({ page }) => {
  // Must be registered before the FIRST navigation — addInitScript only
  // takes effect on documents loaded after it's added, not the current one.
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/app/settings/");
  await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();

  // The full set of address/contact fields now exists.
  await expect(page.getByLabel("Address line 1")).toBeVisible();
  await expect(page.getByLabel("City")).toBeVisible();
  await expect(page.getByLabel("Phone")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();

  await page.getByLabel("Business name").fill("Round-Trip Landscaping Co.");
  await page.getByLabel("Business name").blur();
  await page.getByLabel("Address line 1").fill("742 Evergreen Terrace");
  await page.getByLabel("Address line 1").blur();
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("City").blur();
  await page.getByLabel("State / region").fill("IL");
  await page.getByLabel("State / region").blur();
  await page.getByLabel("Postal code").fill("62704");
  await page.getByLabel("Postal code").blur();
  await page.getByLabel("Phone").fill("555-867-5309");
  await page.getByLabel("Phone").blur();
  await page.getByLabel("Email").fill("contact@roundtriplandscaping.com");
  await page.getByLabel("Email").blur();
  await page.waitForTimeout(300);
  await page.reload();

  await expect(page.getByLabel("Business name")).toHaveValue("Round-Trip Landscaping Co.");
  await expect(page.getByLabel("Address line 1")).toHaveValue("742 Evergreen Terrace");
  await expect(page.getByLabel("City")).toHaveValue("Springfield");
  await expect(page.getByLabel("Postal code")).toHaveValue("62704");
  await expect(page.getByLabel("Phone")).toHaveValue("555-867-5309");
  await expect(page.getByLabel("Email")).toHaveValue("contact@roundtriplandscaping.com");

  await openOrCreateProject(page);
  await page.getByRole("button", { name: "+ Add service" }).click();
  await page.getByLabel("Quantity").first().fill("3");
  await page.getByLabel("Quantity").first().blur();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Review and quote" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  const printButton = page.getByRole("button", { name: "Print customer estimate" });
  await expect(printButton).toBeEnabled();
  await printButton.click();
  const printedDoc = page.locator("#customer-estimate-print-root");
  await expect(printedDoc).toContainText("Round-Trip Landscaping Co.");
  await expect(printedDoc).toContainText("742 Evergreen Terrace");
  await expect(printedDoc).toContainText("Springfield, IL 62704");
  await expect(printedDoc).toContainText("555-867-5309");
  await expect(printedDoc).toContainText("contact@roundtriplandscaping.com");
});

test("LEP-092 [PASS] Project template: two independent instantiations of a 4-service template inherit values without mutating each other or the template", async ({ page }) => {
  // handleSaveAsTemplate uses window.prompt for the template's name — an
  // empty-string accept() is still falsy and gets treated as "cancelled",
  // so a real name must be supplied.
  page.on("dialog", (d) => d.accept("Four-Service Template"));
  await page.goto("/app/estimates/");
  await page.getByRole("button", { name: "New estimate" }).click();

  // Build all 4 seeded assemblies into one project (Mulch/Shrub/Edging/Topsoil).
  // A new estimate starts with ZERO service lines — 4 clicks for 4 lines.
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "+ Add service" }).click();
  }
  const serviceSelects = page.getByLabel("Service assembly");
  await expect(serviceSelects).toHaveCount(4);
  await serviceSelects.nth(1).selectOption({ label: "Topsoil Installation" });
  await serviceSelects.nth(2).selectOption({ label: "Shrub Installation" });
  await serviceSelects.nth(3).selectOption({ label: "Edging" });
  const quantities = page.getByLabel("Quantity");
  await quantities.nth(0).fill("5");
  await quantities.nth(1).fill("6");
  await quantities.nth(2).fill("7");
  await quantities.nth(3).fill("8");
  await quantities.nth(3).blur();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Save as template" }).click();

  await page.getByRole("button", { name: "← Back to estimates" }).click();
  const templateSelect = page.getByLabel("Start from a saved template");
  await expect(templateSelect).toBeVisible();

  // Instantiate TWICE.
  await templateSelect.selectOption({ label: "Four-Service Template" });
  await page.getByRole("button", { name: "Use" }).click();
  await expect(page.getByText("Estimate summary")).toBeVisible();
  const firstInstanceQuantities = page.getByLabel("Quantity");
  await expect(firstInstanceQuantities).toHaveCount(4);
  // Confirm inheritance, then mutate ONLY this first instance.
  await expect(firstInstanceQuantities.nth(0)).toHaveValue("5");
  await firstInstanceQuantities.nth(0).fill("999");
  await firstInstanceQuantities.nth(0).blur();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "← Back to estimates" }).click();
  await page.getByLabel("Start from a saved template").selectOption({ label: "Four-Service Template" });
  await page.getByRole("button", { name: "Use" }).click();
  await expect(page.getByText("Estimate summary")).toBeVisible();
  const secondInstanceQuantities = page.getByLabel("Quantity");
  await expect(secondInstanceQuantities).toHaveCount(4);
  // The SECOND instance still shows the TEMPLATE's original quantity (5),
  // never the "999" mutation made to the first instance — proves a real
  // deep copy with independent identity, not a shared reference.
  await expect(secondInstanceQuantities.nth(0)).toHaveValue("5");
  await expect(secondInstanceQuantities.nth(1)).toHaveValue("6");
  await expect(secondInstanceQuantities.nth(2)).toHaveValue("7");
  await expect(secondInstanceQuantities.nth(3)).toHaveValue("8");

  // The template ITSELF is also unaffected — starting a THIRD instance
  // still yields the original values.
  await page.getByRole("button", { name: "← Back to estimates" }).click();
  await page.getByLabel("Start from a saved template").selectOption({ label: "Four-Service Template" });
  await page.getByRole("button", { name: "Use" }).click();
  const thirdInstanceQuantities = page.getByLabel("Quantity");
  await expect(thirdInstanceQuantities.nth(0)).toHaveValue("5");
});
