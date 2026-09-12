/**
 * Exercises the actual deployed handler (not a copy) with mock req/res
 * objects and a mocked nodemailer — this is the one place that would catch
 * the two validation copies (this file's and src/lib/contactValidation.ts's)
 * drifting apart, and it's what would have caught the ERR_MODULE_NOT_FOUND
 * production failure if it had covered "does this file import anything
 * outside /api" — it doesn't check that directly, but re-run this any time
 * the imports at the top of contact.ts change.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

const sendMail = vi.fn().mockResolvedValue({});
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const { default: handler } = await import("./contact");

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(chunk: string) {
      this.body = chunk;
    },
  };
  return res as unknown as ServerResponse & { statusCode: number; body: string; headers: Record<string, string> };
}

function mockReq(body: unknown, method = "POST") {
  return { method, body } as unknown as IncomingMessage & { body?: unknown };
}

beforeEach(() => {
  sendMail.mockClear();
  process.env.GMAIL_USER = "sender@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  process.env.CONTACT_TO_EMAIL = "owner@example.com";
});

describe("api/contact handler", () => {
  it("rejects a non-POST method", async () => {
    const res = mockRes();
    await handler(mockReq({}, "GET"), res);
    expect(res.statusCode).toBe(405);
  });

  it("silently succeeds without sending mail when the honeypot is filled", async () => {
    const res = mockRes();
    await handler(mockReq({ subject: "Hi", email: "a@b.com", message: "hello", company: "I am a bot" }), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a missing subject/email/message without sending mail", async () => {
    const res = mockRes();
    await handler(mockReq({ subject: "", email: "a@b.com", message: "hello" }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/subject/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a malformed email without sending mail", async () => {
    const res = mockRes();
    await handler(mockReq({ subject: "Hi", email: "not-an-email", message: "hello" }), res);
    expect(res.statusCode).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns 500 and never calls nodemailer when env vars are missing", async () => {
    delete process.env.GMAIL_USER;
    const res = mockRes();
    await handler(mockReq({ subject: "Hi", email: "a@b.com", message: "hello" }), res);
    expect(res.statusCode).toBe(500);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends mail with the domain prefixed on the subject and the visitor's email as replyTo, on a valid submission", async () => {
    const res = mockRes();
    await handler(mockReq({ subject: "A question", email: "visitor@example.com", message: "Hello there" }), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const sentMail = sendMail.mock.calls[0][0];
    expect(sentMail.subject).toBe("[landscapeestimatepro.com] A question");
    expect(sentMail.replyTo).toBe("visitor@example.com");
    expect(sentMail.to).toBe("owner@example.com");
    expect(sentMail.text).toContain("Hello there");
  });

  it("returns 502 without crashing when nodemailer itself fails", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP down"));
    const res = mockRes();
    await handler(mockReq({ subject: "Hi", email: "a@b.com", message: "hello" }), res);
    expect(res.statusCode).toBe(502);
  });
});
