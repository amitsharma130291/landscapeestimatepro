/**
 * Phase 8 hardening: a job-costing field the contractor hasn't filled in yet
 * must render as blank/"Not entered yet" — never as $0.00 or 0, which would
 * silently claim the job cost nothing. These tests render the real
 * ActualsTab against a seeded workspace (via WorkspaceProvider + the same
 * localStorage path production uses) rather than mocking the component's
 * internals, so they catch the bug at the same layer a contractor would see
 * it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActualsTab from "./ActualsTab";
import { buildQuoteRevision } from "../../../lib/estimateMath";
import { saveWorkspace } from "../../../lib/persistence";
import { ZERO_CENTS, type MoneyCents } from "../../../lib/money";
import { DEFAULT_BUSINESS_SETTINGS } from "../../../lib/types";
import type { Assembly, BusinessSettings, Material, Project, Workspace } from "../../../lib/types";
import { WorkspaceProvider } from "../../../lib/workspaceContext";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

/** One quoted-and-won job with no actuals recorded yet — assemblies/material
 * costs are chosen so estimated materials ($500) and estimated labor ($300)
 * never collide with the $60 an individual test enters, so text assertions
 * can't accidentally match the wrong cell. */
function buildFixtureWorkspace(): Workspace {
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
  // minimumProjectPriceCents is zeroed so this file's actuals/variance
  // assertions aren't silently confounded by DEFAULT_BUSINESS_SETTINGS' own
  // $500 floor (LEP-115) — that enforcement mechanism gets its own tests.
  const business: BusinessSettings = { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: cents(3000), minimumProjectPriceCents: ZERO_CENTS };
  const draftProject: Project = {
    id: "p1",
    name: "Test Job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "sent",
    serviceLines: [{ id: "l1", assemblyId: "a1", quantity: 100 }],
    equipmentLines: [],
    laborLines: [],
    deliveryCostCents: ZERO_CENTS,
    extraCosts: [],
    overheadPercent: 10,
    targetMarginPercent: 30,
    taxRatePercent: 0,
    quoteRevisions: [],
  };
  const revision = buildQuoteRevision(draftProject, [assembly], [material], [], business);
  const wonProject: Project = { ...draftProject, status: "won", quoteRevisions: [revision], activeQuoteRevisionId: revision.id };

  return {
    version: 5,
    business,
    materials: [material],
    equipment: [],
    assemblies: [assembly],
    projects: [wonProject],
    templates: [],
  };
}

function renderActualsTab() {
  return render(
    <WorkspaceProvider>
      <ActualsTab />
    </WorkspaceProvider>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ActualsTab — missing actual data must never render as zero", () => {
  it("a brand-new actuals entry shows blank cost fields, not $0.00", () => {
    saveWorkspace(buildFixtureWorkspace());
    renderActualsTab();

    const materialsInput = screen.getByLabelText("Actual materials $") as HTMLInputElement;
    const equipmentInput = screen.getByLabelText("Actual equipment $") as HTMLInputElement;
    const deliveryInput = screen.getByLabelText("Actual delivery $") as HTMLInputElement;
    const otherInput = screen.getByLabelText("Actual other $") as HTMLInputElement;

    for (const input of [materialsInput, equipmentInput, deliveryInput, otherInput]) {
      expect(input.value).toBe("");
      expect(input.value).not.toBe("0");
    }
  });

  it("a brand-new actual quantity/labor-hours row shows blank, not the estimated default or 0", () => {
    saveWorkspace(buildFixtureWorkspace());
    renderActualsTab();

    const qtyInput = screen.getByLabelText("Actual quantity for Mulch Install") as HTMLInputElement;
    const hoursInput = screen.getByLabelText("Actual labor hours for Mulch Install") as HTMLInputElement;
    expect(qtyInput.value).toBe("");
    expect(hoursInput.value).toBe("");

    expect(screen.getByText(/Total actual labor: Not entered yet/)).toBeInTheDocument();
  });

  it("entering one category leaves the others 'Not entered yet' in the estimated-vs-actual breakdown after saving", async () => {
    const user = userEvent.setup();
    saveWorkspace(buildFixtureWorkspace());
    renderActualsTab();

    const materialsInput = screen.getByLabelText("Actual materials $");
    await user.type(materialsInput, "60");
    await user.tab();
    expect((materialsInput as HTMLInputElement).value).toBe("60");

    await user.click(screen.getByRole("button", { name: "Save actuals" }));

    // The entered category (Materials) shows a real dollar figure in its
    // Actual column...
    const materialsRow = screen.getByText("Materials").closest("tr")!;
    expect(within(materialsRow).getByText(/\$60\.00/)).toBeInTheDocument();

    // ...while a category never touched (Equipment) still reads "Not entered
    // yet" in its Actual column — even though its ESTIMATED column
    // legitimately shows $0.00 (nothing was ever quoted for equipment on
    // this job), the actual side must not borrow that same $0.00 for
    // "nobody has recorded a number yet".
    const equipmentRow = screen.getByText("Equipment").closest("tr")!;
    expect(within(equipmentRow).getByText("Not entered yet")).toBeInTheDocument();

    // The incompleteness callout lists the untouched fields by name so the
    // contractor can find them before treating the job as fully recorded.
    expect(screen.getByText(/field.*not entered yet/i)).toBeInTheDocument();
    expect(screen.getByText("Actual equipment cost")).toBeInTheDocument();
  });
});
