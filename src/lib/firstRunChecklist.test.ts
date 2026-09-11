import { describe, expect, it } from "vitest";
import { deriveFirstRunChecklist } from "./firstRunChecklist";
import { DEFAULT_BUSINESS_SETTINGS, type Workspace } from "./types";
import type { MoneyCents } from "./money";

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

describe("deriveFirstRunChecklist", () => {
  it("a brand-new workspace (all seeded defaults, no data) has every step incomplete", () => {
    const steps = deriveFirstRunChecklist(emptyWorkspace(), new Set());
    expect(steps).toHaveLength(10);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("does not credit the seeded default labor rate as a deliberate business decision", () => {
    const workspace = emptyWorkspace();
    const steps = deriveFirstRunChecklist(workspace, new Set());
    const laborStep = steps.find((s) => s.id === "loaded-labor-rate")!;
    expect(workspace.business.loadedLaborRateCents).toBe(DEFAULT_BUSINESS_SETTINGS.loadedLaborRateCents);
    expect(laborStep.done).toBe(false);
  });

  it("marks loaded labor rate done once the contractor changes it from the default", () => {
    const workspace = emptyWorkspace({
      business: { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: 4500 as MoneyCents },
    });
    const steps = deriveFirstRunChecklist(workspace, new Set());
    expect(steps.find((s) => s.id === "loaded-labor-rate")!.done).toBe(true);
  });

  it("business details is done only when a non-empty business name is present", () => {
    const blank = deriveFirstRunChecklist(emptyWorkspace({ business: { ...DEFAULT_BUSINESS_SETTINGS, businessName: "   " } }), new Set());
    expect(blank.find((s) => s.id === "business-details")!.done).toBe(false);

    const named = deriveFirstRunChecklist(emptyWorkspace({ business: { ...DEFAULT_BUSINESS_SETTINGS, businessName: "Evergreen Lawns" } }), new Set());
    expect(named.find((s) => s.id === "business-details")!.done).toBe(true);
  });

  it("catalog/estimate steps respond to real workspace counts, not a separate flag", () => {
    const workspace = emptyWorkspace({
      materials: [{ id: "m1", name: "Mulch", unitCostCents: 100 as MoneyCents, unit: "yd3" }],
    });
    const steps = deriveFirstRunChecklist(workspace, new Set());
    expect(steps.find((s) => s.id === "first-material")!.done).toBe(true);
    expect(steps.find((s) => s.id === "first-equipment")!.done).toBe(false);
    expect(steps.find((s) => s.id === "first-assembly")!.done).toBe(false);
    expect(steps.find((s) => s.id === "first-estimate")!.done).toBe(false);
  });

  it("tax settings and quote rounding stay incomplete at their default unless explicitly confirmed", () => {
    const workspace = emptyWorkspace();
    const unconfirmed = deriveFirstRunChecklist(workspace, new Set());
    expect(unconfirmed.find((s) => s.id === "tax-settings")!.done).toBe(false);
    expect(unconfirmed.find((s) => s.id === "quote-rounding")!.done).toBe(false);

    const confirmed = deriveFirstRunChecklist(workspace, new Set(["tax-settings", "quote-rounding"]));
    expect(confirmed.find((s) => s.id === "tax-settings")!.done).toBe(true);
    expect(confirmed.find((s) => s.id === "quote-rounding")!.done).toBe(true);
  });

  it("only tax settings and quote rounding are confirmable — every other step must reflect real data", () => {
    const steps = deriveFirstRunChecklist(emptyWorkspace(), new Set());
    const confirmableIds = steps.filter((s) => s.confirmable).map((s) => s.id);
    expect(confirmableIds.sort()).toEqual(["quote-rounding", "tax-settings"]);
  });

  it("a fully set-up workspace shows all 10 steps done", () => {
    const workspace = emptyWorkspace({
      business: {
        ...DEFAULT_BUSINESS_SETTINGS,
        businessName: "Evergreen Lawns",
        loadedLaborRateCents: 4500 as MoneyCents,
        overheadPercent: 18,
        targetMarginPercent: 30,
        taxRatePercent: 6,
        roundingIncrementCents: 500,
      },
      materials: [{ id: "m1", name: "Mulch", unitCostCents: 100 as MoneyCents, unit: "yd3" }],
      equipment: [{ id: "e1", name: "Mower", rateCents: 100 as MoneyCents, rateType: "hour" }],
      assemblies: [
        {
          id: "a1",
          name: "Mulch install",
          unit: "yd3",
          materials: [],
          laborInputMode: "person-hours-per-unit",
          laborPersonHoursPerUnit: 0.4,
          equipment: [],
          otherCostPerUnitCents: 0 as MoneyCents,
        },
      ],
      projects: [{ id: "p1", name: "Smith backyard", status: "draft", quoteRevisions: [] } as unknown as Workspace["projects"][number]],
    });
    const steps = deriveFirstRunChecklist(workspace, new Set());
    expect(steps.every((s) => s.done)).toBe(true);
  });
});
