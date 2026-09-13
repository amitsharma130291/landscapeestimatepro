import { useEffect, useState, type ReactNode } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card } from "../ui/primitives";
import LicenseActivationSection from "../LicenseActivationSection";
import { consumeLicenseFromUrl, getStoredLicense, redeemLicenseKey } from "../../lib/license";

/**
 * Gates the entire Pro app behind a valid license. Checked once per page
 * load, not on every render/action: a stored license is trusted from
 * localStorage from then on (matching this app's own local-first,
 * no-account architecture — the alternative, re-asking Dodo's API before
 * every page load, would make the whole app depend on a live network call
 * and Dodo's uptime just to open a saved workspace). The real server-side
 * check happens once, at the moment a license is activated (redeemed) —
 * see src/lib/license.ts.
 *
 * Two ways in:
 * 1. A stored license already exists (localStorage) — render the app.
 * 2. The URL carries `?license=...` (a fresh purchase redirect, or a
 *    clicked recovery-email link) — validate and store it, then render
 *    the app. This is what makes "the user should be redirected to the
 *    paid tool app" after a successful checkout actually unlock it, not
 *    just land on a still-gated page.
 * Otherwise, shows the same activation UI as the pricing page.
 */
export default function LicenseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "unlocked" | "locked">("checking");

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const fromUrl = consumeLicenseFromUrl();
      if (fromUrl) {
        try {
          await redeemLicenseKey(fromUrl);
          if (!cancelled) setStatus("unlocked");
          return;
        } catch {
          // Fall through to the stored-license / gate check below — an
          // invalid/expired link shouldn't crash the app, just fail to
          // auto-unlock it.
        }
      }
      if (getStoredLicense()) {
        if (!cancelled) setStatus("unlocked");
        return;
      }
      if (!cancelled) setStatus("locked");
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted" aria-hidden="true" />
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <Card>
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} className="text-forest" aria-hidden="true" />
            <h1 className="text-lg font-bold text-ink">Activate Landscape Estimate Pro</h1>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            You'll need a license key to use the app. Already bought Pro?{" "}
            <a href="/pricing/#activate-license" className="font-semibold text-forest underline">
              Enter your key below
            </a>
            . Haven't purchased yet?{" "}
            <a href="/pricing/" className="font-semibold text-forest underline">
              See pricing
            </a>
            .
          </p>
        </Card>
        <div className="mt-6">
          <LicenseActivationSection onActivated={() => setStatus("unlocked")} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
