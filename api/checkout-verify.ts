import type { IncomingMessage, ServerResponse } from "node:http";
import DodoPayments from "dodopayments";
import nodemailer from "nodemailer";

/**
 * The single source of truth for "has this browser paid" — always asks
 * Dodo directly rather than trusting anything the browser stored, so
 * there's nothing to forge and no database to keep in sync. Called once,
 * client-side, right after the checkout redirect returns (see
 * src/lib/license.ts's resolvePendingCheckout()).
 *
 * A plain root-level Vercel function, not an Astro API route, and
 * deliberately self-contained (no imports from ../src or from sibling
 * files under /api) — see api/contact.ts's own comment for exactly why:
 * this project's static build has no server adapter, and Vercel's Node
 * builder does not bundle a TypeScript function's local relative imports,
 * transpiling each function file alone. The email-sending logic here is
 * intentionally duplicated in api/webhook-dodo.ts and
 * api/license-recover.ts for the same reason.
 *
 * This is the PRIMARY path that emails the license key and unlocks the
 * app — api/webhook-dodo.ts's payment.succeeded handler exists only as a
 * backstop for a customer who closes the tab before this redirect
 * completes (Dodo retries webhooks until acknowledged; a closed tab never
 * comes back on its own).
 */
interface VercelStyleRequest extends IncomingMessage {
  body?: unknown;
}

const SITE_NAME = "Landscape Estimate Pro";
const SITE_URL = "https://landscapeestimatepro.com";

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function buildLicenseKey(paymentId: string): string {
  return `LEP-PRO-${paymentId}`;
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

/** Sent to the customer the moment a payment succeeds — the license key,
 * a "go to app" button that auto-activates it, and how to get back in if
 * they ever lose this email or clear their browser. */
function customerWelcomeEmail(licenseKey: string, appUrl: string, activateUrl: string): { text: string; html: string } {
  const text = [
    "Thanks for buying Landscape Estimate Pro — your setup is done, you can use the app now.",
    "",
    `License key: ${licenseKey}`,
    "",
    `Go to the app: ${appUrl}`,
    "",
    "If you ever lose this email, clear your browser, or switch devices, here's how to get back in:",
    `1. Go to ${activateUrl}`,
    `2. Paste your license key: ${licenseKey}`,
    "3. Click Activate.",
    "",
    "Forgot the key itself? On that same page, click \"Forgot your license key?\", enter the email you paid with, and we'll resend it.",
    "",
    "Questions about your purchase? Just reply to this email.",
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111111">
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#0E2A1E;margin:0 0 10px">${escapeHtml(SITE_NAME)}</p>
    <h1 style="font-size:22px;margin:0 0 10px">Your setup is done — you can use the app now</h1>
    <p style="font-size:14px;line-height:1.6;color:#4A4C4F;margin:0 0 20px">Thanks for buying ${escapeHtml(SITE_NAME)}. Your license is active — here's your key for whenever you need it again.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F0;border:1px solid #D9D9D4;border-radius:8px;margin:0 0 20px">
      <tr>
        <td style="padding:16px 20px;font-size:13px;color:#4A4C4F">License key</td>
        <td style="padding:16px 20px;font-size:14px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right">${escapeHtml(licenseKey)}</td>
      </tr>
    </table>

    <a href="${appUrl}" style="display:inline-block;background:#0E2A1E;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;margin:0 0 26px">Go to the app</a>

    <p style="font-size:13px;font-weight:700;margin:0 0 8px">If you ever lose this email or clear your browser</p>
    <ol style="font-size:13px;line-height:1.7;color:#4A4C4F;margin:0 0 20px;padding-left:18px">
      <li>Go to <a href="${activateUrl}">${activateUrl}</a></li>
      <li>Paste your license key: <strong>${escapeHtml(licenseKey)}</strong></li>
      <li>Click <strong>Activate</strong> — you're back in instantly, no account or login.</li>
    </ol>
    <p style="font-size:13px;line-height:1.6;color:#4A4C4F;margin:0 0 20px">Forgot the key itself? On that same page, click <strong>"Forgot your license key?"</strong>, enter the email you paid with, and we'll resend it.</p>

    <hr style="border:none;border-top:1px solid #D9D9D4;margin:0 0 16px" />
    <p style="font-size:12.5px;color:#4A4C4F;margin:0">Questions about your purchase? Just reply to this email.</p>
  </div>`;

  return { text, html };
}

async function sendOwnerOrderEmail(transporter: ReturnType<typeof nodemailer.createTransport>, gmailUser: string, ownerEmail: string, info: Record<string, unknown>): Promise<void> {
  const rows = Object.entries(info)
    .map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</li>`)
    .join("");
  await transporter.sendMail({
    from: `"${SITE_NAME}" <${gmailUser}>`,
    to: ownerEmail,
    subject: `[${SITE_NAME}] New order — ${String(info.licenseKey ?? info.paymentId ?? "")}`,
    text: `New order on ${SITE_NAME} (${SITE_URL}).\n\n${Object.entries(info)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n")}`,
    html: `<p>New order on <strong>${escapeHtml(SITE_NAME)}</strong> (${escapeHtml(SITE_URL)}).</p><ul>${rows}</ul>`,
  });
}

async function sendOwnerFailureEmail(transporter: ReturnType<typeof nodemailer.createTransport>, gmailUser: string, ownerEmail: string, info: Record<string, unknown>): Promise<void> {
  const rows = Object.entries(info)
    .map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</li>`)
    .join("");
  await transporter.sendMail({
    from: `"${SITE_NAME}" <${gmailUser}>`,
    to: ownerEmail,
    subject: `[${SITE_NAME}] Payment failed`,
    text: `A payment attempt on ${SITE_NAME} (${SITE_URL}) did not succeed.\n\n${Object.entries(info)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n")}`,
    html: `<p>A payment attempt on <strong>${escapeHtml(SITE_NAME)}</strong> (${escapeHtml(SITE_URL)}) did not succeed.</p><ul>${rows}</ul>`,
  });
}

