import { describe, expect, it } from "vitest";
import { buildCustomerDocumentFromDraft, buildCustomerDocumentFromRevision, buildBusinessAddressLines } from "./customerDocument";
import { buildQuoteRevision } from "./estimateMath";
import { ZERO_CENTS, type MoneyCents } from "./money";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { Assembly, BusinessSettings, Material, Project } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

// minimumProjectPriceCents is zeroed so this file's customer-document
// reconciliation assertions aren't silently confounded by
// DEFAULT_BUSINESS_SETTINGS' own $500 floor (LEP-115) — that enforcement
// mechanism gets its own dedicated tests in minimumPrice.test.ts.
const business: BusinessSettings = { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: cents(3200), businessName: "Evergreen Lawns", minimumProjectPriceCents: ZERO_CENTS };

const materials: Material[] = [{ id: "mulch", name: "Mulch", unitCostCents: cents(4200), unit: "yd3" }];
const mulchAssembly: Assembly = {
  id: "mulch-install",
  name: "Mulch Installation",
  unit: "yd3",
  materials: [{ materialId: "mulch", quantityPerUnit: 1 }],
  laborInputMode: "person-hours-per-unit",
  laborPersonHoursPerUnit: 0.4,
  equipment: [],
  otherCostPerUnitCents: ZERO_CENTS,
};
const shrubAssembly: Assembly = {
  id: "shrub-install",
  name: "Mulch Installation", // deliberately duplicate name, different assembly
  unit: "each",
  materials: [],
  laborInputMode: "person-hours-per-unit",
  laborPersonHoursPerUnit: 0.45,
  equipment: [],
  otherCostPerUnitCents: ZERO_CENTS,
};

function baseProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj-1",
    name: "Job",
    customerName: "Jane Doe",
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

describe("DEF-13 customerDetailMode — all three modes reconcile to the exact same total", () => {
  it("project-total, service-totals, and detailed all report the identical totalCents for the same locked revision", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };

    for (const mode of ["project-total", "service-totals", "detailed"] as const) {
      const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: mode }, business);
      expect(doc.totalCents).toBe(revision.customerTotalCents);
      expect(doc.mode).toBe(mode);
    }
  });

  it("project-total mode shows NO line breakdown at all — just the total", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business, { actualQuotedPriceOverrideCents: 50000 });
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: "project-total" }, business);
    expect(doc.lines).toEqual([]);
    expect(doc.totalCents).toBe(revision.customerTotalCents);
  });

  it("service-totals mode shows each service and its amount, but NO quantity/unit/rate", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: "service-totals" }, business);
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].label).toBe("Mulch Installation");
    expect(doc.lines[0].amountCents).toBeGreaterThan(0);
    expect(doc.lines[0].quantity).toBeUndefined();
    expect(doc.lines[0].unit).toBeUndefined();
    expect(doc.lines[0].rateCents).toBeUndefined();
    // Every line's amount sums exactly to the total in this single-line case.
    expect(doc.lines[0].amountCents).toBe(doc.totalCents);
  });

  it("detailed mode shows quantity, unit, rate, and amount for a service line, and rate x quantity reconciles to the amount", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: "detailed" }, business);
    expect(doc.lines).toHaveLength(1);
    const line = doc.lines[0];
    expect(line.quantity).toBe(8);
    expect(line.unit).toBe("yd³");
    expect(line.rateCents).toBeDefined();
    expect(Math.round(line.rateCents! * 8)).toBe(line.amountCents);
  });
});

describe("DEF-13 multi-service reconciliation: every mode's line amounts sum exactly to the total, across duplicate service names", () => {
  it("two DIFFERENT assemblies sharing the SAME display name ('Mulch Installation') stay distinct lines that both sum exactly to the total", () => {
    const draft = baseProject({
      serviceLines: [
        { id: "l1", assemblyId: "mulch-install", quantity: 8 },
        { id: "l2", assemblyId: "shrub-install", quantity: 5 },
      ],
    });
    const revision = buildQuoteRevision(draft, [mulchAssembly, shrubAssembly], materials, [], business);
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };

    for (const mode of ["service-totals", "detailed"] as const) {
      const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: mode }, business);
      expect(doc.lines).toHaveLength(2);
      expect(doc.lines[0].label).toBe("Mulch Installation");
      expect(doc.lines[1].label).toBe("Mulch Installation"); // both, deliberately duplicate
      const sum = doc.lines.reduce((s, l) => s + l.amountCents, 0);
      expect(sum).toBe(doc.totalCents); // exact reconciliation, no cent lost or invented
    }
  });
});

describe("DEF-13 zero and fractional quantities", () => {
  it("a fractional quantity (7.8 yd3) shows correctly in detailed mode and still reconciles", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 7.8 }] });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: "detailed" }, business);
    expect(doc.lines[0].quantity).toBe(7.8);
    expect(doc.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(doc.totalCents);
  });

  it("a zero-quantity line never divides by zero for its rate — it's simply omitted from the qty/unit/rate breakdown", () => {
    const draft = baseProject({
      serviceLines: [
        { id: "l1", assemblyId: "mulch-install", quantity: 0 },
        { id: "l2", assemblyId: "shrub-install", quantity: 5 },
      ],
    });
    const revision = buildQuoteRevision(draft, [mulchAssembly, shrubAssembly], materials, [], business);
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: "detailed" }, business);
    const zeroQtyLine = doc.lines.find((l) => l.label === "Mulch Installation" && l.quantity === undefined);
    expect(zeroQtyLine).toBeDefined();
    expect(Number.isFinite(zeroQtyLine!.amountCents)).toBe(true);
    expect(Number.isNaN(zeroQtyLine!.amountCents)).toBe(false);
  });
});

