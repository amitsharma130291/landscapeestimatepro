import type { IncomingMessage, ServerResponse } from "node:http";
import DodoPayments from "dodopayments";

/**
 * Creates a Dodo Payments checkout session for the single Pro product and
 * hands back its hosted checkout URL — the API key can only ever live
 * server-side, never in browser code. A plain root-level Vercel function,
 * not an Astro API route, and deliberately self-contained (no imports from
 * ../src) — see api/contact.ts's own comment for exactly why: this
 * project's static build has no server adapter, and Vercel's Node builder
 * does not bundle a TypeScript function's local relative imports.
 *
 * No database involved anywhere in this checkout/license system: the
 * browser hangs onto the returned session id itself (sessionStorage) and
 * re-verifies it live against Dodo's own API afterward — see
 * api/checkout-verify.ts. A license key is just the Dodo payment id in
 * disguise (buildLicenseKey below), so "is this key valid" is always
 * answerable by asking Dodo directly, forever, with nothing to keep in
 * sync locally.
 */
interface VercelStyleRequest extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelStyleRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const productId = process.env.DODO_PRODUCT_ID_PRO;
  if (!apiKey || !productId) {
    console.error("checkout-create: missing DODO_PAYMENTS_API_KEY or DODO_PRODUCT_ID_PRO.");
    sendJson(res, 500, { ok: false, error: "Payments aren't set up yet — check back soon." });
    return;
  }

  const payload = req.body as { returnTo?: unknown } | undefined;
  // Only ever an internal path from the browser's own startCheckout() call,
  // but validated anyway since it's used to build a redirect URL — an
  // unvalidated value here could send Dodo's return_url off-site.
  const safeReturnTo = typeof payload?.returnTo === "string" && /^\/[a-z0-9/-]*$/i.test(payload.returnTo) ? payload.returnTo : "/landscaping-estimating-software/";

  const client = new DodoPayments({
    bearerToken: apiKey,
    environment: process.env.DODO_ENVIRONMENT?.trim() === "live_mode" ? "live_mode" : "test_mode",
  });

  const origin = `https://${req.headers.host}`;

  try {
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      metadata: { product: "landscape-estimate-pro" },
      return_url: `${origin}${safeReturnTo}`,
    });
    sendJson(res, 200, { ok: true, checkoutUrl: session.checkout_url, sessionId: session.session_id });
  } catch (err) {
    console.error("checkout-create: Dodo checkout session creation failed.", err);
    sendJson(res, 502, { ok: false, error: "Couldn't start checkout. Please try again." });
  }
}
