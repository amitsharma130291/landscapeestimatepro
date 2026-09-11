import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AppShell from "./AppShell";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AppShell — free-beta label (APP_RELEASE_MODE)", () => {
  it("shows a visible 'Free beta' label, since this build exposes /app with no access control", async () => {
    render(<AppShell activeTab="overview" />);
    expect(await screen.findByText("Free beta")).toBeInTheDocument();
  });

  it("the label explains itself (no bare unexplained badge)", async () => {
    render(<AppShell activeTab="overview" />);
    const badge = await screen.findByText("Free beta");
    expect(badge.getAttribute("title")).toMatch(/no purchase|no account|access control/i);
  });
});
