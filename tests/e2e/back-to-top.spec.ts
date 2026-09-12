/**
 * The Pro app's floating "Back to top" button (ScrollToTopButton.tsx,
 * mounted once in AppShell.tsx so it's present on every /app/* tab) —
 * faded out near the top of a page, fades in once the page has actually
 * scrolled far enough to be "long", and scrolls back to the top on click.
 * Public marketing pages deliberately do NOT have this button.
 */
import { test, expect, type Page } from "@playwright/test";

/** client:only islands mount their content asynchronously, so a data-heavy
 * tab's real scrollHeight isn't final the instant navigation resolves —
 * poll until two consecutive reads agree before scrolling against it. */
async function waitForScrollHeightToSettle(page: Page): Promise<void> {
  let previous = -1;
  await expect
    .poll(async () => {
      const current = await page.evaluate(() => document.documentElement.scrollHeight);
      const stable = current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
}

// The button is a real, always-rendered, non-zero-size element that fades
// in via opacity/transform (not display:none) so it can transition smoothly
// — Playwright's toBeVisible() only checks display/visibility/size, not
// opacity, so "hidden" here is asserted via the actual CSS opacity instead
// (the same lesson as this app's honeypot field elsewhere in the suite).
async function expectFaded(button: import("@playwright/test").Locator, faded: boolean) {
  await expect(button).toHaveCSS("opacity", faded ? "0" : "1");
  await expect(button).toHaveCSS("pointer-events", faded ? "none" : "auto");
}

test("faded out near the top of a long Pro app page, fades in once scrolled, and returns to the top on click", async ({ page }) => {
  await page.goto("/app/settings/");
  const button = page.getByRole("button", { name: "Back to top" });
  await expect(button).toBeAttached();
  await expectFaded(button, true);

  await waitForScrollHeightToSettle(page);
  await page.mouse.wheel(0, 800);
  await expectFaded(button, false);

  await button.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expectFaded(button, true);
});

test("stays faded out on a short page that never scrolls past the threshold", async ({ page }) => {
  await page.goto("/app/rate-health/");
  const button = page.getByRole("button", { name: "Back to top" });
  await expect(button).toBeAttached();
  await expectFaded(button, true);
  // A small scroll (well under the show threshold) must not reveal it.
  await page.mouse.wheel(0, 100);
  await expectFaded(button, true);
});

test("public marketing pages do not have a back-to-top button", async ({ page }) => {
  await page.goto("/landscape-pricing-guide/");
  await expect(page.getByRole("button", { name: "Back to top" })).toHaveCount(0);
});

const ALL_APP_PAGES = [
  "/app/",
  "/app/guide/",
  "/app/catalog/",
  "/app/templates/",
  "/app/estimates/",
  "/app/rate-health/",
  "/app/actuals/",
  "/app/settings/",
];

for (const url of ALL_APP_PAGES) {
  test(`present and functional on every /app/ tab: ${url}`, async ({ page }) => {
    await page.goto(url);
    const button = page.getByRole("button", { name: "Back to top" });
    // Present in the DOM on every single tab (mounted once, in the shared
    // AppShell, not per-tab) — this is the actual guarantee that matters,
    // independent of whether any one tab's content happens to be long
    // enough to scroll past the show threshold right now.
    await expect(button).toHaveCount(1);
    await expectFaded(button, true);

    // client:only islands mount their real content asynchronously — a data-
    // heavy tab's true scrollHeight isn't final the instant goto() resolves,
    // so wait for it to stop growing before scrolling (otherwise a wheel
    // event can land while the page is still short and scroll nowhere).
    await waitForScrollHeightToSettle(page);

    await page.mouse.wheel(0, 2000);
    // A late-settling section (e.g. an async project evaluation) can still
    // reflow content and shift the browser's own scroll-anchoring after the
    // wheel event — read the FINAL resting scrollY, not whatever it was the
    // instant the wheel event returned.
    await page.waitForTimeout(400);
    const scrollY = await page.evaluate(() => window.scrollY);
    if (scrollY > 400) {
      // This tab's content is actually long enough — the button must work.
      await expectFaded(button, false);
      await button.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    } else {
      // Too short to cross the threshold — correctly stays hidden, not "broken".
      await expectFaded(button, true);
    }
  });
}

test("still present and working after navigating between tabs via sidebar link clicks (not a fresh page load)", async ({ page }) => {
  await page.goto("/app/settings/");
  await page.getByRole("link", { name: "Assemblies & Templates" }).click();
  await expect(page).toHaveURL(/\/app\/templates\//);

  const button = page.getByRole("button", { name: "Back to top" });
  await expect(button).toHaveCount(1); // never duplicated by the soft navigation
  await expectFaded(button, true);

  await waitForScrollHeightToSettle(page);
  await page.mouse.wheel(0, 2000);
  await expectFaded(button, false);
  await button.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
