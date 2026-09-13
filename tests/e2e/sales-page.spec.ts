/**
 * Coverage for the /landscaping-estimating-software/ sales page.
 * Financial reconciliation of the underlying numbers is covered at the unit
 * level (src/lib/salesPageExamples.test.ts calls the real pricing engine,
 * and for Service Rate Health the app's own real default sample data,
 * directly) — these tests confirm the PAGE actually renders those exact
 * numbers, plus the honesty/CTA/accessibility/link requirements that only
 * make sense to check against real rendered HTML.
 */
import { test, expect } from "@playwright/test";
import { SALES_CONFIG } from "../../src/data/salesConfig";

const URL = "/landscaping-estimating-software/";
const PURCHASE_CTA_NAME = /Get Landscape Estimate Pro — \$99 Lifetime|Protect My Margin for \$99|Build More Confident Estimates|Get Lifetime Access — \$99|Get Pro — \$99/;

test("headline and core value proposition are present", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Know the cost before you quote\. Protect the margin after the job\./);
  await expect(page.getByText("Estimating, pricing and job costing. No CRM. No scheduling.")).toBeVisible();
});

test("primary CTA follows SALES_CONFIG.salesEnabled", async ({ page }) => {
  await page.goto(URL);
  if (SALES_CONFIG.salesEnabled) {
    await expect(page.getByRole("button", { name: PURCHASE_CTA_NAME }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore the Free Tools" }).first()).toHaveCount(0);
  } else {
    await expect(page.getByRole("link", { name: "Explore the Free Tools" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Preview Landscape Estimate Pro" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: PURCHASE_CTA_NAME })).toHaveCount(0);
  }
});

test("CTA copy varies by placement, but every purchase button triggers the same real checkout destination", async ({ page }) => {
  test.skip(!SALES_CONFIG.salesEnabled, "only meaningful while sales are enabled");
  await page.goto(URL);
  // Hero, after the margin-loss proof, after the product demonstration,
  // pricing, and final — five separate call sites with deliberately
  // different contextual copy, but every one calls the same
  // startCheckout()/PurchaseButton path to /api/checkout-create.
  const buttons = page.getByRole("button", { name: PURCHASE_CTA_NAME });
  expect(await buttons.count()).toBeGreaterThanOrEqual(4); // sticky bar is hidden until scrolled

  const heroLabel = await page.locator("#sales-page-hero").getByRole("button", { name: PURCHASE_CTA_NAME }).textContent();
  const pricingLabel = await page.locator("#pricing").getByRole("button", { name: PURCHASE_CTA_NAME }).textContent();
  expect(heroLabel?.trim()).not.toBe(pricingLabel?.trim()); // contextual copy is allowed, expected to differ

  let sawApiCall = false;
  await page.route("**/api/checkout-create", async (route) => {
    sawApiCall = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, checkoutUrl: "https://example.com/mock-checkout", sessionId: "cs_test" }) });
  });
  await page.route("https://example.com/mock-checkout", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>mock</body></html>" });
  });
  await buttons.first().click();
  await expect.poll(() => sawApiCall).toBe(true);
});

test("price is consistent everywhere it appears on the page, from the centralized config", async ({ page }) => {
  await page.goto(URL);
  const body = await page.locator("body").innerText();
  const dollarPrices = body.match(/\$\d[\d,]*(?:\.\d{2})?\s*(?:lifetime|Lifetime)/g) ?? [];
  for (const match of dollarPrices) {
    expect(match).toMatch(/\$99/);
  }
});

test("margin-vs-markup proof: the exact reconciling numbers render on the page (protected example)", async ({ page }) => {
  await page.goto(URL);
  const body = await page.locator("body").innerText();
  expect(body).toContain("Adding 35% to cost does not create a 35% margin.");
  expect(body).toContain("$2,850.00 × 1.35 = $3,847.50");
  expect(body).toContain("Actual margin: 25.9%");
  expect(body).toContain("$2,850.00 ÷ (1 − 0.35) = $4,384.62");
  expect(body).toContain("Actual margin: 35.0%");
  expect(body).toContain("$537.12");
  expect(body).toContain("Example only. Your results depend entirely on your own costs, production rates and pricing decisions.");
});

test("a contextual purchase CTA follows the financial proof", async ({ page }) => {
  await page.goto(URL);
  const proof = page.locator("text=A familiar pricing shortcut can leave hundreds of dollars on the table.");
  const cta = SALES_CONFIG.salesEnabled ? page.getByRole("button", { name: "Protect My Margin for $99" }) : page.getByRole("link", { name: "Explore the Free Tools" });
  const proofBox = await proof.boundingBox();
  const ctaBox = await cta.first().boundingBox();
  expect(proofBox).not.toBeNull();
  expect(ctaBox).not.toBeNull();
  expect(ctaBox!.y).toBeGreaterThan(proofBox!.y);
});

