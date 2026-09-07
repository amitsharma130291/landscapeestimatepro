/**
 * Minimal GA4 event wrapper. When PUBLIC_GA_MEASUREMENT_ID is unset, gtag is
 * never loaded and every track() call below is a silent no-op — no network
 * requests, no console errors.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

/** Delegated click tracking for any element with data-track="event_name". Call
 * once from a page-level inline script; avoids attaching a listener per button. */
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
