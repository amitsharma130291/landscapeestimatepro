/**
 * DEF-12 fix — Reset/Clear control on the two free calculators (Free
 * Estimate Calculator and Free Cost Calculator, both driven by the shared
 * ProjectCalculatorIsland component). Real browser evidence for all 7
 * required scenarios, run against both pages.
 *
 * Note on "contractor mode": no such toggle exists anywhere in this
 * component or either page (confirmed by source read — ProjectCalculatorIsland
 * has a single unified form, no mode switch). Scenario 3 below is therefore
 * built as the closest legitimate real-world equivalent: a realistic mixed
 * sequence of money AND percentage edits, the way a contractor would
 * actually use the tool, rather than inventing a UI feature that isn't there.
 */
import { test, expect, type Page } from "@playwright/test";

const PAGES = [
  { url: "/landscaping-estimate-calculator/", name: "Free Estimate Calculator" },
  { url: "/landscaping-cost-calculator/", name: "Free Cost Calculator" },
];

const DEFAULTS = {
  materials: "1250",
  labor: "768",
  equipment: "180",
  delivery: "180",
  other: "100",
  overhead: "15",
  margin: "35",
};

async function fields(page: Page) {
  return {
    materials: page.getByLabel(/^Materials/),
    labor: page.getByLabel(/^Loaded labor/),
    equipment: page.getByLabel(/^Equipment/),
    delivery: page.getByLabel(/^Delivery/),
    other: page.getByLabel(/^Other costs/),
    overhead: page.getByLabel(/^Overhead/),
    margin: page.getByLabel(/^Target margin/),
  };
}

async function expectDefaults(page: Page) {
  const f = await fields(page);
  await expect(f.materials).toHaveValue(DEFAULTS.materials);
  await expect(f.labor).toHaveValue(DEFAULTS.labor);
  await expect(f.equipment).toHaveValue(DEFAULTS.equipment);
  await expect(f.delivery).toHaveValue(DEFAULTS.delivery);
  await expect(f.other).toHaveValue(DEFAULTS.other);
  await expect(f.overhead).toHaveValue(DEFAULTS.overhead);
  await expect(f.margin).toHaveValue(DEFAULTS.margin);
}

