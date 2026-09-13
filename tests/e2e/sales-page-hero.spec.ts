/**
 * Coverage for the hero + product-preview refinement on
 * /landscaping-estimating-software/ — above-the-fold layout, the exact
 * preview calculations, and the removal of the minimum-price line and the
 * simulated "Create customer estimate" button from the hero specifically.
 * Financial reconciliation of the underlying numbers is independently
 * proven by src/lib/salesPageExamples.test.ts against the real pricing
 * engine — these tests confirm the HERO renders those exact figures and
 * that the above-the-fold layout requirements actually hold, using element
 * bounding boxes rather than screenshot-only judgment.
 */
import { test, expect, type Locator } from "@playwright/test";
import { SALES_CONFIG } from "../../src/data/salesConfig";

// The hero's whole job is the PRE-purchase pitch, so this file opts out of
// the suite's default "already licensed" fixture (see playwright.config.ts)
// — otherwise the buy CTA would render as "Go to App" instead (see
// licensed-go-to-app.spec.ts for that behavior's own coverage).
test.use({ storageState: { cookies: [], origins: [] } });

const URL = "/landscaping-estimating-software/";
const PURCHASE_CTA_NAME = /Get Landscape Estimate Pro — \$79 Lifetime/;

async function bottom(locator: Locator): Promise<number> {
  const box = await locator.first().boundingBox();
  expect(box, "element has no bounding box (not visible/rendered)").not.toBeNull();
  return box!.y + box!.height;
}

test("the exact headline is present", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Know the cost before you quote. Protect the margin after the job.");
});

test("CTA follows SALES_CONFIG: an active purchase button only when sales are enabled", async ({ page }) => {
  await page.goto(URL);
  const hero = page.locator("#sales-page-hero");
  if (SALES_CONFIG.salesEnabled) {
    await expect(hero.getByRole("button", { name: PURCHASE_CTA_NAME })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Explore the Free Tools" })).toHaveCount(0);
  } else {
    await expect(hero.getByRole("button", { name: PURCHASE_CTA_NAME })).toHaveCount(0);
    await expect(hero.getByRole("link", { name: "Explore the Free Tools" })).toBeVisible();
    await expect(hero.getByText("Purchasing is not open yet.")).toBeVisible();
  }
});

test("sales-disabled state cannot initiate a purchase from the hero", async ({ page }) => {
  test.skip(SALES_CONFIG.salesEnabled, "only meaningful while sales are disabled");
  await page.goto(URL);
  const hero = page.locator("#sales-page-hero");
  await expect(hero.locator(".js-buy-cta")).toHaveCount(0);
  await expect(hero.getByRole("link", { name: "See how Pro works" })).toBeVisible();
});

test("'See how it works' / 'See how Pro works' scrolls to the how-it-works section", async ({ page }) => {
  await page.goto(URL);
  await page.getByRole("link", { name: /See how it works|See how Pro works/ }).click();
  await expect(page.getByRole("heading", { name: "From job quantities to a customer-ready price" })).toBeInViewport();
});

test("preview calculations reconcile exactly: direct cost, overhead, true cost, required price, rounded quote", async ({ page }) => {
  await page.goto(URL);
  const hero = page.locator("#sales-page-hero");
  const body = await hero.innerText();
  expect(body).toContain("$2,500"); // direct cost
  expect(body).toContain("$350"); // overhead allocation
  expect(body).toContain("$2,850.00"); // true cost
  expect(body).toContain("$4,384.62"); // price required for a 35% margin
  expect(body).toContain("$4,385.00"); // rounded, customer-ready quote (appears twice: headline result + rounding line)
});

test("the rounding explanation makes the $0.38 difference explicit", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Price required for a 35% margin")).toBeVisible();
  await expect(page.getByText("Rounded up to a customer-ready quote")).toBeVisible();
  const hero = page.locator("#sales-page-hero");
  const body = await hero.innerText();
  // Both numbers must appear near each other with the explanatory label —
  // never $4,385.00 shown as the "required price" with no $4,384.62 in sight.
  expect(body).toMatch(/Price required for a 35% margin[\s\S]{0,40}\$4,384\.62/i);
  expect(body).toMatch(/Rounded up to a customer-ready quote[\s\S]{0,40}\$4,385\.00/i);
});

