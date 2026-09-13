import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { Button, Card, Field, TextInput } from "./ui/primitives";
import { redeemLicenseKey, requestLicenseRecovery } from "../lib/license";

/**
 * "Have a license key? Enter it to activate" + "Forgot your license key?"
 * — the manual-unlock and recovery paths for a purchase made on another
 * device, or after clearing this browser's data. Fully self-verifying
 * against Dodo (see src/lib/license.ts) — no account, no password, just
 * the key from the purchase email.
 *
 * Reused in two places: standalone on the pricing page (id="activate-license",
 * which the purchase/recovery emails link straight to), and inside
 * LicenseGate.tsx as the actual gate a contractor without a valid stored
 * license sees before the Pro app.
 */
export default function LicenseActivationSection({ onActivated }: { onActivated?: (licenseKey: string) => void }) {
  const [licenseKey, setLicenseKey] = useState("");
  const [activateStatus, setActivateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activateError, setActivateError] = useState<string | null>(null);

  const [showRecovery, setShowRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  async function handleActivate(e: FormEvent) {
    e.preventDefault();
    if (!licenseKey.trim() || activateStatus === "loading") return;
    setActivateStatus("loading");
    setActivateError(null);
    try {
      const confirmedKey = await redeemLicenseKey(licenseKey.trim());
      setActivateStatus("idle");
      onActivated?.(confirmedKey);
    } catch (err) {
      setActivateStatus("error");
      setActivateError(err instanceof Error ? err.message : "Couldn't verify that license key.");
    }
  }

  async function handleRecover(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || recoveryStatus === "loading") return;
    setRecoveryStatus("loading");
    setRecoveryError(null);
    try {
      await requestLicenseRecovery(email.trim());
      setRecoveryStatus("sent");
    } catch (err) {
      setRecoveryStatus("error");
      setRecoveryError(err instanceof Error ? err.message : "Couldn't process that request.");
    }
  }

  return (
    <Card id="activate-license" className="scroll-mt-24">
      <div className="flex items-center gap-2">
        <KeyRound size={20} className="text-forest" aria-hidden="true" />
        <h2 className="text-lg font-bold text-ink">Already purchased? Activate your license</h2>
      </div>
      <p className="mt-1.5 text-sm text-muted">Paste the license key from your purchase email to unlock Pro in this browser.</p>

      <form onSubmit={handleActivate} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="License key" htmlFor="license-key-input">
            <TextInput
              id="license-key-input"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="LEP-PRO-..."
              invalid={activateStatus === "error"}
              autoComplete="off"
            />
          </Field>
        </div>
        <Button type="submit" disabled={activateStatus === "loading" || !licenseKey.trim()} className="sm:mb-0">
          {activateStatus === "loading" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          Activate
        </Button>
      </form>
      {activateError && (
        <p role="alert" className="mt-2 text-sm font-medium text-red">
          {activateError}
        </p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        {!showRecovery ? (
          <button type="button" onClick={() => setShowRecovery(true)} className="text-sm font-semibold text-forest hover:underline">
            Forgot your license key?
          </button>
        ) : recoveryStatus === "sent" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-mint-ink">
            <CheckCircle2 size={16} aria-hidden="true" />
            If that email has a completed purchase, we've sent the license key to it.
          </p>
        ) : (
          <form onSubmit={handleRecover}>
            <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Mail size={16} aria-hidden="true" /> Get your license key by email
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="Email you paid with" htmlFor="license-recovery-email">
                  <TextInput
                    id="license-recovery-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    invalid={recoveryStatus === "error"}
                  />
                </Field>
              </div>
              <Button type="submit" variant="ghost" disabled={recoveryStatus === "loading" || !email.trim()}>
                {recoveryStatus === "loading" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                Send license key
              </Button>
            </div>
            {recoveryError && (
              <p role="alert" className="mt-2 text-sm font-medium text-red">
                {recoveryError}
              </p>
            )}
          </form>
        )}
      </div>
    </Card>
  );
}
