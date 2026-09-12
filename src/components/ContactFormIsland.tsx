import { useState, type SyntheticEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button, Field, TextArea, TextInput } from "./ui/primitives";
import { validateEmailFormat } from "../lib/validation";
import { CONTACT_MAX_MESSAGE_LENGTH, CONTACT_MAX_SUBJECT_LENGTH, validateContactSubmission } from "../lib/contactValidation";

type Status = "idle" | "submitting" | "success" | "error";

export default function ContactFormIsland() {
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot — real visitors never see or fill this
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Which field(s) to visually mark invalid (red border) once a submit
  // attempt fails — the message itself lives in ONE place (the banner
  // below), not duplicated per-field, so this is only ever a boolean cue.
  const [invalidFields, setInvalidFields] = useState<{ subject?: boolean; email?: boolean; message?: boolean }>({});

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;

    const check = validateContactSubmission({ subject, email, message });
    if (!check.valid) {
      setError(check.error);
      setInvalidFields({
        subject: subject.trim() === "",
        email: email.trim() === "" || Boolean(validateEmailFormat(email)),
        message: message.trim() === "",
      });
      return;
    }

    setStatus("submitting");
    setError(null);
    setInvalidFields({});
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, email, message, company }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Something went wrong." }));
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus("success");
      setSubject("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-8 text-center">
        <CheckCircle2 size={40} className="text-mint-ink" aria-hidden="true" />
        <h2 className="text-lg font-bold text-ink">Message sent</h2>
        <p className="max-w-sm text-sm text-muted">
          Thanks for reaching out — we'll get back to you at the email address you provided.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStatus("idle")}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-white p-6 sm:p-8" noValidate>
      {/* Honeypot: positioned off-screen (not display:none/visibility:hidden,
          which some bots specifically check for and skip to evade exactly
          this kind of detection) and never tab-reachable — a real person
          can't see or fill it, so a filled value is a reliable bot signal
          without a CAPTCHA. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-0">
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <Field label="Subject" htmlFor="contact-subject" required>
        <TextInput
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's this about?"
          maxLength={CONTACT_MAX_SUBJECT_LENGTH}
          invalid={invalidFields.subject}
          required
        />
      </Field>

      <Field label="Your email" htmlFor="contact-email" required>
        <TextInput
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          invalid={invalidFields.email}
          required
        />
      </Field>

      <Field label="Message" htmlFor="contact-message" required>
        <TextArea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          maxLength={CONTACT_MAX_MESSAGE_LENGTH}
          invalid={invalidFields.message}
          required
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm font-medium text-red">
          {error}
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"} className="w-full sm:w-auto">
        {status === "submitting" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {status === "submitting" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
