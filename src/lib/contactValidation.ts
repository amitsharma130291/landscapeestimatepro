/**
 * The one validation rule set shared by the contact form's client-side
 * pre-check (ContactFormIsland.tsx) and the server-side API route
 * (pages/api/contact.ts) — kept as a pure function, exactly like every
 * other validator in this app, so it's unit-testable without a DOM or a
 * network call, and so client and server can never quietly drift apart on
 * what counts as a valid submission.
 */
import { validateEmailFormat } from "./validation";

export const CONTACT_MAX_SUBJECT_LENGTH = 200;
export const CONTACT_MAX_MESSAGE_LENGTH = 5000;

export interface ContactSubmission {
  subject: string;
  email: string;
  message: string;
}

export type ContactValidationResult = { valid: true; data: ContactSubmission } | { valid: false; error: string };

/**
 * Validates an unknown, untrusted payload (the parsed body of a POST
 * request, or a form's raw field values) into a clean `ContactSubmission`.
 * `company` is the honeypot field — see `isHoneypotFilled` below, checked
 * separately since a filled honeypot is a silent-success case, not a
 * validation error to surface to whoever (or whatever) submitted it.
 */
export function validateContactSubmission(payload: unknown): ContactValidationResult {
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
  const emailError = validateEmailFormat(email);
  if (emailError) {
    return { valid: false, error: emailError };
  }
  if (subject.length > CONTACT_MAX_SUBJECT_LENGTH) {
    return { valid: false, error: `Subject must be ${CONTACT_MAX_SUBJECT_LENGTH} characters or fewer.` };
  }
  if (message.length > CONTACT_MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message must be ${CONTACT_MAX_MESSAGE_LENGTH} characters or fewer.` };
  }

  return { valid: true, data: { subject: subject.trim(), email: email.trim(), message: message.trim() } };
}

/** A real visitor never sees or fills the honeypot field (hidden, not
 * tab-reachable, unlabeled to assistive tech) — a bot filling every field
 * on the form fills this too. Checked separately from validation so a
 * filled honeypot can return a plain success without ever sending mail,
 * giving a bot no signal to adapt against. */
export function isHoneypotFilled(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const { company } = payload as Record<string, unknown>;
  return typeof company === "string" && company.trim() !== "";
}
