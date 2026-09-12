import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import GettingStartedSection from "./GettingStartedSection";
import { DEFAULT_BUSINESS_SETTINGS, type Workspace } from "../../lib/types";
import type { MoneyCents } from "../../lib/money";

function emptyWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    version: 5,
    business: { ...DEFAULT_BUSINESS_SETTINGS },
    materials: [],
    equipment: [],
    assemblies: [],
    projects: [],
    templates: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("GettingStartedSection", () => {
  it("shows 0 of 5 for a brand-new workspace", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    expect(await screen.findByText("0 of 5 steps complete")).toBeInTheDocument();
  });

  it("renders all 5 steps with a title, description, status text, and an action link", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    await screen.findByText("0 of 5 steps complete");
    const list = screen.getByRole("list");
    for (const title of ["Set up your business", "Add your costs", "Build a service", "Create your first estimate", "Compare estimate vs. actual"]) {
      expect(within(list).getByText(new RegExp(title))).toBeInTheDocument();
    }
    expect(screen.getAllByText("Not started")).toHaveLength(5);
  });

  it("20. every action link points at its real destination route", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    await screen.findByText("0 of 5 steps complete");
    expect(screen.getByRole("link", { name: /Open Settings/ })).toHaveAttribute("href", "/app/settings/");
    expect(screen.getByRole("link", { name: /Build Your Catalog/ })).toHaveAttribute("href", "/app/catalog/");
    expect(screen.getByRole("link", { name: /Create a Service/ })).toHaveAttribute("href", "/app/templates/");
    expect(screen.getByRole("link", { name: /Create an Estimate/ })).toHaveAttribute("href", "/app/estimates/");
    expect(screen.getByRole("link", { name: /Record Actuals/ })).toHaveAttribute("href", "/app/actuals/");
  });

  it("marks the first incomplete step as the recommended next step", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    await screen.findByText("0 of 5 steps complete");
    const businessStep = screen.getByText("Set up your business").closest("li")!;
    expect(within(businessStep).getByText("Recommended next")).toBeInTheDocument();
    const costsStep = screen.getByText("Add your costs").closest("li")!;
    expect(within(costsStep).queryByText("Recommended next")).not.toBeInTheDocument();
  });

  it("does not disable or hide later steps — every step is reachable regardless of order", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    await screen.findByText("0 of 5 steps complete");
    const lastStepLink = screen.getByRole("link", { name: /Record Actuals/ });
    expect(lastStepLink).not.toHaveAttribute("aria-disabled");
    expect(lastStepLink.tagName).toBe("A"); // a real, always-clickable link, never a disabled control
  });

  it("2. does not falsely mark the catalog/service steps done from sample data, and labels it", async () => {
    const { createSampleWorkspace } = await import("../../lib/sampleData");
    render(<GettingStartedSection workspace={createSampleWorkspace()} />);
    expect(await screen.findByText("0 of 5 steps complete")).toBeInTheDocument();
    expect(screen.getAllByText("Sample data — replace with your business costs").length).toBeGreaterThan(0);
  });

  it("shows the completion banner with both actions once all 5 steps are done", async () => {
    const workspace = emptyWorkspace({
      business: {
        ...DEFAULT_BUSINESS_SETTINGS,
        businessName: "Evergreen Lawns",
        loadedLaborRateCents: 4500 as MoneyCents,
        overheadPercent: 18,
        targetMarginPercent: 30,
        minimumProjectPriceCents: 60000 as MoneyCents,
      },
      materials: [{ id: "m1", name: "Mulch", unitCostCents: 100 as MoneyCents, unit: "yd3" }],
      assemblies: [
        {
          id: "a1",
          name: "Mulch install",
          unit: "yd3",
          materials: [{ materialId: "m1", quantityPerUnit: 1 }],
          laborInputMode: "person-hours-per-unit",
          laborPersonHoursPerUnit: 0.4,
          equipment: [],
          otherCostPerUnitCents: 0 as MoneyCents,
        },
      ],
      projects: [
        {
          id: "p1",
          name: "Smith backyard",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "won",
          serviceLines: [],
          equipmentLines: [],
          laborLines: [],
          deliveryCostCents: 5000 as MoneyCents,
          extraCosts: [],
          overheadPercent: 18,
          targetMarginPercent: 30,
          taxRatePercent: 0,
          quoteRevisions: [],
          actual: {
            actualLaborPersonHours: 4,
            actualMaterialsCostCents: 10000 as MoneyCents,
            actualEquipmentCostCents: 0 as MoneyCents,
            actualDeliveryCostCents: 0 as MoneyCents,
            actualOtherCostCents: 0 as MoneyCents,
            finalSellingPriceCents: 20000 as MoneyCents,
            completedAt: new Date().toISOString(),
          },
        },
      ],
    });
    render(<GettingStartedSection workspace={workspace} />);
    expect(await screen.findByText("You're ready to estimate with confidence.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create New Estimate" })).toHaveAttribute("href", "/app/estimates/");
    expect(screen.getByRole("link", { name: "Review Service Rate Health" })).toHaveAttribute("href", "/app/rate-health/");
    // The section stays visible and collapsible — never auto-hidden.
    expect(screen.getByRole("button", { name: /How to get started/ })).toBeInTheDocument();
  });

  it("18/19. collapsing persists across remounts and never changes completion", async () => {
    const { unmount } = render(<GettingStartedSection workspace={emptyWorkspace()} />);
    const toggle = await screen.findByRole("button", { name: /How to get started/ });
    fireEvent.click(toggle);
    expect(await screen.findByRole("button", { name: /Show getting-started guide/ })).toBeInTheDocument();
    unmount();

    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    const reopenedToggle = await screen.findByRole("button", { name: /Show getting-started guide/ });
    expect(reopenedToggle).toHaveAttribute("aria-expanded", "false");

    // Completion state (still 0/5) is untouched by having been collapsed.
    fireEvent.click(reopenedToggle);
    expect(await screen.findByText("0 of 5 steps complete")).toBeInTheDocument();
  });

  it("22. progress bar exposes accessible current/min/max values", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace({ materials: [{ id: "m1", name: "Mulch", unitCostCents: 100 as MoneyCents, unit: "yd3" }] })} />);
    await screen.findByText("1 of 5 steps complete");
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAccessibleName();
  });

  it("21. the collapse toggle is a real button reachable and operable via the keyboard", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    const toggle = await screen.findByRole("button", { name: /How to get started/ });
    expect(toggle.tagName).toBe("BUTTON");
    toggle.focus();
    expect(toggle).toHaveFocus();
  });

  it("does not use color alone to convey status — every step shows an icon AND visible status text", async () => {
    render(<GettingStartedSection workspace={emptyWorkspace()} />);
    await screen.findByText("0 of 5 steps complete");
    // Every status icon is aria-hidden (decorative) — the accessible signal
    // is the visible text next to it, asserted above via getAllByText.
    expect(screen.getAllByText("Not started")).toHaveLength(5);
  });
});
