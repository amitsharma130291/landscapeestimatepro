import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AppShell from "./AppShell";

const LICENSE_KEY_STORAGE = "landscapeEstimateProLicense";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AppShell — license gate (APP_RELEASE_MODE: licensed)", () => {
  it("shows the activation gate, not the app, when no license is stored", async () => {
    render(<AppShell activeTab="overview" />);
    expect(await screen.findByText("Activate Landscape Estimate Pro")).toBeInTheDocument();
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
