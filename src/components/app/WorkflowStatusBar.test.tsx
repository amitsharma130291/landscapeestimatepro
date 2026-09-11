import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WorkflowStatusBar from "./WorkflowStatusBar";
import { ZERO_CENTS } from "../../lib/money";
import type { Project, QuoteRevision } from "../../lib/types";

afterEach(cleanup);

function baseProject(overrides?: Partial<Project>): Project {
  return {
    id: "p1",
    name: "Project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "draft",
    serviceLines: [],
    equipmentLines: [],
    laborLines: [],
    deliveryCostCents: ZERO_CENTS,
    extraCosts: [],
    overheadPercent: 15,
    targetMarginPercent: 35,
    taxRatePercent: 0,
    quoteRevisions: [],
    ...overrides,
  };
}

const noop = () => {};
const baseProps = {
  onQuote: noop,
  onMarkAccepted: noop,
  onCreateRevision: noop,
  onShowHistory: noop,
};

describe("WorkflowStatusBar", () => {
  it("Draft: shows the Draft badge, Live state, no revision, and an enabled 'Review and quote' action", async () => {
    render(<WorkflowStatusBar project={baseProject()} activeRevision={null} canQuote={true} blockingErrors={[]} lastSavedAt={Date.now()} {...baseProps} />);
    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("No quote revision yet")).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Review and quote" });
    expect(action).toBeEnabled();
    // Impossible-for-this-state actions must not appear at all.
    expect(screen.queryByRole("button", { name: "Mark accepted" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create revision" })).not.toBeInTheDocument();
  });

  it("Draft with blocking errors: the next action is disabled, not hidden, and explains why", async () => {
    render(
      <WorkflowStatusBar
        project={baseProject()}
        activeRevision={null}
        canQuote={false}
        blockingErrors={["A service line references a deleted assembly"]}
        lastSavedAt={null}
        {...baseProps}
      />
    );
    const action = await screen.findByRole("button", { name: "Review and quote" });
    expect(action).toBeDisabled();
    expect(screen.getByText(/1 blocking problem/)).toBeInTheDocument();
    expect(screen.getByText(/not yet saved this session/i)).toBeInTheDocument();
  });

  it("Quoted with a locked revision: shows Locked, the revision number, and both accept/re-quote actions", async () => {
    const revision = { id: "r1", revisionNumber: 1 } as QuoteRevision;
    render(
      <WorkflowStatusBar
        project={baseProject({ status: "sent", quoteRevisions: [revision] })}
        activeRevision={revision}
        canQuote={true}
        blockingErrors={[]}
        lastSavedAt={Date.now()}
        {...baseProps}
      />
    );
    expect(await screen.findByText("Quoted")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByText("Revision 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark accepted" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create revision" })).toBeInTheDocument();
    // A draft-only action must not leak into this state.
    expect(screen.queryByRole("button", { name: "Review and quote" })).not.toBeInTheDocument();
  });

  it("Accepted: offers 'Record job progress/actuals' and does not offer quoting actions", async () => {
    const revision = { id: "r1", revisionNumber: 1 } as QuoteRevision;
    render(
      <WorkflowStatusBar
        project={baseProject({ status: "won", quoteRevisions: [revision] })}
        activeRevision={revision}
        canQuote={true}
        blockingErrors={[]}
        lastSavedAt={Date.now()}
        {...baseProps}
      />
    );
    expect(await screen.findByText("Accepted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record job progress/actuals" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark accepted" })).not.toBeInTheDocument();
  });

  it("Archived: offers 'View/export history' only when revisions actually exist", async () => {
    const revision = { id: "r1", revisionNumber: 1 } as QuoteRevision;
    render(
      <WorkflowStatusBar
        project={baseProject({ status: "archived", quoteRevisions: [revision] })}
        activeRevision={revision}
        canQuote={true}
        blockingErrors={[]}
        lastSavedAt={Date.now()}
        {...baseProps}
      />
    );
    expect(await screen.findByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View/export history" })).toBeInTheDocument();
  });

  it("clicking 'Review and quote' invokes onQuote", async () => {
    const onQuote = vi.fn();
    render(<WorkflowStatusBar project={baseProject()} activeRevision={null} canQuote={true} blockingErrors={[]} lastSavedAt={null} {...baseProps} onQuote={onQuote} />);
    (await screen.findByRole("button", { name: "Review and quote" })).click();
    expect(onQuote).toHaveBeenCalledTimes(1);
  });
});
