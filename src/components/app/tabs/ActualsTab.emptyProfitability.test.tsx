/**
 * Phase 11 empty-state audit: when there are projects but NONE are eligible
 * or excluded for profitability (i.e. nothing has ever reached "won" yet),
 * the profitability card used to disappear with zero explanation — leaving
 * a contractor to wonder whether something was broken. It must instead say
 * what's missing and that nothing is broken/lost.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ActualsTab from "./ActualsTab";
import { saveWorkspace } from "../../../lib/persistence";
import { ZERO_CENTS, type MoneyCents } from "../../../lib/money";
import { DEFAULT_BUSINESS_SETTINGS } from "../../../lib/types";
import type { Assembly, Material, Project, Workspace } from "../../../lib/types";
import { WorkspaceProvider } from "../../../lib/workspaceContext";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

function buildWorkspaceWithOnlyQuotedProjects(): Workspace {
  const material: Material = { id: "m1", name: "Mulch", unitCostCents: cents(500), unit: "bag" };
  const assembly: Assembly = {
    id: "a1",
    name: "Mulch Install",
    unit: "sqft",
    materials: [{ materialId: "m1", quantityPerUnit: 1 }],
    laborInputMode: "person-hours-per-unit",
    laborPersonHoursPerUnit: 0.1,
    equipment: [],
    otherCostPerUnitCents: ZERO_CENTS,
  };
  const quotedProject: Project = {
    id: "p1",
    name: "Not Yet Won",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "sent",
    serviceLines: [{ id: "l1", assemblyId: "a1", quantity: 10 }],
    equipmentLines: [],
    laborLines: [],
    deliveryCostCents: ZERO_CENTS,
    extraCosts: [],
    overheadPercent: 10,
    targetMarginPercent: 30,
    taxRatePercent: 0,
    quoteRevisions: [],
  };

  return {
    version: 5,
    business: DEFAULT_BUSINESS_SETTINGS,
    materials: [material],
    equipment: [],
    assemblies: [assembly],
    projects: [quotedProject],
    templates: [],
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ActualsTab — no eligible/excluded profitability data yet", () => {
  it("explains that nothing is eligible yet instead of silently omitting the profitability card", () => {
    saveWorkspace(buildWorkspaceWithOnlyQuotedProjects());
    render(
      <WorkspaceProvider>
        <ActualsTab />
      </WorkspaceProvider>
    );

    expect(screen.getByText("Profitability reporting")).toBeInTheDocument();
    expect(screen.getByText(/Accepted/)).toBeInTheDocument();
    expect(screen.getByText(/nothing is broken and no data has been lost/i)).toBeInTheDocument();
    // The full metrics card (with its distinct heading) must not also render.
    expect(screen.queryByText("Profitability, across every completed job")).not.toBeInTheDocument();
  });
});