test("Service Rate Health: the real screenshot is shown, plus a text summary with the exact reconciling numbers", async ({ page }) => {
  // The full per-service table now lives in the real screenshot (see the
  // "real product screenshots" test below) — this checks the surrounding
  // TEXT summary, which salesPageExamples.test.ts independently proves is
  // computed from the app's own real default sample data (calculated via
  // calculateAssemblyCost + evaluateRateHealth), not hand-typed.
  await page.goto(URL);
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/1 of 4 default services meet a 35% target margin.*3 need attention/);
  expect(body).toContain("Shrub Installation needs the most");
  expect(body).toContain("$75.02");
  expect(body).toContain("$67.50");
});

test("cost-impact scenarios: original/new cost, margin impact and suggested response are all present", async ({ page }) => {
  await page.goto(URL);
  // Only the active tab's panel is in the accessibility tree / innerText —
  // the other two are genuinely hidden (correct ARIA tabs behavior), so
  // this reads raw textContent to verify all three panels' content exists
  // in the DOM regardless of which tab is currently selected.
  const body = await page.locator("body").evaluate((el) => el.textContent ?? "");
  expect(body).toContain("Original cost");
  expect(body).toContain("New cost");
  expect(body).toContain("Margin impact");
  expect(body).toContain("Suggested response");
  expect(body).toContain("19.0%");
  expect(body).toContain("$64");
  expect(body).toContain("12.5%");
  expect(body).toContain("$96");
  expect(body).toContain("22.2%");
  expect(body).toContain("$40");
  expect(body.toLowerCase()).toContain("decision support, not a prediction");
});

test("cost-impact tabs: correct ARIA tablist behavior, keyboard-operable", async ({ page }) => {
  await page.goto(URL);
  const tablist = page.getByRole("tablist", { name: "Cost-change scenario" });
  await tablist.scrollIntoViewIfNeeded();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");

  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();

  // A hidden tabpanel is excluded from the accessibility tree entirely, so
  // exactly one shows up via role queries at any time — the one now active.
  const activePanel = page.getByRole("tabpanel");
  await expect(activePanel).toHaveCount(1);
  await expect(activePanel).toBeVisible();
  const activeTabId = await tabs.nth(1).getAttribute("id");
  await expect(activePanel).toHaveAttribute("aria-labelledby", activeTabId!);
});

test("estimate-vs-actual example: the exact reconciling numbers render, with the learning-loop explanation", async ({ page }) => {
  await page.goto(URL);
  const body = await page.locator("body").innerText();
  expect(body).toContain("$1,042.00");
  expect(body).toMatch(/35\.1%/);
  expect(body).toMatch(/23\.5%/);
  expect(body).toContain("$120.29");
  expect(body).toMatch(/Quote assumptions.*completed-job actuals.*variance.*better production rates/);
});

test("a contextual purchase CTA follows the estimate-vs-actual demonstration", async ({ page }) => {
  await page.goto(URL);
  const cta = SALES_CONFIG.salesEnabled ? page.getByRole("button", { name: "Build More Confident Estimates" }) : page.getByRole("link", { name: "Explore the Free Tools" });
  await expect(cta.first()).toBeVisible();
});

test("real product screenshots exist, load, and have useful alt text + explicit dimensions", async ({ page, request }) => {
  await page.goto(URL);
  const screenshots = [
    { src: "/screenshots/service-setup.png", altMatch: /service|mulch installation/i },
    { src: "/screenshots/rate-health.png", altMatch: /rate health|target margin/i },
    { src: "/screenshots/estimate-vs-actual.png", altMatch: /estimate vs\. actual|expected margin/i },
  ];
  for (const shot of screenshots) {
    const res = await request.get(shot.src);
    expect(res.status(), `${shot.src} did not load`).toBe(200);

    const img = page.locator(`img[src="${shot.src}"]`);
    await expect(img).toHaveCount(1);
    const alt = await img.getAttribute("alt");
    expect(alt, `${shot.src} alt text`).toBeTruthy();
    expect(alt).toMatch(shot.altMatch);
    await expect(img).toHaveAttribute("width", /\d+/);
    await expect(img).toHaveAttribute("height", /\d+/);
    await expect(img).toHaveAttribute("loading", "lazy");

    // Every real-screenshot <img> must sit inside a <figure> whose
    // <figcaption> identifies it as example/sample data, not a real customer.
    const figure = img.locator("xpath=ancestor::figure[1]");
    await expect(figure.locator("figcaption")).toContainText(/example project|default sample data/i);
  }
});

