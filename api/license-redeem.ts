import type { IncomingMessage, ServerResponse } from "node:http";
import DodoPayments from "dodopayments";

/**
 * Manual unlock path: paste in a license key (from the purchase/recovery
 * email) to activate on a new device/browser where localStorage never had
 * it, or after clearing site data. Fully self-verifying with no database —
 * a key is just `LEP-PRO-<dodo payment id>`, so redeeming it is simply
 * "look that payment up and check it actually succeeded."
 *
 * Self-contained on purpose (no imports from ../src or sibling /api
 * files) — see api/contact.ts's comment for why.
 */
interface VercelStyleRequest extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/** Case-insensitive on the fixed "LEP-PRO-" prefix (a phone keyboard's
 * autocapitalize shouldn't break pasting), but the payment id itself is
 * captured verbatim — Dodo ids are case-sensitive. */
function parseLicenseKey(rawKey: unknown): { paymentId: string } | null {
  const trimmed = String(rawKey ?? "").trim();
  const match = trimmed.match(/^lep-pro-(.+)$/i);
  if (!match) return null;
  return { paymentId: match[1] };
}

export default async function handler(req: VercelStyleRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const payload = req.body as { licenseKey?: unknown } | undefined;
  const parsed = parseLicenseKey(payload?.licenseKey);
  if (!parsed) {
    sendJson(res, 400, { ok: false, error: "That doesn't look like a valid license key." });
    return;
  }

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    console.error("license-redeem: missing DODO_PAYMENTS_API_KEY.");
    sendJson(res, 500, { ok: false, error: "Payments aren't set up yet." });
    return;
  }

  const client = new DodoPayments({
    bearerToken: apiKey,
    environment: process.env.DODO_ENVIRONMENT?.trim() === "live_mode" ? "live_mode" : "test_mode",
  });

  try {
    const payment = await client.payments.retrieve(parsed.paymentId);
    const status = String(payment.status ?? "").toLowerCase();
    if (status !== "succeeded") {
      sendJson(res, 200, { ok: false, status: status || "unknown" });
      return;
    }
    sendJson(res, 200, { ok: true, paymentId: payment.payment_id, licenseKey: `LEP-PRO-${payment.payment_id}` });
  } catch (err) {
    console.error("license-redeem: Dodo lookup failed.", err);
    sendJson(res, 502, { ok: false, error: "Couldn't verify that license key. Please try again." });
  }
}
