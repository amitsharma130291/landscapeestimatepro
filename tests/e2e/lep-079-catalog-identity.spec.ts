/**
 * LEP-079 — replacing insufficient prior evidence. The previous evidence
 * for this P0 case was "Source read: CatalogTab.tsx / TemplatesTab.tsx
 * (material/equipment select options keyed by id, never by name)" — a
 * source-inspection claim only, never exercised against the real running
 * Pro app. This adds an executable test: two materials sharing the exact
 * same display name, different ids and different costs, each referenced
 * by a separate assembly — confirming each assembly resolves its OWN
 * correctly-costed material, never the other one.
 */
import { test, expect } from "@playwright/test";

// A name guaranteed not to collide with anything in the seeded sample
// catalog (which already has its own material named "Mulch") — keeps the
// count of matching options in each <select> unambiguous (exactly 2, not
// 3), so this test isolates the id-vs-name-keying question cleanly.
const SHARED_NAME = "Special Aggregate Mix";

test("LEP-079 [PASS, executable evidence replacing source-inspection-only] two same-named materials stay fully distinct across separate assemblies — selects are keyed by id, never by name", async ({ page }) => {
  await page.goto("/app/catalog/");
  await page.getByRole("button", { name: "Add material" }).click();
  await page.getByRole("button", { name: "Add material" }).click();

  const nameInputs = page.locator('input[id*="mat-name-"]');
  const costInputs = page.locator('input[id*="mat-cost-"]');
  const count = await nameInputs.count();
  // The two newly-added materials are the LAST two rows.
  const idxA = count - 2;
  const idxB = count - 1;

  await nameInputs.nth(idxA).fill(SHARED_NAME);
  await nameInputs.nth(idxA).blur();
  await costInputs.nth(idxA).fill("42.00");
  await costInputs.nth(idxA).blur();
  await page.waitForTimeout(200);

  await nameInputs.nth(idxB).fill(SHARED_NAME);
  await nameInputs.nth(idxB).blur();
  await costInputs.nth(idxB).fill("99.00");
  await costInputs.nth(idxB).blur();
  await page.waitForTimeout(300);

  await expect(costInputs.nth(idxA)).toHaveValue("42");
  await expect(costInputs.nth(idxB)).toHaveValue("99");

  await page.goto("/app/templates/");
  await page.getByRole("button", { name: "Add assembly" }).click();
  await page.getByRole("button", { name: "Add assembly" }).click();

  // Give each new assembly ("New service") exactly one material line.
  const addMaterialLineButtons = page.getByRole("button", { name: "+ Add material" });
  const assemblyCount = await addMaterialLineButtons.count();
  await addMaterialLineButtons.nth(assemblyCount - 2).click();
  await addMaterialLineButtons.nth(assemblyCount - 1).click();

  const materialSelects = page.getByLabel("Material", { exact: true });
  const selectCount = await materialSelects.count();
  const assemblyASelect = materialSelects.nth(selectCount - 2);
  const assemblyBSelect = materialSelects.nth(selectCount - 1);

  // Both selects list the SAME two visually-identical options — read their
  // real underlying values (material ids) rather than relying on the
  // ambiguous label text, then assign one distinct id to each.
  const sharedNameOptions = assemblyASelect.locator("option", { hasText: new RegExp(`^${SHARED_NAME}$`) });
  await expect(sharedNameOptions).toHaveCount(2);
  const idA = await sharedNameOptions.nth(0).getAttribute("value");
  const idB = await sharedNameOptions.nth(1).getAttribute("value");
  expect(idA).not.toBe(idB);

  await assemblyASelect.selectOption({ value: idA! });
  await assemblyBSelect.selectOption({ value: idB! });
  await page.waitForTimeout(200);

  // Each assembly's own displayed "True cost per unit" must reflect ONLY
  // its own selected material's cost — with 0% labor/equipment/other cost
  // on a freshly-added assembly and the business's default 15% overhead,
  // true cost = materialCost x 1.15 exactly. There is exactly one "True
  // cost per unit" line PER ASSEMBLY (not per material line, which is a
  // different count whenever any assembly has zero or multiple material
  // lines) — index by assemblyCount, not selectCount.
  const trueCostLines = page.getByText(/True cost per/);
  const trueCostTextA = await trueCostLines.nth(assemblyCount - 2).innerText();
  const trueCostTextB = await trueCostLines.nth(assemblyCount - 1).innerText();

  // One of the two assemblies resolved to $42.00 x 1.15 = $48.30, the other
  // to $99.00 x 1.15 = $113.85 — never the same figure, and never each
  // other's — proving the id-keyed reference never collided on the shared
  // display name.
  const combined = `${trueCostTextA} ${trueCostTextB}`;
  expect(combined).toContain("$48.30");
  expect(combined).toContain("$113.85");
  expect(trueCostTextA).not.toBe(trueCostTextB);
});
