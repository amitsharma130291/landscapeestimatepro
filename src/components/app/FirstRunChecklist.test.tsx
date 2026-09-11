import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import FirstRunChecklist from "./FirstRunChecklist";
import { DEFAULT_BUSINESS_SETTINGS, type Workspace } from "../../lib/types";

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

describe("FirstRunChecklist", () => {
  it("shows the real completion count for a brand-new workspace", async () => {
    render(<FirstRunChecklist workspace={emptyWorkspace()} />);
    expect(await screen.findByText("0 of 10 done")).toBeInTheDocument();
  });

  it("updates the count as real workspace data changes, not a separate flag", async () => {
    render(
      <FirstRunChecklist
        workspace={emptyWorkspace({ business: { ...DEFAULT_BUSINESS_SETTINGS, businessName: "Evergreen Lawns" } })}
      />
    );
    expect(await screen.findByText("1 of 10 done")).toBeInTheDocument();
  });

  it("collapses and stays collapsed on remount (persistent), but stays reopenable", async () => {
    const { unmount } = render(<FirstRunChecklist workspace={emptyWorkspace()} />);
    const toggle = await screen.findByRole("button", { name: /setup checklist/i });
    fireEvent.click(toggle);
    expect(screen.queryByText(/no invented defaults/i)).not.toBeInTheDocument();
    unmount();

    render(<FirstRunChecklist workspace={emptyWorkspace()} />);
    expect(await screen.findByRole("button", { name: /setup checklist/i })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /setup checklist/i }));
    expect(await screen.findByText(/no invented defaults/i)).toBeInTheDocument();
  });

  it("lets the contractor confirm a legitimate-default step (tax settings) instead of forcing a change", async () => {
    render(<FirstRunChecklist workspace={emptyWorkspace()} />);
    const confirmButtons = await screen.findAllByRole("button", { name: /already reviewed/i });
    fireEvent.click(confirmButtons[0]);
    expect(await screen.findByText("1 of 10 done")).toBeInTheDocument();
  });
});
