/**
 * Phase 8 — automated static/structural accessibility audit via axe-core.
 * This is real, tool-verified coverage of: missing accessible names,
 * duplicate IDs, invalid ARIA, label/input association, contrast, landmark
 * structure, heading order, and more (whatever axe-core's ruleset covers).
 *
 * It does NOT replace a real screen reader — axe-core can prove markup is
 * technically well-formed, but not that NVDA/VoiceOver actually announce it
 * usefully in context. LEP-139 stays Blocked pending real screen-reader
 * evidence; see the NVDA/VoiceOver script this phase also produces.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openOrCreateProject } from "./helpers";

const PAGES = [
  { name: "public-home", url: "/" },
  { name: "free-cost-calculator", url: "/landscaping-cost-calculator/" },
  { name: "free-price-list", url: "/landscaping-price-list/" },
  { name: "app-overview", url: "/app/" },
  { name: "app-catalog", url: "/app/catalog/" },
  // DEF-11 regression: the sample workspace seeds assemblies with material/
  // equipment lines already attached, and those lines' Select dropdowns had
  // no accessible name at all (axe "select-name", critical) until fixed —
  // this page must stay in the audited set so that class of defect can't
  // silently return.
  { name: "app-templates", url: "/app/templates/" },
  { name: "app-estimates-list", url: "/app/estimates/" },
  { name: "app-settings", url: "/app/settings/" },
];

for (const p of PAGES) {
  test(`axe: ${p.name} has no serious/critical violations`, async ({ page }) => {
    await page.goto(p.url);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    if (serious.length > 0) {
      const detail = serious.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`).join("\n");
      test.info().annotations.push({ type: "axe-violations", description: detail });
    }
    expect(serious, `serious/critical axe violations on ${p.name}:\n${serious.map((v) => v.id).join(", ")}`).toEqual([]);
  });
}

test("axe: estimate editor (WorkflowStatusBar, Estimate summary, HelpTooltip open) has no serious/critical violations", async ({ page }) => {
  await openOrCreateProject(page);
  await page.getByRole("button", { name: /^Help:/ }).first().click(); // open a tooltip so its markup is scanned too
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
});

test("DEF-11b regression: axe: estimate editor WITH a service line added (the assembly-choice Select had no accessible name, critical, until fixed)", async ({ page }) => {
  await openOrCreateProject(page);
  await page.getByRole("button", { name: "+ Add service" }).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
});

test("dialog semantics: HelpTooltip trigger exposes aria-expanded/aria-controls/aria-describedby correctly", async ({ page }) => {
  await openOrCreateProject(page);
  const trigger = page.getByRole("button", { name: /^Help:/ }).first();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const controls = await trigger.getAttribute("aria-controls");
  const describedby = await trigger.getAttribute("aria-describedby");
  expect(controls).toBe(describedby);
  await expect(page.locator(`#${controls}`)).toHaveAttribute("role", "tooltip");
});

test("no duplicate element ids on a data-heavy page (Estimates editor, many form fields)", async ({ page }) => {
  await openOrCreateProject(page);
  const dupes = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) dup.add(id);
      seen.add(id);
    }
    return Array.from(dup);
  });
  expect(dupes, `duplicate ids found: ${dupes.join(", ")}`).toEqual([]);
});

test("axe: below-target-margin warning (dark summary card) has no serious/critical contrast violations", async ({ page }) => {
  await openOrCreateProject(page);
  // Lock a quote, then record a deliberately low actual price to trigger the
  // below-target warning box on the dark "Estimate summary" card.
  await page.getByRole("button", { name: "Review and quote" }).click();
  // One persistent handler that responds correctly regardless of which of
  // the two dialogs (the price prompt(), then the below-target confirm())
  // fires next — window.prompt/confirm block page JS until answered, so
  // each must be resolved before the next one can even appear.
  page.on("dialog", (d) => (d.type() === "prompt" ? d.accept("1.00") : d.accept()));
  await page.getByRole("button", { name: "Record actual price" }).click();
  await expect(page.locator('[role="alert"]').filter({ hasText: "target margin" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).include('[role="alert"]').analyze();
  const contrastViolations = results.violations.filter((v) => v.id === "color-contrast");
  expect(contrastViolations, contrastViolations.map((v) => v.help).join("\n")).toEqual([]);
});

test("heading order: app pages don't skip levels (h1 -> h2, never h1 -> h3)", async ({ page }) => {
  await page.goto("/app/estimates/");
  const levels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((el) => Number(el.tagName[1]))
  );
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1], `heading jumped from h${levels[i - 1]} to h${levels[i]}`).toBeLessThanOrEqual(1);
  }
});
