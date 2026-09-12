import type { IncomingMessage, ServerResponse } from "node:http";
import nodemailer from "nodemailer";
import { isHoneypotFilled, validateContactSubmission } from "../src/lib/contactValidation";
import { SITE_NAME, SITE_URL } from "../src/data/site";

/**
 * A plain Vercel Node.js serverless function — deliberately NOT an Astro API
 * route (see astro.config.mjs for why: an Astro server adapter would switch
 * the whole site's build to Vercel's Build Output API and break `astro
 * preview`, which every Playwright spec's webServer depends on). Vercel
 * auto-deploys any file under /api as a function regardless of the static
 * build sitting next to it, so this is the only backend endpoint in an
 * otherwise fully static, local-first app — it never touches the Pro
 * workspace's data model, it only relays a public visitor's message.
 *
 * Vercel's Node runtime auto-parses a JSON request body into `req.body` and
 * layers `.status()`/`.json()` helpers onto the response — but those are
 * runtime conveniences its own `@vercel/node` TYPES package describes, and
 * pulling that package in just for types drags in a heavy, currently
 * vulnerable dependency tree for something dev-only. Using the response's
 * plain Node.js methods instead (`res.statusCode` / `res.end()`) needs no
 * extra package at all and works identically at runtime.
 */
interface VercelStyleRequest extends IncomingMessage {
  body?: unknown;
}

const CONTACT_DOMAIN = new URL(SITE_URL).hostname;

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

  const payload = req.body;

  if (isHoneypotFilled(payload)) {
    sendJson(res, 200, { ok: true });
    return;
  }

  const result = validateContactSubmission(payload);
  if (!result.valid) {
    sendJson(res, 400, { ok: false, error: result.error });
    return;
  }
  const { subject, email, message } = result.data;

  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const contactToEmail = process.env.CONTACT_TO_EMAIL;
  if (!gmailUser || !gmailAppPassword || !contactToEmail) {
    console.error("Contact form: missing GMAIL_USER, GMAIL_APP_PASSWORD, or CONTACT_TO_EMAIL env var.");
    sendJson(res, 500, { ok: false, error: "The contact form isn't configured yet. Please try again later." });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });
    await transporter.sendMail({
      from: `"${SITE_NAME} Contact Form" <${gmailUser}>`,
      to: contactToEmail,
      replyTo: email,
      subject: `[${CONTACT_DOMAIN}] ${subject}`,
      text: `From: ${email}\n\n${message}`,
    });
  } catch (err) {
    console.error("Contact form: failed to send email.", err);
    sendJson(res, 502, { ok: false, error: "Couldn't send your message right now. Please try again shortly." });
    return;
  }

  sendJson(res, 200, { ok: true });
}
