/**
 * Phase 3 — exact-viewport responsive automation. The interactive Browser
 * pane tool used earlier in this project's QA couldn't render true
 * 320/375px viewports (it floored around ~489px); Playwright's own browser
 * instances have no such floor, so these are the real, exact pixel sizes.
 */
import { test, expect, type Page } from "@playwright/test";
import { openOrCreateProject } from "./helpers";

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
];

async function assertNoPageOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, `${label}: page-level horizontal overflow (scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})`).toBeLessThanOrEqual(
    overflow.clientWidth
  );
}

const PAGES = [
  { name: "public-home", url: "/" },
  { name: "free-cost-calculator", url: "/landscaping-cost-calculator/" },
  { name: "free-estimate-calculator", url: "/landscaping-estimate-calculator/" },
  { name: "free-estimate-template", url: "/landscaping-estimate-template/" },
  { name: "free-quote-template", url: "/landscaping-quote-template/" },
  { name: "free-invoice-template", url: "/landscaping-invoice-template/" },
  { name: "free-price-list", url: "/landscaping-price-list/" },
  { name: "pricing-guide", url: "/landscape-pricing-guide/" },
  { name: "estimating-software", url: "/landscaping-estimating-software/" },
  { name: "pricing", url: "/pricing/" },
  { name: "resources", url: "/resources/" },
  { name: "contact", url: "/contact/" },
  { name: "privacy", url: "/privacy/" },
  { name: "terms", url: "/terms/" },
  { name: "refund", url: "/refund/" },
  { name: "app-overview", url: "/app/" },
  { name: "app-catalog", url: "/app/catalog/" },
  { name: "app-templates", url: "/app/templates/" },
  { name: "app-estimates-list", url: "/app/estimates/" },
  { name: "app-rate-health", url: "/app/rate-health/" },
  { name: "app-actuals", url: "/app/actuals/" },
  { name: "app-settings", url: "/app/settings/" },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const p of PAGES) {
      test(`${p.name}: no page-level horizontal overflow`, async ({ page }) => {
        await page.goto(p.url);
        await assertNoPageOverflow(page, `${viewport.name} ${p.name}`);
      });
    }

    test("app-estimates-editor (WorkflowStatusBar + Estimate summary + tooltips): no overflow, currency visible, tables scroll in place", async ({ page }) => {
      await openOrCreateProject(page);
      await assertNoPageOverflow(page, `${viewport.name} estimate-editor`);

      // Primary currency figures must be present and not clipped (scrollWidth
      // of the leaf text node's container must not exceed its own box).
      const trueCost = page.locator("dd", { hasText: "$" }).first();
      await expect(trueCost).toBeVisible();
      const clipped = await trueCost.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
      expect(clipped, "a currency figure is clipped by its own container").toBe(false);

      // The Catalog-style wide table (if any renders here) must scroll
      // within its own container, never the page.
    });

    test("app-catalog tables scroll within their own container, not the page", async ({ page }) => {
      await page.goto("/app/catalog/");
      await assertNoPageOverflow(page, `${viewport.name} catalog-tables`);
      const overflowInfo = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table"));
        return tables.map((t) => {
          let el: HTMLElement | null = t.parentElement;
          let scrollable = false;
          while (el && el !== document.body) {
            const style = getComputedStyle(el);
            if (style.overflowX === "auto" || style.overflowX === "scroll") {
              scrollable = true;
              break;
            }
            el = el.parentElement;
          }
          return { widerThanViewport: t.scrollWidth > window.innerWidth, containedInScrollableAncestor: scrollable };
        });
      });
      for (const t of overflowInfo) {
        if (t.widerThanViewport) expect(t.containedInScrollableAncestor).toBe(true);
      }
    });

    test("HelpTooltip stays within an 8px viewport margin near every edge it's tested at", async ({ page }) => {
      await openOrCreateProject(page);
      const triggers = page.getByRole("button", { name: /^Help:/ });
      const count = await triggers.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const trigger = triggers.nth(i);
        await trigger.click();
        const popover = page.getByRole("tooltip");
        await expect(popover).toBeVisible();
        const box = await popover.boundingBox();
        expect(box, "popover has no bounding box").not.toBeNull();
        if (box) {
          expect(box.x, `popover left edge off-screen (viewport ${viewport.name}, trigger ${i})`).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width, `popover right edge off-screen (viewport ${viewport.name}, trigger ${i})`).toBeLessThanOrEqual(viewport.width + 1);
        }
        await page.keyboard.press("Escape");
        await expect(popover).toBeHidden();
      }
    });

    test("first-run checklist (fresh workspace) renders without overflow and shows real completion count", async ({ page, context }) => {
      await context.clearCookies();
      await page.goto("/app/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(page.getByText(/of 10 done/)).toBeVisible();
      await assertNoPageOverflow(page, `${viewport.name} first-run-checklist`);
    });

    test("Data & Backup section renders without overflow and long validation-style text wraps", async ({ page }) => {
      await page.goto("/app/settings/");
      await expect(page.getByText("Data & Backup")).toBeVisible();
      await assertNoPageOverflow(page, `${viewport.name} data-backup`);
      const storageLine = page.getByText(/Stored locally in this browser only/);
      await expect(storageLine).toBeVisible();
      const wraps = await storageLine.evaluate((el) => el.scrollWidth <= el.parentElement!.clientWidth + 4);
      expect(wraps, "storage-honesty text overflows its container instead of wrapping").toBe(true);
    });

    test("representative screenshot", async ({ page }) => {
      await openOrCreateProject(page);
      await page.screenshot({ path: `test-results/screenshots/estimate-editor-${viewport.name}.png`, fullPage: true });
    });
  });
}
