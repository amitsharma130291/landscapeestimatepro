/**
 * Phase 2 — real rendered-geometry proof that `.tap-target` actually gives
 * every covered control a >=44x44 CSS px effective hit area, without
 * growing its visible box. jsdom (Vitest) can't compute real pseudo-element
 * layout, so this is the one place that claim gets verified against an
 * actual browser layout engine.
 */
import { test, expect, type Page } from "@playwright/test";
import { openOrCreateProject } from "./helpers";

async function measureTapTargets(page: Page) {
  return page.$$eval(".tap-target", (elements) =>
    elements
      .filter((el) => (el as HTMLElement).offsetParent !== null) // visible only
      .map((el) => {
        const visible = el.getBoundingClientRect();
        const after = window.getComputedStyle(el, "::after");
        return {
          label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
          visibleWidth: Math.round(visible.width),
          visibleHeight: Math.round(visible.height),
          hitWidth: Math.round(parseFloat(after.width)),
          hitHeight: Math.round(parseFloat(after.height)),
        };
      })
  );
}

test.describe("Touch targets — .tap-target gives every covered control a real >=44px hit area", () => {
  test("Estimates editor: revision/status/disclosure controls all measure >=44px", async ({ page }) => {
    await openOrCreateProject(page);
    const targets = await measureTapTargets(page);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(t.hitWidth, `"${t.label}" hit width`).toBeGreaterThanOrEqual(44);
      expect(t.hitHeight, `"${t.label}" hit height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("the hit area never shrinks a control that was already >=44px (no visual regression)", async ({ page }) => {
    await page.goto("/app/estimates/");
    const targets = await measureTapTargets(page);
    for (const t of targets) {
      if (t.visibleWidth >= 44) expect(t.hitWidth).toBeGreaterThanOrEqual(t.visibleWidth);
      if (t.visibleHeight >= 44) expect(t.hitHeight).toBeGreaterThanOrEqual(t.visibleHeight);
    }
  });

  test("visible size is unchanged by the hit-area expansion — compact controls stay visually compact", async ({ page }) => {
    await openOrCreateProject(page);
    const helpTrigger = page.getByRole("button", { name: /^Help:/ }).first();
    const box = await helpTrigger.boundingBox();
    // The trigger's own visible box is still the small 16x16 icon button —
    // only its ::after hit area is 44px, never the element itself.
    expect(box!.width).toBeLessThan(44);
    expect(box!.height).toBeLessThan(44);
  });

  test("Catalog: material/equipment remove buttons and Add buttons all measure >=44px", async ({ page }) => {
    await page.goto("/app/catalog/");
    await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
    const targets = await measureTapTargets(page);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(t.hitWidth, `"${t.label}" hit width`).toBeGreaterThanOrEqual(44);
      expect(t.hitHeight, `"${t.label}" hit height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("adjacent tap-targets (Duplicate/Delete on a project card) do not overlap", async ({ page }) => {
    await page.goto("/app/estimates/");
    await expect(page.getByRole("heading", { name: "Estimates", exact: true })).toBeVisible();
    if (!(await page.getByRole("button", { name: "Open" }).first().isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "New estimate" }).click();
      await page.getByRole("button", { name: "← Back to estimates" }).click();
    }
    const card = page.locator("li").filter({ has: page.getByRole("button", { name: "Open" }) }).first();
    const duplicate = card.getByRole("button", { name: /^Duplicate/ });
    const remove = card.getByRole("button", { name: /^Delete/ });
    await Promise.all([duplicate.boundingBox(), remove.boundingBox()]); // ensure both are attached/visible before measuring
    // Read the actual ::after geometry for each to compute real hit-box edges.
    const afterInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".tap-target")).filter(
        (el) => (el.getAttribute("aria-label") || "").match(/^(Duplicate|Delete)/)
      );
      return btns.map((el) => {
        const r = el.getBoundingClientRect();
        const after = window.getComputedStyle(el, "::after");
        return { label: el.getAttribute("aria-label"), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: parseFloat(after.width), h: parseFloat(after.height) };
      });
    });
    expect(afterInfo.length).toBe(2);
    const [a, b] = afterInfo;
    // Whichever is actually on the left, its right hit-edge must not pass
    // the other's left hit-edge.
    const [left, right] = a.cx < b.cx ? [a, b] : [b, a];
    expect(left.cx + left.w / 2).toBeLessThanOrEqual(right.cx - right.w / 2 + 1); // +1px float tolerance
  });
});
