import { describe, expect, it } from "vitest";
import { CONTACT_MAX_MESSAGE_LENGTH, CONTACT_MAX_SUBJECT_LENGTH, isHoneypotFilled, validateContactSubmission } from "./contactValidation";

const VALID = { subject: "A question about pricing", email: "visitor@example.com", message: "How does the free trial work?" };

describe("validateContactSubmission", () => {
  it("accepts a fully valid submission and trims each field", () => {
    const result = validateContactSubmission({ ...VALID, subject: "  A question  ", email: " visitor@example.com ", message: " Hi there " });
    expect(result).toEqual({ valid: true, data: { subject: "A question", email: "visitor@example.com", message: "Hi there" } });
  });

  it("rejects a non-object payload", () => {
    expect(validateContactSubmission(null)).toEqual({ valid: false, error: "Invalid request." });
    expect(validateContactSubmission("a string")).toEqual({ valid: false, error: "Invalid request." });
    expect(validateContactSubmission(undefined)).toEqual({ valid: false, error: "Invalid request." });
  });

  it("rejects a missing or blank subject", () => {
    expect(validateContactSubmission({ ...VALID, subject: "" }).valid).toBe(false);
    expect(validateContactSubmission({ ...VALID, subject: "   " }).valid).toBe(false);
    expect(validateContactSubmission({ ...VALID, subject: undefined }).valid).toBe(false);
  });

  it("rejects a missing or blank email", () => {
    expect(validateContactSubmission({ ...VALID, email: "" }).valid).toBe(false);
    expect(validateContactSubmission({ ...VALID, email: undefined }).valid).toBe(false);
  });

  it("rejects a missing or blank message", () => {
    expect(validateContactSubmission({ ...VALID, message: "" }).valid).toBe(false);
    expect(validateContactSubmission({ ...VALID, message: undefined }).valid).toBe(false);
  });

  it("rejects a malformed email address", () => {
    const result = validateContactSubmission({ ...VALID, email: "not-an-email" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/valid email/i);
  });

  it("rejects a subject over the max length", () => {
    const result = validateContactSubmission({ ...VALID, subject: "x".repeat(CONTACT_MAX_SUBJECT_LENGTH + 1) });
    expect(result.valid).toBe(false);
  });

  it("accepts a subject at exactly the max length", () => {
    const result = validateContactSubmission({ ...VALID, subject: "x".repeat(CONTACT_MAX_SUBJECT_LENGTH) });
    expect(result.valid).toBe(true);
  });

  it("rejects a message over the max length", () => {
    const result = validateContactSubmission({ ...VALID, message: "x".repeat(CONTACT_MAX_MESSAGE_LENGTH + 1) });
    expect(result.valid).toBe(false);
  });

  it("accepts a message at exactly the max length", () => {
    const result = validateContactSubmission({ ...VALID, message: "x".repeat(CONTACT_MAX_MESSAGE_LENGTH) });
    expect(result.valid).toBe(true);
  });
});

describe("isHoneypotFilled", () => {
  it("is false when the honeypot field is absent or blank", () => {
    expect(isHoneypotFilled(VALID)).toBe(false);
    expect(isHoneypotFilled({ ...VALID, company: "" })).toBe(false);
    expect(isHoneypotFilled({ ...VALID, company: "   " })).toBe(false);
  });

  it("is true when the honeypot field has any real content", () => {
    expect(isHoneypotFilled({ ...VALID, company: "Acme Bots Inc." })).toBe(true);
  });

  it("is false for a non-object payload", () => {
    expect(isHoneypotFilled(null)).toBe(false);
    expect(isHoneypotFilled("a string")).toBe(false);
  });
});
