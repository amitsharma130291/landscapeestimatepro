/**
 * The contact form's backend (api/contact.ts) is a plain Vercel serverless
 * function living outside Astro entirely — see astro.config.mjs for why —
 * so there is no local server for these tests to hit for real, and doing so
 * would actually send email. Every test here intercepts POST /api/contact
 * and asserts on the FORM's own client-side behavior (validation, the
 * request it sends, and how it reacts to the mocked response) — the
 * request-payload shape and success/error rendering, not real delivery.
 */
import { test, expect } from "@playwright/test";

test("submits the exact subject/email/message the visitor typed, and shows the confirmation on success", async ({ page }) => {
  let requestBody: unknown = null;
  await page.route("**/api/contact", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/contact/");
  await page.getByLabel("Subject").fill("A question about pricing");
  await page.getByLabel("Your email").fill("visitor@example.com");
  await page.getByLabel("Message").fill("How does the lifetime price work?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
  await expect(page.getByText(/we'll get back to you/i)).toBeVisible();

  expect(requestBody).toMatchObject({
    subject: "A question about pricing",
    email: "visitor@example.com",
    message: "How does the lifetime price work?",
  });
});

test("rejects an invalid email client-side, without ever calling the API", async ({ page }) => {
  let called = false;
  await page.route("**/api/contact", async (route) => {
    called = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/contact/");
  await page.getByLabel("Subject").fill("Hi");
  await page.getByLabel("Your email").fill("not-an-email");
  await page.getByLabel("Message").fill("Test message");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText(/valid email/i)).toBeVisible();
  expect(called).toBe(false);
});

test("rejects an empty form client-side, without ever calling the API", async ({ page }) => {
  let called = false;
  await page.route("**/api/contact", async (route) => {
    called = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/contact/");
  // Click into a field first — this is a real interaction Playwright will
  // wait to be actionable on, which naturally gives the client:load island
  // time to hydrate before the submit click below (a bare click on a
  // not-yet-hydrated button would fall through to a real, un-prevented
  // native form submission instead of React's handler).
  await page.getByLabel("Subject").click();
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  expect(called).toBe(false);
});

test("surfaces the server's own error message when the send fails, and keeps the typed values in place", async ({ page }) => {
  await page.route("**/api/contact", async (route) => {
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Couldn't send your message right now. Please try again shortly." }) });
  });

  await page.goto("/contact/");
  await page.getByLabel("Subject").fill("A question");
  await page.getByLabel("Your email").fill("visitor@example.com");
  await page.getByLabel("Message").fill("Test message");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("Couldn't send your message right now. Please try again shortly.")).toBeVisible();
  await expect(page.getByLabel("Subject")).toHaveValue("A question");
  await expect(page.getByLabel("Message")).toHaveValue("Test message");
});

test("the honeypot field is positioned off-screen and excluded from keyboard tab order", async ({ page }) => {
  await page.goto("/contact/");
  const honeypot = page.locator("#contact-company");
  // Deliberately off-screen (absolute + a large negative offset) rather than
  // display:none/visibility:hidden — some bots specifically skip fields
  // hidden that way to evade honeypot detection, so this checks it's
  // positioned out of the viewport instead of asserting Playwright's
  // stricter "hidden" (which off-screen positioning alone doesn't satisfy,
  // by design).
  await expect(honeypot).toBeAttached();
  const box = await honeypot.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThan(0);
  // tabindex="-1" is what actually keeps a keyboard-only real visitor from
  // ever landing on it — asserted directly, rather than by counting Tab
  // presses through the rest of the page, which would be fragile against
  // unrelated nav changes.
  await expect(honeypot).toHaveAttribute("tabindex", "-1");
});

test("the footer's Contact link, and the privacy page's contact reference, both point at the real page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Contact" }).click();
  await expect(page).toHaveURL(/\/contact\/$/);

  await page.goto("/privacy/");
  await expect(page.getByRole("link", { name: "contact page" })).toHaveAttribute("href", "/contact/");
});
