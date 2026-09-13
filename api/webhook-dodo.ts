import type { IncomingMessage, ServerResponse } from "node:http";
import { Webhook } from "standardwebhooks";
import nodemailer from "nodemailer";

/**
 * Reliability backstop, per Dodo's own guidance: on `payment.succeeded`,
 * sends the exact same license emails api/checkout-verify.ts sends right
 * after the browser redirect — this route exists purely for a customer
 * who closes the tab before that redirect fires (Dodo retries webhooks
 * until acknowledged, so it's the net for that one edge case, not the
 * primary path). On `payment.failed`, notifies the site owner — the
 * browser-redirect path may never fire at all for a failed payment (the
 * customer might not return to the site), so the webhook is the reliable
 * way to hear about it.
 *
 * Self-contained on purpose (no imports from ../src or sibling /api
 * files, including the email templates in checkout-verify.ts, which are
 * intentionally duplicated here) — see api/contact.ts's comment for why.
 *
 * Vercel needs the RAW request body to verify the signature (must read as
 * text before any JSON parsing, never re-serialize after the fact) — this
 * project has no bodyParser config to disable since these are plain
 * Node.js functions (req is a raw IncomingMessage), not Express/Astro
 * handlers that pre-parse JSON for you.
 */
interface VercelStyleRequest extends IncomingMessage {
  body?: unknown;
}

const SITE_NAME = "Landscape Estimate Pro";
const SITE_URL = "https://landscapeestimatepro.com";

interface DodoPaymentLike {
  payment_id?: string;
  status?: string;
  total_amount?: number;
  currency?: string;
  customer?: { email?: string; name?: string };
}

interface DodoWebhookEvent {
  type: string;
  data?: DodoPaymentLike;
}

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
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

export default async function handler(req: VercelStyleRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!secret) {
    console.error("webhook-dodo: DODO_PAYMENTS_WEBHOOK_KEY not configured.");
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Webhook not configured." }));
    return;
  }

  // Signature verification needs the exact raw bytes Dodo signed — read as
  // text before any JSON parsing, never re-serialize after the fact.
  const rawBody = await readRawBody(req);
  const headers = {
    "webhook-id": req.headers["webhook-id"] as string | undefined,
    "webhook-signature": req.headers["webhook-signature"] as string | undefined,
    "webhook-timestamp": req.headers["webhook-timestamp"] as string | undefined,
  };

  let event: DodoWebhookEvent;
  try {
    const webhook = new Webhook(secret);
    await webhook.verify(rawBody, {
      "webhook-id": headers["webhook-id"] ?? "",
      "webhook-signature": headers["webhook-signature"] ?? "",
      "webhook-timestamp": headers["webhook-timestamp"] ?? "",
    });
    event = JSON.parse(rawBody) as DodoWebhookEvent;
  } catch (err) {
    console.error("webhook-dodo: signature verification failed.", err);
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Invalid signature." }));
    return;
  }

  console.log("webhook-dodo: received event", event.type);
  const ownerEmail = process.env.CONTACT_TO_EMAIL;

  if (event.type === "payment.succeeded") {
    try {
      const data = event.data ?? {};
      const paymentId = data.payment_id;
      const customerEmail = data.customer?.email ?? null;

      if (!paymentId) {
        console.error("webhook-dodo: payment.succeeded with no payment_id — can't build a license key.", data);
      } else if (!customerEmail) {
        console.error("webhook-dodo: payment.succeeded with no customer email — can't send it.", data);
      } else {
        const licenseKey = `LEP-PRO-${paymentId}`;
        const appUrl = `${SITE_URL}/app/?license=${encodeURIComponent(licenseKey)}`;
        const activateUrl = `${SITE_URL}/pricing/#activate-license`;
        const setup = getTransporter();
        if (setup) {
          const { text, html } = customerWelcomeEmail(licenseKey, appUrl, activateUrl);
          await setup.transporter.sendMail({
            from: `"${SITE_NAME}" <${setup.gmailUser}>`,
            to: customerEmail,
            replyTo: ownerEmail,
            subject: `[${SITE_NAME}] Your license key — setup is done`,
            text,
            html,
          });
          if (ownerEmail) {
            await setup.transporter.sendMail({
              from: `"${SITE_NAME}" <${setup.gmailUser}>`,
              to: ownerEmail,
              subject: `[${SITE_NAME}] New order (webhook) — ${licenseKey}`,
              text: `New order on ${SITE_NAME} (webhook backstop).\n\npaymentId: ${paymentId}\nlicenseKey: ${licenseKey}\ncustomerEmail: ${customerEmail}\ncustomerName: ${data.customer?.name ?? "(none)"}\ntotalAmount: ${data.total_amount ?? "(unknown)"}\ncurrency: ${data.currency ?? "(unknown)"}`,
              html: `<p>New order on <strong>${escapeHtml(SITE_NAME)}</strong> (webhook backstop).</p><ul><li>paymentId: ${escapeHtml(paymentId)}</li><li>licenseKey: ${escapeHtml(licenseKey)}</li><li>customerEmail: ${escapeHtml(customerEmail)}</li><li>customerName: ${escapeHtml(data.customer?.name ?? "(none)")}</li></ul>`,
            });
          }
        }
      }
    } catch (err) {
      // Don't fail the webhook over a best-effort email — Dodo would just
      // retry it, and the browser-redirect path may have already unlocked
      // this purchase for the customer regardless.
      console.error("webhook-dodo: payment.succeeded email failed.", err);
    }
  } else if (event.type === "payment.failed") {
    try {
      const data = event.data ?? {};
      const setup = getTransporter();
      if (setup && ownerEmail) {
        await setup.transporter.sendMail({
          from: `"${SITE_NAME}" <${setup.gmailUser}>`,
          to: ownerEmail,
          subject: `[${SITE_NAME}] Payment failed`,
          text: `A payment attempt on ${SITE_NAME} (${SITE_URL}) did not succeed.\n\npaymentId: ${data.payment_id ?? "(unknown)"}\nstatus: ${data.status ?? "(unknown)"}\ncustomerEmail: ${data.customer?.email ?? "(none)"}\ncustomerName: ${data.customer?.name ?? "(none)"}`,
          html: `<p>A payment attempt on <strong>${escapeHtml(SITE_NAME)}</strong> (${escapeHtml(SITE_URL)}) did not succeed.</p><ul><li>paymentId: ${escapeHtml(data.payment_id ?? "(unknown)")}</li><li>status: ${escapeHtml(data.status ?? "(unknown)")}</li><li>customerEmail: ${escapeHtml(data.customer?.email ?? "(none)")}</li><li>customerName: ${escapeHtml(data.customer?.name ?? "(none)")}</li></ul>`,
        });
      }
    } catch (err) {
      console.error("webhook-dodo: payment.failed owner email failed.", err);
    }
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ received: true }));
}
