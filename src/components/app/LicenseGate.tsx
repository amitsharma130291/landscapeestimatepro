import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
 * Otherwise, /app/ is not the right place for this visitor at all — redirect
 * to the real sales pitch (/landscaping-estimating-software/) rather than
 * showing a bare "enter your license key" wall with no context. A returning
 * customer who's lost their key on this browser/device can still recover or
 * re-activate it from /pricing/, which that sales page links to.
 */
export default function LicenseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "unlocked">("checking");

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
          // Fall through — an invalid/expired link shouldn't crash the
          // app, just fail to auto-unlock it, and redirect like any other
          // unlicensed visit below.
        }
      }
      if (getStoredLicense()) {
        if (!cancelled) setStatus("unlocked");
        return;
      }
      if (!cancelled) window.location.replace("/landscaping-estimating-software/");
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "unlocked") return <>{children}</>;

  // "checking" covers both the brief moment while resolve() runs and the
  // instant right before the redirect above actually navigates away.
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 size={24} className="animate-spin text-muted" aria-hidden="true" />
    </div>
  );
}
