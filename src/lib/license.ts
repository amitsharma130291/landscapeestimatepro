/**
 * Client-side half of the license system — talks to the self-contained
 * Vercel functions under /api (checkout-create, checkout-verify,
 * license-redeem, license-recover; see each file's own comment for the
 * server-side design). No database anywhere: a license is just
 * `LEP-PRO-<dodo payment id>`, re-verifiable against Dodo's API forever,
 * so the only thing ever stored locally is that one string.
 */
const LICENSE_KEY_STORAGE = "landscapeEstimateProLicense";
const PENDING_CHECKOUT_KEY = "landscapeEstimateProPendingCheckout";

export function getStoredLicense(): string | null {
  try {
    return window.localStorage.getItem(LICENSE_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function storeLicense(licenseKey: string): void {
  try {
    window.localStorage.setItem(LICENSE_KEY_STORAGE, licenseKey);
  } catch {
    // Non-critical to persist perfectly — worst case the user re-activates.
  }
}

export function clearStoredLicense(): void {
  try {
    window.localStorage.removeItem(LICENSE_KEY_STORAGE);
  } catch {
    // Non-critical.
  }
}

export interface CheckoutFailure {
  ok: false;
  status?: string;
  error?: string;
}

export interface CheckoutSuccess {
  ok: true;
  paymentId: string;
  licenseKey: string;
}

/** Starts a Dodo Payments checkout for Landscape Estimate Pro and redirects
 * the browser to Dodo's hosted checkout page. `returnTo` is where Dodo
 * sends the browser back to after payment — defaults to the estimating-
 * software page, which handles both the success redirect (on to /app/)
 * and the failure banner. */
export async function startCheckout(returnTo?: string): Promise<void> {
  const res = await fetch("/api/checkout-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnTo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.checkoutUrl) {
    throw new Error(data.error || "Couldn't start checkout. Please try again.");
  }
  // Survives the round trip to Dodo's hosted checkout and back, since
  // sessionStorage is same-origin and untouched by the third-party
  // redirect — this is how resolvePendingCheckout() recognizes "we just
  // came back from paying" without Dodo needing to echo anything back
  // through the return_url itself.
  try {
    window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ sessionId: data.sessionId }));
  } catch {
    // Non-critical — verify() below can still work via URL params if Dodo
    // ever starts echoing them, this just loses the "sendEmail" signal.
  }
  window.location.href = data.checkoutUrl;
}

function consumePendingCheckout(): { sessionId: string } | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function verify(params: { sessionId?: string; paymentId?: string; sendEmail: boolean }): Promise<CheckoutSuccess | CheckoutFailure> {
  const search = new URLSearchParams();
  if (params.sessionId) search.set("sessionId", params.sessionId);
  if (params.paymentId) search.set("paymentId", params.paymentId);
  if (params.sendEmail) search.set("sendEmail", "1");
  const res = await fetch(`/api/checkout-verify?${search.toString()}`);
  const data = await res.json().catch(() => ({ ok: false }));
  if (!res.ok) return { ok: false, error: data.error };
  return data;
}

/**
 * Call once on page load (the estimating-software page, where Dodo's
 * return_url points). Resolves a just-completed checkout redirect via the
 * sessionStorage flag set by startCheckout(), confirms the payment
 * against Dodo's API, and stores the license on success. Returns null if
 * there's no pending checkout to resolve at all (a normal page visit).
 */
export async function resolvePendingCheckout(): Promise<CheckoutSuccess | CheckoutFailure | null> {
  const pending = consumePendingCheckout();
  if (!pending) return null;
  const result = await verify({ sessionId: pending.sessionId, sendEmail: true });
  if (result.ok) storeLicense(result.licenseKey);
  return result;
}

/** Manual unlock: paste in a license key from the purchase/recovery email.
 * Works on any device, since the key is fully self-verifying against Dodo
 * — no dependency on this browser's own history. */
export async function redeemLicenseKey(licenseKey: string): Promise<string> {
  const res = await fetch("/api/license-redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (!res.ok) throw new Error(data.error || "Couldn't verify that license key.");
  if (!data.ok) {
    throw new Error(data.status === "unknown" || !data.status ? "That license key isn't valid." : `That license key isn't active yet (status: ${data.status}).`);
  }
  storeLicense(data.licenseKey);
  return data.licenseKey;
}

/** "Forgot your key" — always resolves to a generic message, whether or
 * not anything was actually found for that email (avoids confirming or
 * denying a purchase happened for a given address). */
export async function requestLicenseRecovery(email: string): Promise<string> {
  const res = await fetch("/api/license-recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (!res.ok) throw new Error(data.error || "Couldn't process that request.");
  return data.message ?? "If that email has a completed purchase, we've sent the license key to it.";
}

/** Reads a `?license=` query param (the link a fresh purchase or a
 * recovery email points at) and strips it from the URL, so a page reload
 * doesn't keep re-processing it. Returns null when absent. */
export function consumeLicenseFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const licenseKey = params.get("license");
  if (!licenseKey) return null;
  const url = new URL(window.location.href);
  url.searchParams.delete("license");
  window.history.replaceState({}, "", url);
  return licenseKey;
}
