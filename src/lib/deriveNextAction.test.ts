import { describe, expect, it } from "vitest";
import { deriveNextAction } from "./estimateMath";
import { ZERO_CENTS } from "./money";
import type { Project, QuoteRevision } from "./types";

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

// deriveNextAction only reads project.status / quoteRevisions.length / actual
// (via deriveLifecycleStage) — a placeholder revision is enough to represent
// "a quote exists" for these tests without constructing a full priced one.
const aRevision = {} as QuoteRevision;

describe("deriveNextAction — the one next thing worth doing, per lifecycle stage", () => {
  it("Draft: 'Review and quote', enabled when the project can be quoted", () => {
    const action = deriveNextAction(baseProject({ status: "draft" }), true, []);
    expect(action.label).toBe("Review and quote");
    expect(action.kind).toBe("quote");
    expect(action.disabled).toBe(false);
  });

  it("Draft: disabled with a reason when blocking errors exist — never silently hidden", () => {
    const action = deriveNextAction(baseProject({ status: "draft" }), false, ["Missing catalog reference"]);
    expect(action.disabled).toBe(true);
    expect(action.reason).toBe("Missing catalog reference");
  });

  it("Quoted: 'Mark accepted or create revision'", () => {
    const action = deriveNextAction(baseProject({ status: "sent", quoteRevisions: [aRevision] }), true, []);
    expect(action.label).toBe("Mark accepted or create revision");
    expect(action.kind).toBe("accept-or-requote");
  });

  it("Accepted: 'Record job progress/actuals'", () => {
    const action = deriveNextAction(baseProject({ status: "won", quoteRevisions: [aRevision] }), true, []);
    expect(action.label).toBe("Record job progress/actuals");
    expect(action.kind).toBe("record-actuals");
  });

  it("Completed (won + actual data present): 'Review profitability'", () => {
    const action = deriveNextAction(
      baseProject({
        status: "won",
        quoteRevisions: [aRevision],
        actual: {
          actualLaborPersonHours: 1,
          actualMaterialsCostCents: ZERO_CENTS,
          actualEquipmentCostCents: ZERO_CENTS,
          actualDeliveryCostCents: ZERO_CENTS,
          actualOtherCostCents: ZERO_CENTS,
          finalSellingPriceCents: ZERO_CENTS,
          completedAt: "2026-02-01T00:00:00.000Z",
        },
      }),
      true,
      []
    );
    expect(action.label).toBe("Review profitability");
    expect(action.kind).toBe("review-profitability");
  });

  it("Archived: 'View/export history'", () => {
    const action = deriveNextAction(baseProject({ status: "archived", quoteRevisions: [aRevision] }), true, []);
    expect(action.label).toBe("View/export history");
    expect(action.kind).toBe("view-history");
  });

  it("Lost: a sensible next action is still offered (not a dead end)", () => {
    const action = deriveNextAction(baseProject({ status: "lost", quoteRevisions: [aRevision] }), true, []);
    expect(action.kind).toBe("reopen-or-archive");
    expect(action.label.length).toBeGreaterThan(0);
  });
});