describe("DEF-13 special characters and long descriptions", () => {
  it("a service name with special characters/Unicode passes through the document model unmodified (rendering safety is the component's job, not the model's)", () => {
    const specialAssembly: Assembly = { ...mulchAssembly, id: "special", name: `Mulch & Edging — "deluxe" 覆盖物 <script>alert(1)</script>` };
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "special", quantity: 3 }] });
    const revision = buildQuoteRevision(draft, [specialAssembly], materials, [], business);
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: "service-totals" }, business);
    expect(doc.lines[0].label).toBe(`Mulch & Edging — "deluxe" 覆盖物 <script>alert(1)</script>`);
  });

  it("a very long project/customer name passes through unmodified — wrapping is the renderer's job", () => {
    const longName = "The Extraordinarily Long Family Trust of Smith-Johnson-Williams-Anderson-O'Brien Residence";
    const draft = baseProject({ customerName: longName, name: longName });
    const doc = buildCustomerDocumentFromDraft(draft, [], [], [], business, cents(50000), ZERO_CENTS, cents(50000));
    expect(doc.customerName).toBe(longName);
    expect(doc.projectName).toBe(longName);
  });
});

describe("DEF-13 internal-data privacy in every mode: the CustomerDocument object itself never carries an internal-only field", () => {
  it("no key on the CustomerDocument or any of its lines is named after an internal cost/rate concept, in any mode", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }], overheadPercent: 33, targetMarginPercent: 47 });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], { ...business, loadedLaborRateCents: cents(9999) });
    const project = { ...draft, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const forbiddenKeys = ["overheadPercent", "targetMarginPercent", "trueCostCents", "directCostCents", "loadedLaborRateCents", "materialCostPerUnitCents", "laborCostPerUnitCents", "achievedMargin", "grossProfitCents"];
    for (const mode of ["project-total", "service-totals", "detailed"] as const) {
      const doc = buildCustomerDocumentFromRevision(project, { ...revision, customerDetailMode: mode }, business);
      const serialized = JSON.stringify(doc);
      for (const key of forbiddenKeys) {
        expect(serialized).not.toContain(key);
      }
    }
  });
});

describe("DEF-13 quote-revision behavior: the mode is FROZEN at lock time", () => {
  it("buildQuoteRevision copies the project's current customerDetailMode onto the new revision", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }], customerDetailMode: "service-totals" });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    expect(revision.customerDetailMode).toBe("service-totals");
  });

  it("changing the project's live mode AFTER locking never alters the already-locked revision's own frozen mode", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }], customerDetailMode: "detailed" });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    const projectWithChangedLiveMode = { ...draft, customerDetailMode: "project-total" as const, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    // The REVISION's own frozen mode is what a locked document must use — never the project's live setting.
    expect(revision.customerDetailMode).toBe("detailed");
    const doc = buildCustomerDocumentFromRevision(projectWithChangedLiveMode, revision, business);
    expect(doc.mode).toBe("detailed");
  });

  it("a revision created before DEF-13 (customerDetailMode undefined) defaults to 'detailed', matching the pre-existing qty/unit-only display", () => {
    const draft = baseProject({ serviceLines: [{ id: "l1", assemblyId: "mulch-install", quantity: 8 }] });
    const revision = buildQuoteRevision(draft, [mulchAssembly], materials, [], business);
    const legacyRevision = { ...revision, customerDetailMode: undefined };
    const project = { ...draft, quoteRevisions: [legacyRevision], activeQuoteRevisionId: legacyRevision.id };
    const doc = buildCustomerDocumentFromRevision(project, legacyRevision, business);
    expect(doc.mode).toBe("detailed");
  });
});

describe("DEF-14 business address line joining: no empty punctuation or blank rows", () => {
  it("every field present produces a clean multi-line address", () => {
    const lines = buildBusinessAddressLines({
      businessAddressLine1: "123 Main St",
      businessAddressLine2: "Suite 200",
      businessCity: "Springfield",
      businessStateRegion: "IL",
      businessPostalCode: "62704",
      businessCountry: "USA",
    });
    expect(lines).toEqual(["123 Main St", "Suite 200", "Springfield, IL 62704", "USA"]);
  });

  it("a missing city never produces an orphan leading comma", () => {
    const lines = buildBusinessAddressLines({ businessStateRegion: "IL", businessPostalCode: "62704" });
    expect(lines).toEqual(["IL 62704"]);
    expect(lines.join(" ")).not.toContain(", ,");
    expect(lines.join(" ").startsWith(",")).toBe(false);
  });

  it("no fields set at all produces an empty array, never a line of stray punctuation", () => {
    expect(buildBusinessAddressLines({})).toEqual([]);
  });

  it("an international address with no US-shaped fields (no state, no ZIP-like postal code) still joins cleanly", () => {
    const lines = buildBusinessAddressLines({ businessAddressLine1: "10 Downing Street", businessCity: "London", businessPostalCode: "SW1A 2AA", businessCountry: "United Kingdom" });
    expect(lines).toEqual(["10 Downing Street", "London SW1A 2AA", "United Kingdom"]);
  });

  it("leading zeros in a postal code are preserved exactly (never parsed as a number)", () => {
    const lines = buildBusinessAddressLines({ businessCity: "Boston", businessStateRegion: "MA", businessPostalCode: "02134" });
    expect(lines[0]).toContain("02134");
  });

  it("whitespace-only optional fields are treated as absent, never rendered as a blank line", () => {
    const lines = buildBusinessAddressLines({ businessAddressLine1: "  ", businessCity: "Springfield" });
    expect(lines).toEqual(["Springfield"]);
  });
});