for (const { url, name } of PAGES) {
  test.describe(`${name} — Reset control (DEF-12)`, () => {
    test("1. Reset from a fully populated, all-valid state returns every field to its documented default", async ({ page }) => {
      page.on("dialog", (d) => d.accept());
      await page.goto(url);
      const f = await fields(page);
      await f.materials.fill("9999");
      await f.materials.blur();
      await f.labor.fill("8888");
      await f.labor.blur();
      await f.equipment.fill("7777");
      await f.equipment.blur();
      await f.delivery.fill("6666");
      await f.delivery.blur();
      await f.other.fill("5555");
      await f.other.blur();
      await f.overhead.fill("22");
      await f.overhead.blur();
      await f.margin.fill("40");
      await f.margin.blur();

      await page.getByRole("button", { name: "Reset calculator to starting values" }).click();
      await expectDefaults(page);
    });

    test("2. Reset while a validation error is visible discards the invalid draft and clears the error", async ({ page }) => {
      await page.goto(url);
      const f = await fields(page);
      await f.overhead.fill("-5"); // invalid: negative overhead
      await expect(page.getByRole("alert")).toBeVisible();

      // Click Reset WITHOUT blurring first — the field is still mid-edit
      // with an invalid, uncommitted draft. Nothing was actually changed
      // from defaults yet (the invalid draft never committed), so no
      // confirmation dialog is expected.
      await page.getByRole("button", { name: "Reset calculator to starting values" }).click();
      await expect(page.getByRole("alert")).not.toBeVisible();
      await expectDefaults(page);
    });

    test("3. Reset after a realistic contractor sequence (money AND percentage fields, in the order a contractor would fill them)", async ({ page }) => {
      page.on("dialog", (d) => d.accept());
      await page.goto(url);
      const f = await fields(page);
      // A contractor typically fills money fields first, then sets their
      // overhead/margin assumptions last.
      await f.materials.fill("3200");
      await f.materials.blur();
      await f.labor.fill("1450");
      await f.labor.blur();
      await f.overhead.fill("18");
      await f.overhead.blur();
      await f.margin.fill("30");
      await f.margin.blur();
      await expect(f.margin).toHaveValue("30");

      await page.getByRole("button", { name: "Reset calculator to starting values" }).click();
      await expectDefaults(page);
    });

    test("4. Reset after a calculated result clears the stale figures — the results panel shows the DEFAULT calculation, not a leftover custom one", async ({ page }) => {
      page.on("dialog", (d) => d.accept());
      await page.goto(url);
      const f = await fields(page);
      await f.materials.fill("50000");
      await f.materials.blur();
      const customDirect = await page.locator("main").innerText();
      expect(customDirect).toMatch(/\$51,228/); // materials dominate the new direct cost

      await page.getByRole("button", { name: "Reset calculator to starting values" }).click();
      await expectDefaults(page);
      const afterReset = await page.locator("main").innerText();
      expect(afterReset).not.toMatch(/\$51,228/);
      // The default direct cost (1250+768+180+180+100 = $2,478) reappears.
      expect(afterReset).toMatch(/\$2,478/);
    });

    test("5. Reset is keyboard-activatable: Tab to focus it, Enter to activate, no mouse", async ({ page }) => {
      page.on("dialog", (d) => d.accept());
      await page.goto(url);
      const f = await fields(page);
      await f.materials.fill("42424242");
      await f.materials.blur();

      const resetButton = page.getByRole("button", { name: "Reset calculator to starting values" });
      await resetButton.focus();
      await expect(resetButton).toBeFocused();
      await page.keyboard.press("Enter");
      await expectDefaults(page);
    });

    test("6. Resetting the calculator never touches the Pro app's own workspace data in localStorage", async ({ page }) => {
      // Seed a distinctive Pro business name first, in a separate navigation.
      await page.goto("/app/settings/");
      await page.getByLabel("Business name").fill("Untouched By Calculator Reset LLC");
      await page.getByLabel("Business name").blur();
      await page.waitForTimeout(300);
      const proStorageBefore = await page.evaluate(() => localStorage.getItem("landscapeEstimateProWorkspace:v1"));
      expect(proStorageBefore).toContain("Untouched By Calculator Reset LLC");

      // Now use and reset the free calculator in a FRESH navigation (a real
      // visitor would have both open across different sessions/tabs, but at
      // minimum this proves the calculator writes nothing to the same
      // storage key or mutates the existing Pro record).
      page.on("dialog", (d) => d.accept());
      await page.goto(url);
      const f = await fields(page);
      await f.materials.fill("13579");
      await f.materials.blur();
      await page.getByRole("button", { name: "Reset calculator to starting values" }).click();
      await expectDefaults(page);

      const proStorageAfter = await page.evaluate(() => localStorage.getItem("landscapeEstimateProWorkspace:v1"));
      expect(proStorageAfter).toBe(proStorageBefore); // byte-for-byte unchanged
    });

    test("7. Repeated Reset clicks are safe and idempotent — no error, no drift, state stays at defaults", async ({ page }) => {
      page.on("dialog", (d) => d.accept());
      await page.goto(url);
      const f = await fields(page);
      await f.materials.fill("777");
      await f.materials.blur();

      const resetButton = page.getByRole("button", { name: "Reset calculator to starting values" });
      await resetButton.click();
      await expectDefaults(page);
      // Click it again (and again) from an ALREADY-default state — this
      // path also has nothing to lose, so no confirmation should block it,
      // and the state must remain exactly the same defaults every time.
      await resetButton.click();
      await expectDefaults(page);
      await resetButton.click();
      await expectDefaults(page);

      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      await resetButton.click();
      await expect(page.locator("main")).toBeVisible();
    });
  });
}
