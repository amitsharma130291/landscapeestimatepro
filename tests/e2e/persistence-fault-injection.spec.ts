/**
 * Browser-level persistence/recovery fault injection — real localStorage
 * failures thrown from inside the actual page (not mocked in a unit test),
 * driving the real SaveErrorBanner/WorkspaceMigrationError UI end to end.
 *
 * Unit-level equivalents already exist (persistence-failure.test.ts,
 * persistence.test.ts) and are thorough; this file proves the same
 * failure classes surface correctly through the REAL rendered UI a
 * contractor would actually see.
 */
import { test, expect } from "@playwright/test";

const STORAGE_KEY = "landscapeEstimateProWorkspace:v1";

/** Makes the NEXT localStorage.setItem call for our storage key throw a
 * real DOMException with the given name, then behave normally again. */
async function injectOneStorageFailure(page: import("@playwright/test").Page, errorName: "QuotaExceededError" | "SecurityError") {
  await page.evaluate(
    ({ key, name }) => {
      const original = Storage.prototype.setItem;
      let armed = true;
      Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
        if (k === key && armed) {
          armed = false;
          Storage.prototype.setItem = original; // only the ONE call fails; retries use the real thing
          throw new DOMException("simulated", name);
        }
        return original.call(this, k, v);
      };
    },
    { key: STORAGE_KEY, name: errorName }
  );
}

test("storage quota failure: SaveErrorBanner shows the quota message, work is never lost, and never claims 'Saved'", async ({ page }) => {
  await page.goto("/app/settings/");
  await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();
  await page.waitForTimeout(200); // let any mount-time save settle before arming the one-shot failure
  await injectOneStorageFailure(page, "QuotaExceededError");

  const businessName = page.getByLabel("Business name");
  await businessName.fill("Quota Failure Test Co.");
  await businessName.blur();

  const banner = page.getByRole("alert").filter({ hasText: "wasn't saved" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/local storage is full/i);
  // Never a false "Saved" claim anywhere on screen while this banner is up.
  await expect(page.getByText(/^Saved$/)).not.toBeVisible();
  // The in-memory edit is preserved on screen even though it didn't persist.
  await expect(businessName).toHaveValue("Quota Failure Test Co.");

  // Retry (storage now behaves normally again) actually succeeds.
  await page.getByRole("button", { name: /Retry save/i }).click();
  await expect(banner).not.toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(page.getByLabel("Business name")).toHaveValue("Quota Failure Test Co.");
});

test("storage security exception (e.g. private browsing): SaveErrorBanner shows the blocked-storage message", async ({ page }) => {
  await page.goto("/app/settings/");
  await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();
  await page.waitForTimeout(200); // let any mount-time save settle before arming the one-shot failure
  await injectOneStorageFailure(page, "SecurityError");

  const businessName = page.getByLabel("Business name");
  await businessName.fill("Security Error Test Co.");
  await businessName.blur();

  const banner = page.getByRole("alert").filter({ hasText: "wasn't saved" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/blocked in this browser/i);
  await expect(page.getByText(/^Saved$/)).not.toBeVisible();
});

test("retry after correcting stored data: a failed save can be retried and then survives a reload", async ({ page }) => {
  await page.goto("/app/settings/");
  await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();
  await page.waitForTimeout(200); // let any mount-time save settle before arming the one-shot failure
  await injectOneStorageFailure(page, "QuotaExceededError");
  const laborRate = page.getByRole("textbox", { name: "Loaded labor rate" });
  await laborRate.fill("40");
  await laborRate.blur();

  const banner = page.getByRole("alert").filter({ hasText: "wasn't saved" });
  await expect(banner).toBeVisible();

  // "Download backup" is offered as a safety net WHILE the failure is up —
  // must be a real, working download, not a dead button.
  const downloadPromise = page.waitForEvent("download");
  await banner.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  await page.getByRole("button", { name: /Retry save/i }).click();
  await expect(banner).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Loaded labor rate" })).toHaveValue("40");
});

test("successful migration: a real legacy v1 workspace loads, upgrades, and is usable without data loss", async ({ page }) => {
  const legacyV1Workspace = {
    version: 1,
    business: { loadedLaborRate: 30, overheadPercent: 12, targetMarginPercent: 30, defaultDeliveryCost: 100, minimumProjectPrice: 400, roundDisplayTo: "cent" },
    materials: [],
    equipment: [],
    assemblies: [],
    projects: [
      {
        id: "legacy-proj",
        name: "Old Job",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z",
        status: "won",
        serviceLines: [],
        equipmentLines: [],
        deliveryCost: 0,
        extraCosts: [],
        overheadPercent: 12,
        targetMarginPercent: 30,
        quotedPrice: 850,
      },
    ],
    templates: [],
  };

  await page.goto("/app/");
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: legacyV1Workspace }
  );
  await page.reload();

  // No migration-error screen — this is a VALID legacy shape that should
  // upgrade cleanly, not get flagged as corrupt.
  await expect(page.getByRole("heading", { name: /needs correction/i })).not.toBeVisible();

  await page.goto("/app/estimates/");
  await expect(page.getByText("Old Job")).toBeVisible(); // the legacy project survived the upgrade

  const migratedRaw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const migrated = JSON.parse(migratedRaw!);
  expect(migrated.version).toBeGreaterThan(1); // actually upgraded, not left as v1

  // Repeated migration: reloading an ALREADY-migrated workspace again must
  // be a no-op (idempotent), never re-applying the upgrade or duplicating data.
  await page.reload();
  await page.goto("/app/estimates/");
  await expect(page.getByText("Old Job")).toBeVisible();
  const migratedAgainRaw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(migratedAgainRaw!).version).toBe(migrated.version); // stable, didn't drift on a second pass
});
