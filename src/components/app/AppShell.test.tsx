import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import AppShell from "./AppShell";

const LICENSE_KEY_STORAGE = "landscapeEstimateProLicense";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("AppShell — license gate (APP_RELEASE_MODE: licensed)", () => {
  it("redirects to the sales page instead of the app when no license is stored", async () => {
    // /app/ has no in-place activation wall any more — an unlicensed
    // visitor is redirected away entirely (see LicenseGate.tsx). jsdom
    // doesn't implement window.location.replace(), so stub it the same
    // way src/lib/license.test.ts stubs `location` for startCheckout().
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace } as unknown as Location);

    render(<AppShell activeTab="overview" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/landscaping-estimating-software/"));
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
  });

  it("renders the app immediately when a license is already stored in this browser", async () => {
    window.localStorage.setItem(LICENSE_KEY_STORAGE, "LEP-PRO-test-payment-id");
    render(<AppShell activeTab="overview" />);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByText("Activate Landscape Estimate Pro")).not.toBeInTheDocument();
  });

  it("no longer shows the retired 'Free beta' label — the app is genuinely gated now", async () => {
    window.localStorage.setItem(LICENSE_KEY_STORAGE, "LEP-PRO-test-payment-id");
    render(<AppShell activeTab="overview" />);
    await screen.findByRole("heading", { name: "Overview" });
    expect(screen.queryByText("Free beta")).not.toBeInTheDocument();
  });
});
