import type { IncomingMessage, ServerResponse } from "node:http";
import DodoPayments from "dodopayments";
import nodemailer from "nodemailer";

/**
 * "Forgot your license key" self-service resend: query Dodo directly for
 * succeeded payments on the Pro product and match by customer email — no
 * database, Dodo's own records are the lookup.
 *
 * Deliberately NOT using customers.list({email}) -> payments.list({customer_id})
 * — that depends on a hosted checkout actually creating a queryable Customer
 * record, which isn't guaranteed. payments.list({product_id}) directly,
 * filtered by payment.customer.email and payment.status client-side, only
 * depends on fields confirmed present on the list response.
 *
 * Self-contained on purpose (no imports from ../src or sibling /api
 * files, including the email templates in checkout-verify.ts, which are
 * intentionally duplicated here) — see api/contact.ts's comment for why.
 */
interface VercelStyleRequest extends IncomingMessage {
  body?: unknown;
}

const SITE_NAME = "Landscape Estimate Pro";
const SITE_URL = "https://landscapeestimatepro.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 2000; // defensive cap against a runaway iterator, not a real limit at this volume

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function escapeHtml(str: string): string {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function getTransporter(): { transporter: ReturnType<typeof nodemailer.createTransport>; gmailUser: string } | null {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!gmailUser || !gmailAppPassword) return null;
  return { transporter: nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailAppPassword } }), gmailUser };
}

function resendEmail(licenseKey: string, appUrl: string, activateUrl: string): { text: string; html: string } {
  const text = [
    "You asked for your Landscape Estimate Pro license key to be resent — here it is.",
    "",
    `License key: ${licenseKey}`,
    "",
    `Go to the app: ${appUrl}`,
    "",
    "How to activate it if you're not redirected automatically:",
    `1. Go to ${activateUrl}`,
    `2. Paste your license key: ${licenseKey}`,
    "3. Click Activate.",
    "",
    "Questions about your purchase? Just reply to this email.",
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111111">
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#0E2A1E;margin:0 0 10px">${escapeHtml(SITE_NAME)}</p>
    <h1 style="font-size:22px;margin:0 0 10px">Here's your license key</h1>
    <p style="font-size:14px;line-height:1.6;color:#4A4C4F;margin:0 0 20px">You asked for your ${escapeHtml(SITE_NAME)} license key to be resent — here it is.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F0;border:1px solid #D9D9D4;border-radius:8px;margin:0 0 20px">
      <tr>
        <td style="padding:16px 20px;font-size:13px;color:#4A4C4F">License key</td>
        <td style="padding:16px 20px;font-size:14px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right">${escapeHtml(licenseKey)}</td>
      </tr>
    </table>

    <a href="${appUrl}" style="display:inline-block;background:#0E2A1E;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;margin:0 0 26px">Go to the app</a>

    <p style="font-size:13px;font-weight:700;margin:0 0 8px">If that link doesn't activate it automatically</p>
    <ol style="font-size:13px;line-height:1.7;color:#4A4C4F;margin:0 0 20px;padding-left:18px">
      <li>Go to <a href="${activateUrl}">${activateUrl}</a></li>
      <li>Paste your license key: <strong>${escapeHtml(licenseKey)}</strong></li>
      <li>Click <strong>Activate</strong>.</li>
    </ol>

    <hr style="border:none;border-top:1px solid #D9D9D4;margin:0 0 16px" />
    <p style="font-size:12.5px;color:#4A4C4F;margin:0">Questions about your purchase? Just reply to this email.</p>
  </div>`;

  return { text, html };
}

async function fetchSucceededPayments(client: DodoPayments, productId: string) {
  const results: DodoPayments.PaymentListResponse[] = [];
  let count = 0;
  // status can't be combined with product_id in the same list() call — that
  // combination silently returns zero results. Neither can page_number be
  // passed explicitly at all (even the default value of 1 zeroes out
  // results that otherwise come back fine) — both are real API/SDK quirks.
  // Async-iterating the page (the SDK's own pagination) avoids page_number
  // entirely; status is filtered here in JS instead.
  for await (const payment of client.payments.list({ product_id: productId, page_size: 100 })) {
    if (payment.status === "succeeded") results.push(payment);
    count += 1;
    if (count >= MAX_ITEMS) break;
  }
  return results;
}

export default async function handler(req: VercelStyleRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const payload = req.body as { email?: unknown } | undefined;
  const email = String(payload?.email ?? "").trim();
  if (!EMAIL_RE.test(email)) {
    sendJson(res, 400, { ok: false, error: "Enter a valid email address." });
    return;
  }

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const productId = process.env.DODO_PRODUCT_ID_PRO;
  // Always the same generic response regardless of what's found — never
  // confirms or denies whether an email has ever made a purchase.
  const generic = { ok: true, message: "If that email has a completed purchase, we've sent the license key to it." };

  if (!apiKey || !productId) {
    console.error("license-recover: missing DODO_PAYMENTS_API_KEY or DODO_PRODUCT_ID_PRO.");
    sendJson(res, 200, generic);
    return;
  }

  const client = new DodoPayments({
    bearerToken: apiKey,
    environment: process.env.DODO_ENVIRONMENT?.trim() === "live_mode" ? "live_mode" : "test_mode",
  });

  try {
    const succeeded = await fetchSucceededPayments(client, productId);
    const target = email.toLowerCase();
    const matches = succeeded.filter((p) => p.customer?.email?.toLowerCase() === target);
    console.log(`license-recover: ${succeeded.length} succeeded payment(s) checked, ${matches.length} matched for this email.`);

    const setup = getTransporter();
    if (setup) {
      for (const payment of matches) {
        const licenseKey = `LEP-PRO-${payment.payment_id}`;
        const appUrl = `${SITE_URL}/app/?license=${encodeURIComponent(licenseKey)}`;
        const activateUrl = `${SITE_URL}/pricing/#activate-license`;
        try {
          const { text, html } = resendEmail(licenseKey, appUrl, activateUrl);
          await setup.transporter.sendMail({
            from: `"${SITE_NAME}" <${setup.gmailUser}>`,
            to: email,
            replyTo: process.env.CONTACT_TO_EMAIL,
            subject: `[${SITE_NAME}] Your license key (resent)`,
            text,
            html,
          });
        } catch (err) {
          console.error("license-recover: resend email failed.", err);
        }
      }
    } else if (matches.length > 0) {
      console.error("license-recover: GMAIL_USER/GMAIL_APP_PASSWORD not configured — found a match but couldn't email it.");
    }
  } catch (err) {
    // Still return the generic message — a lookup failure shouldn't reveal
    // anything different from "we found nothing" to the caller.
    console.error("license-recover: lookup failed.", err);
  }

  sendJson(res, 200, generic);
}
