import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LicenseGate from "./LicenseGate";
import { redeemLicenseKey } from "../../lib/license";

vi.mock("../../lib/license", async () => {
  const actual = await vi.importActual<typeof import("../../lib/license")>("../../lib/license");
  return { ...actual, redeemLicenseKey: vi.fn() };
});

const LICENSE_KEY_STORAGE = "landscapeEstimateProLicense";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/app/");
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** /app/ has no in-place "enter your key" wall any more — an unlicensed
 * visitor is redirected away entirely (see LicenseGate.tsx's own comment
 * for why: /pricing/ still offers recovery/re-activation for a returning
 * customer). window.location.replace() isn't implemented in jsdom, so it's
 * stubbed the same way src/lib/license.test.ts stubs `location` for
 * startCheckout()'s redirect. */
function stubLocationReplace() {
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, replace } as unknown as Location);
  return replace;
}

describe("LicenseGate", () => {
  it("redirects to the sales page when no license is stored and the URL carries none", async () => {
    const replace = stubLocationReplace();
    render(
      <LicenseGate>
        <div>Pro app content</div>
      </LicenseGate>
    );
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/landscaping-estimating-software/"));
    expect(screen.queryByText("Pro app content")).not.toBeInTheDocument();
  });

  it("renders children immediately when a valid license is already stored", async () => {
    window.localStorage.setItem(LICENSE_KEY_STORAGE, "LEP-PRO-existing");
    render(
      <LicenseGate>
        <div>Pro app content</div>
      </LicenseGate>
    );
    expect(await screen.findByText("Pro app content")).toBeInTheDocument();
  });

  it("auto-activates and renders children when the URL carries a valid ?license= param", async () => {
    window.history.replaceState({}, "", "/app/?license=LEP-PRO-fromlink");
    vi.mocked(redeemLicenseKey).mockResolvedValue("LEP-PRO-fromlink");

    render(
      <LicenseGate>
        <div>Pro app content</div>
      </LicenseGate>
    );

    expect(await screen.findByText("Pro app content")).toBeInTheDocument();
    expect(redeemLicenseKey).toHaveBeenCalledWith("LEP-PRO-fromlink");
  });

  it("redirects to the sales page when the URL's license key fails to redeem, same as any other unlicensed visit", async () => {
    window.history.replaceState({}, "", "/app/?license=LEP-PRO-bad");
    vi.mocked(redeemLicenseKey).mockRejectedValue(new Error("not valid"));
    const replace = stubLocationReplace();

    render(
      <LicenseGate>
        <div>Pro app content</div>
      </LicenseGate>
    );

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/landscaping-estimating-software/"));
    expect(screen.queryByText("Pro app content")).not.toBeInTheDocument();
  });
});
