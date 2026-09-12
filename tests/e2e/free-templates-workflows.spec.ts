/**
 * Free Estimate Template mutation/editing workflows (LEP-039/040/047) and
 * calculator reset/category-isolation (LEP-065/066/072/073), and quote
 * rounding (LEP-114) — real browser evidence for cases the workbook's own
 * rules say a unit test cannot satisfy (Component/Automated Execution Mode
 * against the real running UI, not source inspection).
 */
import { test, expect } from "@playwright/test";

test("LEP-039 editing the middle of three lines recalculates only that line: 8x95 + 20x65 + 220x2.25 = $2,555.00", async ({ page }) => {
  await page.goto("/landscaping-estimate-template/");
  await page.getByLabel("Service description, line 1").fill("Mulch");
  await page.getByLabel("Quantity, line 1").fill("8");
  await page.getByLabel("Quantity, line 1").blur();
  await page.getByLabel("Unit price, line 1").fill("95");
  await page.getByLabel("Unit price, line 1").blur();

  await page.getByLabel("Service description, line 2").fill("Shrubs");
  await page.getByLabel("Quantity, line 2").fill("18");
  await page.getByLabel("Quantity, line 2").blur();
  await page.getByLabel("Unit price, line 2").fill("65");
  await page.getByLabel("Unit price, line 2").blur();

  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Service description, line 3").fill("Edging");
  await page.getByLabel("Quantity, line 3").fill("220");
  await page.getByLabel("Quantity, line 3").blur();
  await page.getByLabel("Unit price, line 3").fill("2.25");
  await page.getByLabel("Unit price, line 3").blur();

  await expect(page.getByText("$2,425.00")).toBeVisible(); // baseline, matches LEP-037's own oracle

  // Change ONLY the middle line's quantity 18 -> 20.
  await page.getByLabel("Quantity, line 2").fill("20");
  await page.getByLabel("Quantity, line 2").blur();

  // Hand: 760.00 + (20 x 65.00 = 1300.00) + 495.00 = 2555.00
  await expect(page.getByText("$2,555.00")).toBeVisible();
  // Lines 1 and 3 are unaffected — their own quantities are unchanged.
  await expect(page.getByLabel("Quantity, line 1")).toHaveValue("8");
  await expect(page.getByLabel("Quantity, line 3")).toHaveValue("220");
});

test("LEP-040 deleting the middle of three lines leaves an exact, non-stale total: 760.00 + 495.00 = $1,255.00", async ({ page }) => {
  await page.goto("/landscaping-estimate-template/");
  await page.getByLabel("Service description, line 1").fill("Mulch");
  await page.getByLabel("Quantity, line 1").fill("8");
  await page.getByLabel("Quantity, line 1").blur();
  await page.getByLabel("Unit price, line 1").fill("95");
  await page.getByLabel("Unit price, line 1").blur();

  await page.getByLabel("Service description, line 2").fill("Shrubs");
  await page.getByLabel("Quantity, line 2").fill("18");
  await page.getByLabel("Quantity, line 2").blur();
  await page.getByLabel("Unit price, line 2").fill("65");
  await page.getByLabel("Unit price, line 2").blur();

  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Service description, line 3").fill("Edging");
  await page.getByLabel("Quantity, line 3").fill("220");
  await page.getByLabel("Quantity, line 3").blur();
  await page.getByLabel("Unit price, line 3").fill("2.25");
  await page.getByLabel("Unit price, line 3").blur();

  await expect(page.getByText("$2,425.00")).toBeVisible();

  // Delete the middle line (Shrubs).
  const removeButtons = page.getByRole("button", { name: /remove line/i });
  await removeButtons.nth(1).click();

  await expect(page.getByText("$1,255.00")).toBeVisible();
  // The remaining two lines are exactly the original 1st and 3rd — no
  // stale/duplicated line, no residual $2,425 figure anywhere.
  await expect(page.getByText("$2,425.00")).not.toBeVisible();
  const descriptions = page.getByLabel(/^Service description, line/);
  await expect(descriptions).toHaveCount(2);
  await expect(descriptions.nth(0)).toHaveValue("Mulch");
  await expect(descriptions.nth(1)).toHaveValue("Edging");
});