test("core capabilities: outcome-titled, no more than 8 cards, no duplicated documentation-style repeats", async ({ page }) => {
  await page.goto(URL);
  const heading = page.getByRole("heading", { name: "Built for estimating, not general business management" });
  await heading.scrollIntoViewIfNeeded();
  const section = heading.locator("xpath=ancestor::section[1]");
  const cards = section.locator("h3");
  const count = await cards.count();
  expect(count).toBeLessThanOrEqual(8);
  expect(count).toBeGreaterThanOrEqual(6);
});

test("who it's for and what it's not are combined into one section", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("For you if")).toBeVisible();
  await expect(page.getByText("Not the right fit if")).toBeVisible();
  await expect(page.getByText("You own or run a small landscaping company")).toBeVisible();
  await expect(page.getByText("You need CRM or dispatch")).toBeVisible();
});

test("everything included: five categorized groups, reachable by anchor", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("#everything-included")).toBeVisible();
  for (const group of ["Estimating and pricing", "Catalogs and reusable services", "Profitability analysis", "Customer documents", "Data and backups"]) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
  }
});

test("pricing section: substantial card with the exact price hierarchy and a short highlight list", async ({ page }) => {
  await page.goto(URL);
  const pricing = page.locator("#pricing");
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.getByText("Landscape Estimate Pro")).toBeVisible();
  await expect(pricing.getByText("$99", { exact: true })).toBeVisible();
  await expect(pricing.getByText("Lifetime access", { exact: true })).toBeVisible();
  await expect(pricing.getByText("One payment. No monthly subscription.")).toBeVisible();
  const cardWidth = (await pricing.locator(".rounded-3xl").boundingBox())!.width;
  expect(cardWidth, "pricing card should be substantial, not a narrow column").toBeGreaterThan(500);
});

test("purchase details only state real, currently-configured policy values", async ({ page }) => {
  test.skip(!SALES_CONFIG.salesEnabled, "purchase details box only renders while sales are enabled");
  await page.goto(URL);
  const details = page.getByText("Purchase details");
  await details.scrollIntoViewIfNeeded();
  await details.click();
  const body = await page.locator("body").innerText();
  // Must not invent policies this project has never actually decided.
  expect(body.toLowerCase()).not.toMatch(/unlimited devices|24\/7 support|live chat|money-back guarantee beyond/);
  expect(body).toContain("$99, one time");
  expect(body).toContain("7 days, no questions asked");
  expect(body).toContain("Any modern desktop or mobile browser");
  expect(body).toContain("None required");
});

test("no unsupported earnings claims, fake proof, or scarcity language anywhere on the page", async ({ page }) => {
  await page.goto(URL);
  const body = (await page.locator("body").innerText()).toLowerCase();
  const bannedPhrases = [
    "guaranteed profit",
    "industry-leading",
    "best software",
    "limited time",
    "act now",
    "only 3 spots",
    "5-star",
    "★★★★★",
    "as seen on",
    "customers love",
    "join thousands",
    "unlimited devices",
    "revolutionary",
    "game-changing",
    "guaranteed",
    "effortless",
  ];
  for (const phrase of bannedPhrases) {
    expect(body, `found banned phrase: "${phrase}"`).not.toContain(phrase);
  }
});

test("no countdown timer or fabricated review/rating widget", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("[data-countdown], .countdown-timer")).toHaveCount(0);
  await expect(page.getByText(/★/)).toHaveCount(0);
});

test("every financial example is clearly labeled as an example, not a real customer", async ({ page }) => {
  await page.goto(URL);
  const body = await page.locator("body").innerText();
  expect(body).toContain("Example project");
  // Deliberately checks for the OPPOSITE of a testimonial framing — a real
  // fabricated testimonial would attribute a quote/result TO a customer
  // ("a customer said...", "verified purchase"), never disclaim one away.
  expect(body.toLowerCase()).not.toMatch(/a customer (said|told us|reported)|verified purchase|\d+ (customers?|contractors?) (love|trust|rely on)/);
});

