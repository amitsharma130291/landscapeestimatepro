import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredLicense,
  consumeLicenseFromUrl,
  getStoredLicense,
  redeemLicenseKey,
  requestLicenseRecovery,
  resolvePendingCheckout,
  startCheckout,
  storeLicense,
} from "./license";

const LICENSE_KEY_STORAGE = "landscapeEstimateProLicense";
const PENDING_CHECKOUT_KEY = "landscapeEstimateProPendingCheckout";

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getStoredLicense / storeLicense / clearStoredLicense", () => {
  it("returns null when nothing is stored", () => {
    expect(getStoredLicense()).toBeNull();
  });

  it("round-trips a license key through localStorage", () => {
    storeLicense("LEP-PRO-abc123");
    expect(getStoredLicense()).toBe("LEP-PRO-abc123");
    expect(window.localStorage.getItem(LICENSE_KEY_STORAGE)).toBe("LEP-PRO-abc123");
  });

  it("clears the stored license", () => {
    storeLicense("LEP-PRO-abc123");
    clearStoredLicense();
    expect(getStoredLicense()).toBeNull();
  });
});

describe("consumeLicenseFromUrl", () => {
  it("returns null and leaves the URL untouched when there is no ?license= param", () => {
    window.history.replaceState({}, "", "/app/");
    expect(consumeLicenseFromUrl()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("returns the key and strips it from the URL when present", () => {
    window.history.replaceState({}, "", "/app/?license=LEP-PRO-xyz&foo=bar");
    expect(consumeLicenseFromUrl()).toBe("LEP-PRO-xyz");
    expect(window.location.search).not.toContain("license");
    // Unrelated params survive the strip.
    expect(window.location.search).toContain("foo=bar");
  });
});

describe("startCheckout", () => {
  it("stores the pending sessionId and redirects to the returned checkout URL", async () => {
    mockFetchOnce(200, { ok: true, checkoutUrl: "https://checkout.dodopayments.com/session/cs_1", sessionId: "cs_1" });
    const locationStub = { href: "" };
    vi.stubGlobal("location", locationStub as unknown as Location);

    await startCheckout();

    expect(fetch).toHaveBeenCalledWith(
      "/api/checkout-create",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(window.sessionStorage.getItem(PENDING_CHECKOUT_KEY)!)).toEqual({ sessionId: "cs_1" });
    expect(locationStub.href).toBe("https://checkout.dodopayments.com/session/cs_1");
  });

  it("throws without redirecting when the server can't start a checkout session", async () => {
    mockFetchOnce(500, { ok: false, error: "Dodo is unreachable." });
    await expect(startCheckout()).rejects.toThrow("Dodo is unreachable.");
    expect(window.sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
  });
});

describe("resolvePendingCheckout", () => {
  it("returns null when there's no pending checkout to resolve (an ordinary page visit)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await resolvePendingCheckout();
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("verifies the pending session, stores the license, and consumes the pending flag on success", async () => {
    window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ sessionId: "cs_1" }));
    mockFetchOnce(200, { ok: true, paymentId: "pay_1", licenseKey: "LEP-PRO-pay_1" });

    const result = await resolvePendingCheckout();

    expect(result).toEqual({ ok: true, paymentId: "pay_1", licenseKey: "LEP-PRO-pay_1" });
    expect(getStoredLicense()).toBe("LEP-PRO-pay_1");
    expect(window.sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("sessionId=cs_1"));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("sendEmail=1"));
  });

  it("does not store a license when the payment failed", async () => {
    window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ sessionId: "cs_2" }));
    mockFetchOnce(200, { ok: false, status: "failed" });

    const result = await resolvePendingCheckout();

    expect(result).toEqual({ ok: false, status: "failed" });
    expect(getStoredLicense()).toBeNull();
  });
});

describe("redeemLicenseKey", () => {
  it("stores and returns the license key on a valid, succeeded payment", async () => {
    mockFetchOnce(200, { ok: true, paymentId: "pay_1", licenseKey: "LEP-PRO-pay_1" });
    const result = await redeemLicenseKey("lep-pro-pay_1");
    expect(result).toBe("LEP-PRO-pay_1");
    expect(getStoredLicense()).toBe("LEP-PRO-pay_1");
  });

  it("throws a clear message for an unknown key without storing anything", async () => {
    mockFetchOnce(200, { ok: false, status: "unknown" });
    await expect(redeemLicenseKey("LEP-PRO-not-a-real-payment")).rejects.toThrow(/isn't valid/i);
    expect(getStoredLicense()).toBeNull();
  });

  it("throws a status-aware message for a key tied to a non-succeeded payment", async () => {
    mockFetchOnce(200, { ok: false, status: "processing" });
    await expect(redeemLicenseKey("LEP-PRO-pay_2")).rejects.toThrow(/processing/);
  });

  it("throws the server's error message on a non-2xx response", async () => {
    mockFetchOnce(500, { error: "Dodo lookup failed." });
    await expect(redeemLicenseKey("LEP-PRO-pay_3")).rejects.toThrow("Dodo lookup failed.");
  });
});

describe("requestLicenseRecovery", () => {
  it("returns the server's generic confirmation message", async () => {
    mockFetchOnce(200, { ok: true, message: "If that email has a completed purchase, we've sent the license key to it." });
    const message = await requestLicenseRecovery("contractor@example.com");
    expect(message).toMatch(/completed purchase/);
  });

  it("throws on a non-2xx response", async () => {
    mockFetchOnce(500, { error: "Couldn't process that request." });
    await expect(requestLicenseRecovery("contractor@example.com")).rejects.toThrow("Couldn't process that request.");
  });
});
