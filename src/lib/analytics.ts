/**
 * Minimal GA4 event wrapper for the PUBLIC marketING pages only. When
 * PUBLIC_GA_MEASUREMENT_ID is unset, gtag is never loaded and every track()
 * call below is a silent no-op — no network request, no console error.
 *
 * This is NEVER wired into the Pro application (`/app/*` uses its own
 * AppPageLayout.astro, which has no analytics script at all — see that
 * file) — the app workspace has no analytics of any kind, so there is
 * nothing here to accidentally leak a customer name, project, or estimate
 * value out of.
 *
 * `ALLOWED_EVENTS` is an enforced allowlist, not just documentation: an
 * event name not listed here is dropped (never reaches gtag), and even a
 * listed event only forwards the specific param keys named for it — any
 * other key on the params object passed to `track()` is silently stripped.
 * This is the actual technical control that keeps a future call site from
 * accidentally widening what analytics sees; every key allowed below must
 * be a fixed UI label or category the developer wrote, never anything a
 * customer typed or any value derived from workspace data.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Every event this app is allowed to send, and the only param keys each
 * one may carry. Add a new event here (with a comment justifying why its
 * params are safe) before calling track() with it anywhere — an unlisted
 * event is silently dropped, not sent with whatever the caller passed. */
export const ALLOWED_EVENTS: Readonly<Record<string, readonly string[]>> = {
  // A fixed UI label (e.g. "header_pricing", "footer_pricing") identifying
  // WHICH marketing CTA was clicked — never user-entered text.
  cta_click: ["cta_label"],
};

export function track(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  const allowedKeys = ALLOWED_EVENTS[eventName];
  if (!allowedKeys) {
    if (import.meta.env.DEV) {
      console.warn(`[analytics] blocked event "${eventName}" — not in ALLOWED_EVENTS. Add it to src/lib/analytics.ts first.`);
    }
    return;
  }
  const safeParams: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (params && Object.prototype.hasOwnProperty.call(params, key)) safeParams[key] = params[key];
  }
  window.gtag("event", eventName, safeParams);
}

/** Delegated click tracking for any element with data-track="event_name" on
 * a PUBLIC marketing page. Call once from a page-level inline script;
 * avoids attaching a listener per button. Every event fired this way still
 * passes through the same ALLOWED_EVENTS gate above. */
export function initAnalyticsDelegation(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-track]");
    if (!target) return;
    const eventName = target.getAttribute("data-track");
    if (!eventName) return;
    track(eventName);
  });
}
