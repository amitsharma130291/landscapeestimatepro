/**
 * The analytics allowlist is a real technical control, not just a comment —
 * these tests prove an unlisted event never reaches gtag at all, and that a
 * listed event only forwards its explicitly-allowed keys, dropping anything
 * else the caller passed (which is exactly how a customer name, project id,
 * or estimate value would try to leak through if a future call site got it
 * wrong).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_EVENTS, track } from "./analytics";

beforeEach(() => {
  window.gtag = vi.fn();
});
afterEach(() => {
  delete (window as { gtag?: unknown }).gtag;
  vi.restoreAllMocks();
});

describe("ALLOWED_EVENTS allowlist", () => {
  it("every currently-allowed event's param keys are plainly non-sensitive names (a human-reviewable contract)", () => {
    const forbiddenKeyPatterns = [/customer/i, /address/i, /project/i, /estimate/i, /quote/i, /price/i, /amount/i, /cost/i, /file.?name/i, /email/i, /name$/i];
    for (const [eventName, keys] of Object.entries(ALLOWED_EVENTS)) {
      for (const key of keys) {
        for (const pattern of forbiddenKeyPatterns) {
          expect(pattern.test(key), `event "${eventName}"'s allowed key "${key}" looks like it could carry sensitive data`).toBe(false);
        }
      }
    }
  });
});

describe("track() enforcement", () => {
  it("an event NOT in the allowlist never reaches gtag at all, regardless of what params are passed", () => {
    track("customer_project_saved", { customerName: "Jane Doe", projectValue: 45000 });
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("a listed event forwards only its allowed keys — any other key on the same params object is silently dropped", () => {
    track("cta_click", { cta_label: "header_pricing", customerName: "Jane Doe", projectId: "proj_123", estimateTotal: 4500 });
    expect(window.gtag).toHaveBeenCalledTimes(1);
    const sentParams = vi.mocked(window.gtag!).mock.calls[0][2];
    expect(sentParams).toEqual({ cta_label: "header_pricing" });
    expect(sentParams).not.toHaveProperty("customerName");
    expect(sentParams).not.toHaveProperty("projectId");
    expect(sentParams).not.toHaveProperty("estimateTotal");
  });

  it("a listed event called with no params sends an empty params object, never throws", () => {
    expect(() => track("cta_click")).not.toThrow();
    expect(window.gtag).toHaveBeenCalledWith("event", "cta_click", {});
  });

  it("does nothing (no throw, no call) when gtag was never loaded (no PUBLIC_GA_MEASUREMENT_ID configured)", () => {
    delete (window as { gtag?: unknown }).gtag;
    expect(() => track("cta_click", { cta_label: "x" })).not.toThrow();
  });
});
