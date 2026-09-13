import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
});

describe("LicenseGate", () => {
  it("renders the activation gate when no license is stored and the URL carries none", async () => {
    render(
      <LicenseGate>
        <div>Pro app content</div>
      </LicenseGate>
    );
    expect(await screen.findByText("Activate Landscape Estimate Pro")).toBeInTheDocument();
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
    expect(screen.queryByText("Activate Landscape Estimate Pro")).not.toBeInTheDocument();
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

  it("falls back to the locked gate when the URL's license key fails to redeem", async () => {
    window.history.replaceState({}, "", "/app/?license=LEP-PRO-bad");
    vi.mocked(redeemLicenseKey).mockRejectedValue(new Error("not valid"));

    render(
      <LicenseGate>
        <div>Pro app content</div>
      </LicenseGate>
    );

    expect(await screen.findByText("Activate Landscape Estimate Pro")).toBeInTheDocument();
    expect(screen.queryByText("Pro app content")).not.toBeInTheDocument();
  });

  it("unlocks and shows children after activating through the embedded activation form", async () => {
    vi.mocked(redeemLicenseKey).mockResolvedValue("LEP-PRO-typed");
    render(
      <LicenseGate>
        <div>Pro app content</div>
      </LicenseGate>
    );

    await screen.findByText("Activate Landscape Estimate Pro");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText("License key"), { target: { value: "LEP-PRO-typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => expect(screen.getByText("Pro app content")).toBeInTheDocument());
  });
});