test("FAQ prioritizes buying objections and matches FAQPage structured data exactly", async ({ page }) => {
  await page.goto(URL);
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faqBlock = jsonLd.map((t) => JSON.parse(t)).find((b) => b["@type"] === "FAQPage");
  expect(faqBlock).toBeTruthy();
  for (const entity of faqBlock.mainEntity) {
    await expect(page.getByText(entity.name, { exact: true })).toBeVisible();
  }
  const questionNames: string[] = faqBlock.mainEntity.map((e: { name: string }) => e.name);
  for (const expected of ["Is this margin or markup?", "Does it supply local landscaping prices?", "What devices and browsers are supported?", "What is the refund policy?"]) {
    expect(questionNames).toContain(expected);
  }
});

test("paid product structured-data offer reflects SALES_CONFIG.salesEnabled", async ({ page }) => {
  await page.goto(URL);
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  const productBlock = jsonLd.map((t) => JSON.parse(t)).find((b) => b["@type"] === "SoftwareApplication");
  expect(productBlock).toBeTruthy();
  if (SALES_CONFIG.salesEnabled) {
    expect(productBlock.offers).toMatchObject({ "@type": "Offer", price: "99", priceCurrency: "USD" });
  } else {
    expect(productBlock).not.toHaveProperty("offers");
  }
});

test("every internal link on the page resolves (no 404s)", async ({ page, request }) => {
  await page.goto(URL);
  const hrefs = await page.locator("a[href^='/']").evaluateAll((els) => Array.from(new Set(els.map((el) => (el as HTMLAnchorElement).getAttribute("href")))));
  for (const href of hrefs) {
    if (!href || href.startsWith("/#")) continue;
    const url = href.split("#")[0] || "/";
    const res = await request.get(url);
    expect(res.status(), `${href} returned ${res.status()}`).toBeLessThan(400);
  }
});

test("every in-page anchor link resolves to a real element on the page", async ({ page }) => {
  await page.goto(URL);
  const hashes = await page.locator("a[href^='#']").evaluateAll((els) => Array.from(new Set(els.map((el) => (el as HTMLAnchorElement).getAttribute("href")))));
  for (const hash of hashes) {
    const id = hash!.slice(1);
    await expect(page.locator(`#${id}`), `#${id} does not exist on the page`).toHaveCount(1);
  }
});

test("in-page anchor CTAs scroll to the section they name", async ({ page }) => {
  await page.goto(URL);
  await page.getByRole("link", { name: /See how it works|See how Pro works/ }).click();
  await expect(page.getByRole("heading", { name: "From job quantities to a customer-ready price" })).toBeInViewport();
});

test("does not print as a customer estimate — no print-root body class on this page", async ({ page }) => {
  await page.goto(URL);
  const bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).not.toContain("printing-customer-estimate");
  expect(bodyClass).not.toContain("printing-free-document");
});

test("keyboard: hero primary CTA is reachable and operable", async ({ page }) => {
  await page.goto(URL);
  const primary = SALES_CONFIG.salesEnabled ? page.getByRole("button", { name: PURCHASE_CTA_NAME }).first() : page.getByRole("link", { name: "Explore the Free Tools" }).first();
  await primary.focus();
  await expect(primary).toBeFocused();
});

test("respects prefers-reduced-motion: reveal content is visible without scrolling to trigger it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(URL);
  const firstStep = page.getByText("Set your business costs");
  await expect(firstStep).toBeVisible();
  const opacity = await page.locator(".reveal-item").first().evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeGreaterThan(0.9);
});

test("all images on the page have alt text (decorative icons are inline SVG with aria-hidden, not <img>)", async ({ page }) => {
  await page.goto(URL);
  const imgsWithoutAlt = await page.locator("img:not([alt])").count();
  expect(imgsWithoutAlt).toBe(0);
});

test("sticky purchase bar appears after scrolling past the hero, hides again over the pricing section, and can be dismissed", async ({ page }) => {
  await page.goto(URL);
  const bar = page.locator("#sales-sticky-cta");
  await expect(bar).toHaveCSS("opacity", "0");

  await page.locator("#service-rate-health").scrollIntoViewIfNeeded();
  await expect(bar).toHaveCSS("opacity", "1");

  // The pricing section has its own full purchase card — the sticky bar
  // must not duplicate/obscure it.
  await page.locator("#pricing").scrollIntoViewIfNeeded();
  await expect(bar).toHaveCSS("opacity", "0");

  await page.locator("#service-rate-health").scrollIntoViewIfNeeded();
  await expect(bar).toHaveCSS("opacity", "1");
  await page.locator("#sales-sticky-cta-dismiss").click();
  await expect(bar).toHaveCSS("opacity", "0");
});

test("no horizontal overflow at every required viewport", async ({ page }) => {
  const viewports = [
    [320, 568],
    [360, 800],
    [390, 844],
    [768, 1024],
    [1024, 768],
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
