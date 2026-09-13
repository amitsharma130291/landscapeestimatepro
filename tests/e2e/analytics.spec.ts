/**
 * GA4 (src/layouts/Layout.astro's GA_ID, src/lib/analytics.ts) — the site's
 * real property is baked in as a default so analytics works without
 * depending on a Vercel env var being set, but must never appear on the
 * gated Pro app (AppPageLayout.astro has no analytics of any kind, by
 * design — see analytics.ts's own doc comment for why).
 */
import { test, expect } from "@playwright/test";

const GA_MEASUREMENT_ID = "G-H0LF7K48W3";

test("public pages load the real GA4 property", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/gtag/js*", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });

  await page.goto("/");
  expect(requests.some((u) => u.includes(`id=${GA_MEASUREMENT_ID}`))).toBe(true);

  const gtagScript = page.locator(`script[src*="gtag/js?id=${GA_MEASUREMENT_ID}"]`);
  await expect(gtagScript).toHaveCount(1);
});

test("the Pro app never loads any analytics script", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("googletagmanager.com")) requests.push(req.url());
  });

  await page.goto("/app/");
  expect(requests).toHaveLength(0);
  await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(0);
});