test("the minimum-project-price line is absent from the hero", async ({ page }) => {
  await page.goto(URL);
  const hero = page.locator("#sales-page-hero");
  const body = await hero.innerText();
  expect(body).not.toContain("Minimum project price");
  expect(body).not.toMatch(/Not needed here/i);
});

test("the simulated 'Create customer estimate' CTA is absent, and no focusable fake controls exist inside the preview", async ({ page }) => {
  await page.goto(URL);
  const preview = page.locator('[role="group"][aria-label="Example project using sample costs"]');
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("link", { name: /Create customer estimate/i })).toHaveCount(0);
  await expect(preview.getByRole("button")).toHaveCount(0);
  await expect(preview.locator("a")).toHaveCount(0);
  await expect(preview.getByText("Customer estimate ready")).toBeVisible();
});

test("the preview is labeled as an example, not a real customer's data", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('[aria-label="Example project using sample costs"]')).toBeVisible();
  await expect(page.getByText("Example project").first()).toBeVisible();
});

test("no horizontal overflow at every required viewport", async ({ page }) => {
  const viewports = [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1280, 800],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ] as const;
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto(URL);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}x${height}`).toBe(false);
  }
});

test("primary hero conversion elements are visible above the fold at 1366x768", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  const viewportHeight = 768;

  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  const primaryCta = SALES_CONFIG.salesEnabled ? page.getByRole("button", { name: PURCHASE_CTA_NAME }) : page.getByRole("link", { name: "Explore the Free Tools" });
  await expect(primaryCta.first()).toBeInViewport();

  const hero = page.locator("#sales-page-hero");

  if (SALES_CONFIG.salesEnabled) {
    const reassuranceBottom = await bottom(hero.getByText("One payment. No monthly subscription."));
    expect(reassuranceBottom, "purchase reassurance falls below the fold at 1366x768").toBeLessThanOrEqual(viewportHeight);
  }

  const trueCostBottom = await bottom(hero.getByText("$2,850.00").first());
  expect(trueCostBottom, "true cost result falls below the fold at 1366x768").toBeLessThanOrEqual(viewportHeight);

  const requiredPriceBottom = await bottom(hero.getByText("$4,384.62"));
  expect(requiredPriceBottom, "required-price result falls below the fold at 1366x768").toBeLessThanOrEqual(viewportHeight);

  const roundedQuoteBottom = await bottom(hero.getByText("$4,385.00").first());
  expect(roundedQuoteBottom, "rounded quote result falls below the fold at 1366x768").toBeLessThanOrEqual(viewportHeight);
});

test("hero content has no excessive blank region above it (headline starts within a reasonable distance of the header)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  const headerBox = await page.locator("header").first().boundingBox();
  const headlineBox = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(headerBox).not.toBeNull();
  expect(headlineBox).not.toBeNull();
  const gap = headlineBox!.y - (headerBox!.y + headerBox!.height);
  // Breadcrumbs + hero top padding + eyebrow live in this gap — generous
  // upper bound well short of the old bug's ~350px empty band.
  expect(gap, `unexpectedly large gap (${gap}px) between header and H1`).toBeLessThan(220);
});

test("CTA and required-price result are visible at 1440x900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL);
  const primaryCta = SALES_CONFIG.salesEnabled ? page.getByRole("button", { name: PURCHASE_CTA_NAME }) : page.getByRole("link", { name: "Explore the Free Tools" });
  await expect(primaryCta.first()).toBeInViewport();
  const hero = page.locator("#sales-page-hero");
  await expect(hero.getByText("$4,384.62")).toBeInViewport();
});

test("mobile: primary CTA appears before the example preview in document order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  const hero = page.locator("#sales-page-hero");
  const ctaY = SALES_CONFIG.salesEnabled ? (await hero.getByRole("button", { name: PURCHASE_CTA_NAME }).boundingBox())!.y : (await hero.getByRole("link", { name: "Explore the Free Tools" }).boundingBox())!.y;
  const previewY = (await hero.locator('[aria-label="Example project using sample costs"]').boundingBox())!.y;
  expect(ctaY, "CTA does not appear above the preview on mobile").toBeLessThan(previewY);
});

test("headline forms multiple balanced lines at desktop width with no single-word orphan line", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  const lineCount = await page.getByRole("heading", { level: 1 }).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    const tops = Array.from(new Set(rects.map((r) => Math.round(r.top))));
    return tops.length;
  });
  expect(lineCount).toBeGreaterThanOrEqual(2);

  const lastLineWordCount = await page.getByRole("heading", { level: 1 }).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    const maxTop = Math.max(...rects.map((r) => Math.round(r.top)));
    const text = el.textContent ?? "";
    // Approximate: count words whose rect sits on the bottommost line.
    const words = text.trim().split(/\s+/);
    // Re-measure per word using a fresh range for accuracy.
    let count = 0;
    let idx = 0;
    for (const word of words) {
      const wordStart = text.indexOf(word, idx);
      idx = wordStart + word.length;
      const r = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node: Text | null = null;
      while (walker.nextNode()) {
        const t = walker.currentNode as Text;
        if (wordStart < offset + t.length) {
          node = t;
          break;
        }
        offset += t.length;
      }
      if (!node) continue;
      r.setStart(node, wordStart - offset);
      r.setEnd(node, wordStart - offset + word.length);
      const rect = r.getBoundingClientRect();
      if (Math.round(rect.top) === maxTop) count++;
    }
    return count;
  });
  expect(lastLineWordCount, "the last headline line contains only one word (an orphan)").toBeGreaterThan(1);
});

test("text remains usable at a 200%-zoom-equivalent layout width (no overflow, no illegible collapse)", async ({ page }) => {
  await page.setViewportSize({ width: 683, height: 384 });
  await page.goto(URL);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const primaryCta = SALES_CONFIG.salesEnabled ? page.getByRole("button", { name: PURCHASE_CTA_NAME }) : page.getByRole("link", { name: "Explore the Free Tools" });
  await expect(primaryCta.first()).toBeVisible();
});

test("respects prefers-reduced-motion: hero renders identically, nothing depends on animation to become visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const primaryCta = SALES_CONFIG.salesEnabled ? page.getByRole("button", { name: PURCHASE_CTA_NAME }) : page.getByRole("link", { name: "Explore the Free Tools" });
  await expect(primaryCta.first()).toBeVisible();
  await expect(page.getByText("$4,385.00").first()).toBeVisible();
});

test("CTA accessible name includes the product and price when sales are enabled", async ({ page }) => {
  test.skip(!SALES_CONFIG.salesEnabled, "only meaningful while sales are enabled");
  await page.goto(URL);
  const hero = page.locator("#sales-page-hero");
  await expect(hero.getByRole("button", { name: /Landscape Estimate Pro/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: /\$79/ })).toBeVisible();
});

test("keyboard: the secondary 'See how it works' anchor receives visible focus", async ({ page }) => {
  await page.goto(URL);
  const secondary = page.getByRole("link", { name: /See how it works|See how Pro works/ });
  await secondary.focus();
  await expect(secondary).toBeFocused();
});

test("decorative cost bars are hidden from assistive technology", async ({ page }) => {
  await page.goto(URL);
  const preview = page.locator('[aria-label="Example project using sample costs"]');
  const hiddenBars = preview.locator('[aria-hidden="true"].bg-paper-dim');
  expect(await hiddenBars.count()).toBeGreaterThanOrEqual(5); // one per cost line item
});
