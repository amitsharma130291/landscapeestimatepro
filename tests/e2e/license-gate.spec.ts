/**
 * Covers the license gate itself (src/components/app/LicenseGate.tsx) and
 * the activation/recovery UI (src/components/LicenseActivationSection.tsx).
 * Every other e2e spec runs with a fixture license already in localStorage
 * (see playwright.config.ts) so it can exercise the app as before — these
 * tests deliberately start from a clean, unlicensed browser instead, and
 * mock the license/*.ts and checkout-*.ts serverless functions the same
 * way tests/e2e/contact.spec.ts mocks api/contact.ts (no real Dodo calls,
 * no real email sends).
 */
import { test, expect } from "@playwright/test";

test.describe("locked (no stored license)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows the activation gate instead of the app", async ({ page }) => {
    await page.goto("/app/");
    await expect(page.getByRole("heading", { name: "Activate Landscape Estimate Pro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).not.toBeVisible();
  });

  test("activating a valid license key unlocks the app", async ({ page }) => {
    await page.route("**/api/license-redeem", async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ licenseKey: "LEP-PRO-e2e-valid" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, paymentId: "pay_e2e", licenseKey: "LEP-PRO-e2e-valid" }) });
    });

    await page.goto("/app/");
    await page.getByLabel("License key").fill("LEP-PRO-e2e-valid");
    await page.getByRole("button", { name: "Activate" }).click();

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activate Landscape Estimate Pro" })).not.toBeVisible();
  });

  test("an invalid license key shows an error and stays locked", async ({ page }) => {
    await page.route("**/api/license-redeem", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, status: "unknown" }) });
    });

    await page.goto("/app/");
    await page.getByLabel("License key").fill("LEP-PRO-not-real");
    await page.getByRole("button", { name: "Activate" }).click();

    await expect(page.getByRole("alert")).toContainText(/isn't valid/i);
    await expect(page.getByRole("heading", { name: "Activate Landscape Estimate Pro" })).toBeVisible();
  });

  test("a ?license= URL param (a purchase or recovery-email redirect) auto-activates without touching the form", async ({ page }) => {
    await page.route("**/api/license-redeem", async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ licenseKey: "LEP-PRO-from-link" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, paymentId: "pay_link", licenseKey: "LEP-PRO-from-link" }) });
    });

    await page.goto("/app/?license=LEP-PRO-from-link");

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    // The param is consumed and stripped so a reload doesn't keep re-redeeming it.
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test("recovering a forgotten license by email always shows the same generic confirmation", async ({ page }) => {
    let requestBody: unknown = null;
    await page.route("**/api/license-recover", async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, message: "If that email has a completed purchase, we've sent the license key to it." }) });
    });

    await page.goto("/pricing/");
    await page.getByRole("button", { name: "Forgot your license key?" }).click();
    await page.getByLabel("Email you paid with").fill("contractor@example.com");
    await page.getByRole("button", { name: "Send license key" }).click();

    await expect(page.getByText(/we've sent the license key to it/i)).toBeVisible();
    expect(requestBody).toMatchObject({ email: "contractor@example.com" });
  });
});

test.describe("checkout redirect handling (landscaping-estimating-software page)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a successful payment redirects straight into the unlocked app", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("landscapeEstimateProPendingCheckout", JSON.stringify({ sessionId: "cs_e2e_success" }));
    });
    await page.route("**/api/checkout-verify*", async (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("sessionId")).toBe("cs_e2e_success");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, paymentId: "pay_success", licenseKey: "LEP-PRO-pay_success" }) });
    });
    await page.route("**/api/license-redeem", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, paymentId: "pay_success", licenseKey: "LEP-PRO-pay_success" }) });
    });

    await page.goto("/landscaping-estimating-software/");

    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("a failed payment shows a failure message above the fold instead of redirecting", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("landscapeEstimateProPendingCheckout", JSON.stringify({ sessionId: "cs_e2e_fail" }));
    });
    await page.route("**/api/checkout-verify*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, status: "failed" }) });
    });

    await page.goto("/landscaping-estimating-software/");

    await expect(page.getByRole("alert")).toContainText(/payment didn't go through/i);
    await expect(page).toHaveURL(/\/landscaping-estimating-software\/$/);
    // Genuinely above the fold: visible without any scrolling.
    const box = await page.getByRole("alert").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(await page.evaluate(() => window.innerHeight));
  });

  test("a normal visit with no pending checkout shows neither banner state", async ({ page }) => {
    await page.goto("/landscaping-estimating-software/");
    await expect(page.getByRole("alert")).not.toBeVisible();
    await expect(page.getByText(/confirming your payment/i)).not.toBeVisible();
  });
});

test.describe("starting a purchase", () => {
  test("clicking Get Pro starts a Dodo checkout session and redirects to the hosted checkout URL", async ({ page }) => {
    await page.route("**/api/checkout-create", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, checkoutUrl: "http://localhost:4329/__mock_dodo_checkout__", sessionId: "cs_e2e_new" }) });
    });
    await page.route("**/__mock_dodo_checkout__", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>mock dodo checkout</body></html>" });
    });

    await page.goto("/pricing/");
    await page.getByRole("button", { name: /Get Landscape Estimate Pro/ }).click();

    await expect(page).toHaveURL(/__mock_dodo_checkout__/);
  });
});