export default async function handler(req: VercelStyleRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const url = new URL(req.url ?? "", `https://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  const paymentIdParam = url.searchParams.get("paymentId");
  const sendEmail = url.searchParams.get("sendEmail") === "1";
  if (!sessionId && !paymentIdParam) {
    sendJson(res, 400, { ok: false, error: "Missing sessionId or paymentId." });
    return;
  }

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const ownerEmail = process.env.CONTACT_TO_EMAIL;
  if (!apiKey) {
    console.error("checkout-verify: missing DODO_PAYMENTS_API_KEY.");
    sendJson(res, 500, { ok: false, error: "Payments aren't set up yet." });
    return;
  }

  const client = new DodoPayments({
    bearerToken: apiKey,
    environment: process.env.DODO_ENVIRONMENT?.trim() === "live_mode" ? "live_mode" : "test_mode",
  });

  try {
    let resolvedPaymentId = paymentIdParam;
    if (!resolvedPaymentId && sessionId) {
      const session = await client.checkoutSessions.retrieve(sessionId);
      if (!session.payment_id) {
        sendJson(res, 200, { ok: false, status: session.payment_status || "pending" });
        return;
      }
      resolvedPaymentId = session.payment_id;
    }
    if (!resolvedPaymentId) {
      sendJson(res, 400, { ok: false, error: "Missing sessionId or paymentId." });
      return;
    }

    const payment = await client.payments.retrieve(resolvedPaymentId);
    const status = String(payment.status ?? "").toLowerCase();
    const customerEmail = payment.customer?.email ?? null;
    const customerName = payment.customer?.name ?? null;

    if (status !== "succeeded") {
      if (sendEmail) {
        const setup = getTransporter();
        if (setup && ownerEmail) {
          try {
            await sendOwnerFailureEmail(setup.transporter, setup.gmailUser, ownerEmail, {
              paymentId: payment.payment_id,
              status: status || "unknown",
              customerEmail: customerEmail ?? "(none)",
              customerName: customerName ?? "(none)",
            });
          } catch (err) {
            console.error("checkout-verify: owner failure email failed.", err);
          }
        }
      }
      sendJson(res, 200, { ok: false, status: status || "unknown" });
      return;
    }

    const licenseKey = buildLicenseKey(payment.payment_id);

    if (sendEmail) {
      const setup = getTransporter();
      if (!setup) {
        console.error("checkout-verify: GMAIL_USER/GMAIL_APP_PASSWORD not configured — license emails not sent.");
      } else {
        const appUrl = `${SITE_URL}/app/?license=${encodeURIComponent(licenseKey)}`;
        const activateUrl = `${SITE_URL}/pricing/#activate-license`;
        // Awaited, not fire-and-forget — a serverless function can be frozen
        // or torn down the instant the response is sent, so an un-awaited
        // send might never actually go out.
        if (customerEmail) {
          try {
            const { text, html } = customerWelcomeEmail(licenseKey, appUrl, activateUrl);
            await setup.transporter.sendMail({
              from: `"${SITE_NAME}" <${setup.gmailUser}>`,
              to: customerEmail,
              replyTo: ownerEmail,
              subject: `[${SITE_NAME}] Your license key — setup is done`,
              text,
              html,
            });
          } catch (err) {
            console.error("checkout-verify: customer welcome email failed.", err);
          }
        }
        if (ownerEmail) {
          try {
            await sendOwnerOrderEmail(setup.transporter, setup.gmailUser, ownerEmail, {
              paymentId: payment.payment_id,
              licenseKey,
              customerEmail: customerEmail ?? "(none)",
              customerName: customerName ?? "(none)",
              status,
              totalAmount: payment.total_amount ?? "(unknown)",
              currency: payment.currency ?? "(unknown)",
            });
          } catch (err) {
            console.error("checkout-verify: owner order email failed.", err);
          }
        }
      }
    }

    sendJson(res, 200, { ok: true, paymentId: payment.payment_id, licenseKey, sessionId: sessionId ?? null });
  } catch (err) {
    console.error("checkout-verify: Dodo lookup failed.", err);
    sendJson(res, 502, { ok: false, error: "Couldn't verify payment. Please try again." });
  }
}
