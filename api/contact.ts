import type { IncomingMessage, ServerResponse } from "node:http";
import nodemailer from "nodemailer";

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
 * Deliberately fully self-contained — no imports from ../src. This project
 * is ESM ("type": "module" in package.json), and Vercel's Node.js builder
 * does not bundle a TypeScript function's local relative imports the way
 * ncc/esbuild normally would for it; it transpiles this file alone and
 * leaves cross-directory imports to Node's own ESM resolver at runtime,
 * which then fails outright (`ERR_MODULE_NOT_FOUND`) reaching anything
 * under /src, since only /api is known to be part of the function's
 * deployment. The validation rules below are intentionally a duplicate of
 * `src/lib/contactValidation.ts` (which the client-side form still imports
 * normally through Vite) — small and stable enough that keeping this
 * function deployable outweighs sharing the one file across that boundary.
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

const SITE_NAME = "Landscape Estimate Pro";
const CONTACT_DOMAIN = "landscapeestimatepro.com";
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;

interface ContactSubmission {
  subject: string;
  email: string;
  message: string;
}

type ContactValidationResult = { valid: true; data: ContactSubmission } | { valid: false; error: string };

function validateEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateContactSubmission(payload: unknown): ContactValidationResult {
  if (typeof payload !== "object" || payload === null) {
    return { valid: false, error: "Invalid request." };
  }
  const { subject, email, message } = payload as Record<string, unknown>;

  if (typeof subject !== "string" || subject.trim() === "") {
    return { valid: false, error: "Please enter a subject." };
  }
  if (typeof email !== "string" || email.trim() === "") {
    return { valid: false, error: "Please enter your email address." };
  }
  if (typeof message !== "string" || message.trim() === "") {
    return { valid: false, error: "Please enter a message." };
  }
  if (!validateEmailFormat(email)) {
    return { valid: false, error: "Doesn't look like a valid email address." };
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return { valid: false, error: `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.` };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  }

  return { valid: true, data: { subject: subject.trim(), email: email.trim(), message: message.trim() } };
}

/** A real visitor never sees or fills the honeypot field (positioned
 * off-screen, not tab-reachable) — a bot filling every field fills this
 * too. Checked separately so a filled honeypot can return a plain success
 * without ever sending mail, giving a bot no signal to adapt against. */
function isHoneypotFilled(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const { company } = payload as Record<string, unknown>;
  return typeof company === "string" && company.trim() !== "";
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