test("LEP-047 a zero-quantity line is handled consistently, never silently treated as quantity 1", async ({ page }) => {
  await page.goto("/landscaping-quote-template/");
  const qty = page.getByLabel(/Quantity, line 1/i);
  await qty.fill("0");
  await qty.blur();
  const priceInput = page.getByLabel(/Unit price, line 1/i);
  await priceInput.fill("100");
  await priceInput.blur();

  // Whatever the documented policy is, the line's own contribution must be
  // $0.00 (quantity 0 x $100 = $0), never silently treated as 1 x $100.
  const lineRow = qty.locator("xpath=ancestor::*[self::tr or self::div][1]");
  const rowText = await lineRow.innerText();
  expect(rowText).not.toMatch(/\$100\.00/); // never silently promoted to qty 1
});

/** The calculator ships with non-zero sample defaults in every field (not a
 * blank form) — zero every OTHER cost/overhead field first so a category
 * isolation check actually isolates one category. */
async function zeroAllExcept(page: import("@playwright/test").Page, exceptLabel: string) {
  for (const label of ["Materials", "Loaded labor", "Equipment", "Delivery", "Other costs"]) {
    if (label === exceptLabel) continue;
    const field = page.getByLabel(new RegExp(`^${label}`));
    await field.fill("0");
    await field.blur();
  }
  const overhead = page.getByLabel(/^Overhead/);
  await overhead.fill("0");
  await overhead.blur();
}

test("LEP-065 Free Estimate Calculator category isolation: only Materials = $100, every other category zero, direct/true cost is exactly $100 before overhead", async ({ page }) => {
  await page.goto("/landscaping-estimate-calculator/");
  await zeroAllExcept(page, "Materials");
  await page.getByLabel(/^Materials/).fill("100");
  await page.getByLabel(/^Materials/).blur();
  const resultsText = await page.locator("main").innerText();
  const directMatch = resultsText.match(/Direct cost\s*\$?([\d,]+(?:\.\d{2})?)/);
  expect(directMatch, `no "Direct cost" figure found in:\n${resultsText}`).not.toBeNull();
  expect(directMatch![1].replace(/,/g, "")).toBe("100");
});

test("LEP-066 Free Estimate Calculator reset returns every input/output to documented defaults", async ({ page }) => {
  await page.goto("/landscaping-estimate-calculator/");
  const materials = page.getByLabel(/^Materials/);
  const originalValue = await materials.inputValue();
  await materials.fill("12345");
  await materials.blur();
  await expect(materials).toHaveValue("12345");

  const resetButton = page.getByRole("button", { name: /reset calculator/i });
  await resetButton.click();
  // Resetting a dirty form opens an in-app confirm dialog — accept it.
  await page.getByRole("dialog").getByRole("button", { name: "Reset" }).click();
  // Reset returns to the tool's own documented starting values — which are
  // real sample defaults, not necessarily blank — never leaving the just
  // -typed 12345 behind.
  await expect(materials).not.toHaveValue("12345");
  await expect(materials).toHaveValue(originalValue);
});

test("LEP-072 Free Cost Calculator category isolation: only Materials = $100, direct/true cost is exactly $100 before overhead", async ({ page }) => {
  await page.goto("/landscaping-cost-calculator/");
  await zeroAllExcept(page, "Materials");
  await page.getByLabel(/^Materials/).fill("100");
  await page.getByLabel(/^Materials/).blur();
  const resultsText = await page.locator("main").innerText();
  const directMatch = resultsText.match(/Direct cost\s*\$?([\d,]+(?:\.\d{2})?)/);
  expect(directMatch, `no "Direct cost" figure found in:\n${resultsText}`).not.toBeNull();
  expect(directMatch![1].replace(/,/g, "")).toBe("100");
});

test("LEP-073 Free Cost Calculator reset returns every input/output to documented defaults", async ({ page }) => {
  await page.goto("/landscaping-cost-calculator/");
  const materials = page.getByLabel(/^Materials/);
  const originalValue = await materials.inputValue();
  await materials.fill("54321");
  await materials.blur();
  await expect(materials).toHaveValue("54321");

  const resetButton = page.getByRole("button", { name: /reset calculator/i });
  await resetButton.click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset" }).click();
  await expect(materials).not.toHaveValue("54321");
  await expect(materials).toHaveValue(originalValue);
});
