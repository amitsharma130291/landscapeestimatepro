import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LicenseActivationSection from "./LicenseActivationSection";
import { redeemLicenseKey, requestLicenseRecovery } from "../lib/license";

vi.mock("../lib/license", () => ({
  redeemLicenseKey: vi.fn(),
  requestLicenseRecovery: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LicenseActivationSection — activation", () => {
  it("activates a license key and calls onActivated with the confirmed key", async () => {
    vi.mocked(redeemLicenseKey).mockResolvedValue("LEP-PRO-abc123");
    const onActivated = vi.fn();
    render(<LicenseActivationSection onActivated={onActivated} />);

    fireEvent.change(screen.getByLabelText("License key"), { target: { value: "  lep-pro-abc123  " } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => expect(onActivated).toHaveBeenCalledWith("LEP-PRO-abc123"));
    expect(redeemLicenseKey).toHaveBeenCalledWith("lep-pro-abc123");
  });

  it("shows an error message and does not call onActivated when the key is rejected", async () => {
    vi.mocked(redeemLicenseKey).mockRejectedValue(new Error("That license key isn't valid."));
    const onActivated = vi.fn();
    render(<LicenseActivationSection onActivated={onActivated} />);

    fireEvent.change(screen.getByLabelText("License key"), { target: { value: "LEP-PRO-bogus" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That license key isn't valid.");
    expect(onActivated).not.toHaveBeenCalled();
  });

  it("disables the Activate button until a key is entered", () => {
    render(<LicenseActivationSection />);
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("License key"), { target: { value: "LEP-PRO-x" } });
    expect(screen.getByRole("button", { name: "Activate" })).not.toBeDisabled();
  });
});

describe("LicenseActivationSection — recovery", () => {
  it("reveals the recovery form only after clicking 'Forgot your license key?'", () => {
    render(<LicenseActivationSection />);
    expect(screen.queryByLabelText("Email you paid with")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Forgot your license key?"));
    expect(screen.getByLabelText("Email you paid with")).toBeInTheDocument();
  });

  it("sends a recovery request and shows the generic confirmation message", async () => {
    vi.mocked(requestLicenseRecovery).mockResolvedValue("If that email has a completed purchase, we've sent the license key to it.");
    render(<LicenseActivationSection />);

    fireEvent.click(screen.getByText("Forgot your license key?"));
    fireEvent.change(screen.getByLabelText("Email you paid with"), { target: { value: "contractor@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send license key" }));

    expect(await screen.findByText(/we've sent the license key to it/i)).toBeInTheDocument();
    expect(requestLicenseRecovery).toHaveBeenCalledWith("contractor@example.com");
  });

  it("shows an error message when the recovery request fails", async () => {
    vi.mocked(requestLicenseRecovery).mockRejectedValue(new Error("Couldn't process that request."));
    render(<LicenseActivationSection />);

    fireEvent.click(screen.getByText("Forgot your license key?"));
    fireEvent.change(screen.getByLabelText("Email you paid with"), { target: { value: "contractor@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send license key" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't process that request.");
  });
});
