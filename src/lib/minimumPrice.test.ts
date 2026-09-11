/**
 * LEP-115 — the configured minimum project price must actually be enforced:
 * finalQuoteCents = max(requiredPriceCents, minimumProjectPriceCents). Before
 * this fix, `minimumProjectPriceCents` was stored and used only by the
 * Minimum Job Audit (a decision-support comparison, see evaluateMinimumJob)
 * — nothing ever clamped a real quote to it. These tests exercise the real
 * production pricing pipeline (evaluateProject, buildQuoteRevision) end to
 * end, using the workbook's own exact $438/$500 example as the primary case.
 *
 * "Duplicating an estimate must create a new Draft without inheriting
 * immutable quote history" is not re-tested here — it's already covered by
 * workspaceContext.test.tsx's LEP-127 regression (a duplicate always gets
 * `quoteRevisions: []`), and `configuredMinimumProjectPriceCents` exists
 * ONLY inside a `QuoteRevision` object, so an empty revisions array
 * structurally cannot carry stale minimum-price data forward — there is no
 * additional code path for a new test to catch.
 */
import { describe, expect, it } from "vitest";
import { calculateMargin } from "./calc";
import { buildQuoteRevision, evaluateProject } from "./estimateMath";
import { buildCustomerDocumentFromRevision } from "./customerDocument";
import { ZERO_CENTS, type MoneyCents } from "./money";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { Assembly, BusinessSettings, Material, Project } from "./types";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

// A single flat-cost material and a zero-labor, zero-overhead assembly, so
// directCost === trueCost exactly, with no rounding noise anywhere in the
// chain — isolates the minimum-price mechanism from every other pricing
// concern. $284.70 direct cost at a 35% target margin divides EXACTLY to
// $438.00 (284.70 / 0.65 = 438.00), matching the workbook's own "calculated
// price $438" figure with zero rounding ambiguity.
const flatMaterial: Material = { id: "flat", name: "Flat-rate service", unitCostCents: cents(28470), unit: "each" };
const flatAssembly: Assembly = {
  id: "flat-assembly",
  name: "Flat-Rate Service",
  unit: "each",
  materials: [{ materialId: "flat", quantityPerUnit: 1 }],
  // A nonzero value only to satisfy validation (>0) — every business fixture
  // below sets loadedLaborRateCents to 0, so labor cost is exactly $0
  // regardless of this figure, keeping directCost === the material cost.
  laborInputMode: "person-hours-per-unit",
  laborPersonHoursPerUnit: 1,
  equipment: [],
  otherCostPerUnitCents: ZERO_CENTS,
};

function baseProject(overrides?: Partial<Project>): Project {
  return {
    id: "min-price-proj",
    name: "Minimum Price Job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "draft",
    serviceLines: [{ id: "l1", assemblyId: "flat-assembly", quantity: 1 }],
    equipmentLines: [],
    laborLines: [],
    deliveryCostCents: ZERO_CENTS,
    extraCosts: [],
    overheadPercent: 0,
    targetMarginPercent: 35,
    taxRatePercent: 0,
    quoteRevisions: [],
    ...overrides,
  };
}

function businessWithMinimum(minimumProjectPriceCents: number): BusinessSettings {
  return { ...DEFAULT_BUSINESS_SETTINGS, loadedLaborRateCents: ZERO_CENTS, minimumProjectPriceCents: cents(minimumProjectPriceCents) };
}

describe("LEP-115 — the workbook's exact example: calculated $438, minimum $500, final quote $500", () => {
  const business = businessWithMinimum(50000); // $500.00
  const project = baseProject();

  it("evaluateProject: displayPriceCents is floored to the minimum, and the pre-minimum calculated price is preserved separately", () => {
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(result.preMinimumPriceCents).toBe(43800); // the calculated $438.00, untouched
    expect(result.requiredSellingPriceCents).toBe(43800); // reporting figure agrees
    expect(result.displayPriceCents).toBe(50000); // FINAL quote: $500.00 — max(438, 500)
    expect(result.minimumPriceAppliedCents).toBe(50000); // clearly indicates the floor fired
  });

  it("expected margin is calculated using the FINAL ($500) customer price, not the pre-minimum $438 calculation", () => {
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    // Hand: (500.00 - 284.70) / 500.00 = 215.30 / 500.00 = 0.4306 -> 43.06%,
    // NOT the 35% target margin the $438 calculation was built to hit.
    const expectedMargin = calculateMargin(cents(50000), cents(28470));
    expect(result.expectedMargin).toBe(expectedMargin);
    expect(Number(result.expectedMargin!.toFixed(2))).toBe(43.06);
  });

  it("customerTotalCents (what the customer owes) also uses the final, post-minimum price", () => {
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(result.customerTotalCents).toBe(50000); // no tax configured, so total === price
  });

  it("buildQuoteRevision locks in the exact same $500 final price the live preview showed, never the raw $438 calculation", () => {
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(revision.roundedRecommendedPriceCents).toBe(43800); // calculated required price, frozen
    expect(revision.configuredMinimumProjectPriceCents).toBe(50000); // configured minimum, frozen
    expect(revision.actualQuotedPriceCents).toBe(50000); // FINAL quoted price, frozen
    expect(revision.customerTotalCents).toBe(50000);
  });

  it("the locked revision's achieved margin also uses the final $500 price", () => {
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(Number(revision.achievedMargin!.toFixed(2))).toBe(43.06);
  });

  it("the customer-facing document's total reconciles exactly to the final, minimum-enforced price — never the pre-minimum $438", () => {
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    const projectWithRevision = { ...project, quoteRevisions: [revision], activeQuoteRevisionId: revision.id };
    const doc = buildCustomerDocumentFromRevision(projectWithRevision, revision, business);
    expect(doc.totalCents).toBe(50000);
    expect(doc.subtotalCents).toBe(50000);
  });

  it("never silently quotes below the configured minimum: the final quoted price is always >= the minimum", () => {
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(revision.actualQuotedPriceCents).toBeGreaterThanOrEqual(business.minimumProjectPriceCents);
    const draft = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(draft.displayPriceCents!).toBeGreaterThanOrEqual(business.minimumProjectPriceCents);
  });
});

describe("LEP-115 — freezing: changing the business minimum later never alters an existing revision", () => {
  it("a revision locked at a $500 minimum keeps reading $500 even after the business minimum changes to $1,000 or $0", () => {
    const business500 = businessWithMinimum(50000);
    const project = baseProject();
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business500);
    expect(revision.actualQuotedPriceCents).toBe(50000);
    expect(revision.configuredMinimumProjectPriceCents).toBe(50000);

    // The business's minimum changes twice AFTER the revision was locked —
    // neither change is ever applied retroactively to `revision` itself,
    // since it's a plain, already-returned object nothing re-derives from
    // the (now-different) business settings.
    const businessRaised = businessWithMinimum(100000);
    const businessLowered = businessWithMinimum(0);
    void businessRaised;
    void businessLowered;

    expect(revision.actualQuotedPriceCents).toBe(50000);
    expect(revision.configuredMinimumProjectPriceCents).toBe(50000);
    expect(revision.roundedRecommendedPriceCents).toBe(43800);
  });

  it("re-quoting AFTER the business minimum changed appends a NEW revision reflecting the NEW minimum, while the old revision is untouched", () => {
    const business500 = businessWithMinimum(50000);
    const project = baseProject();
    const firstRevision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business500);
    const projectAfterFirstQuote = { ...project, quoteRevisions: [firstRevision], activeQuoteRevisionId: firstRevision.id };

    const business1000 = businessWithMinimum(100000);
    const secondRevision = buildQuoteRevision(projectAfterFirstQuote, [flatAssembly], [flatMaterial], [], business1000, { reason: "Re-quoted at new minimum" });

    expect(firstRevision.actualQuotedPriceCents).toBe(50000); // untouched
    expect(firstRevision.configuredMinimumProjectPriceCents).toBe(50000); // untouched
    expect(secondRevision.actualQuotedPriceCents).toBe(100000); // reflects the NEW $1,000 minimum
    expect(secondRevision.configuredMinimumProjectPriceCents).toBe(100000);
    expect(secondRevision.previousRevisionId).toBe(firstRevision.id);
  });
});

describe("LEP-115 — edge cases: zero minimum, exact equality, calculated-above-minimum, very large values", () => {
  it("zero minimum: never floors anything — the calculated price passes through unchanged", () => {
    const business = businessWithMinimum(0);
    const project = baseProject();
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(result.displayPriceCents).toBe(43800);
    expect(result.minimumPriceAppliedCents).toBeNull(); // the floor never fired
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(revision.actualQuotedPriceCents).toBe(43800);
    expect(revision.configuredMinimumProjectPriceCents).toBe(0);
  });

  it("exact equality (minimum === calculated price): the calculated price already satisfies the minimum on its own — not reported as 'applied'", () => {
    const business = businessWithMinimum(43800); // exactly the calculated price
    const project = baseProject();
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(result.displayPriceCents).toBe(43800);
    expect(result.minimumPriceAppliedCents).toBeNull(); // max(438,438) — the floor made no difference
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(revision.actualQuotedPriceCents).toBe(43800);
  });

  it("calculated price already ABOVE the minimum: the minimum has no effect at all", () => {
    const business = businessWithMinimum(10000); // $100 — well below the $438 calculation
    const project = baseProject();
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(result.displayPriceCents).toBe(43800);
    expect(result.minimumPriceAppliedCents).toBeNull();
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(revision.actualQuotedPriceCents).toBe(43800);
  });

  it("very large minimum value: floors correctly with no integer overflow or precision loss", () => {
    const business = businessWithMinimum(99999999); // $999,999.99
    const project = baseProject();
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(result.displayPriceCents).toBe(99999999);
    expect(result.minimumPriceAppliedCents).toBe(99999999);
    expect(Number.isSafeInteger(result.displayPriceCents)).toBe(true);
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(revision.actualQuotedPriceCents).toBe(99999999);
    expect(Number.isSafeInteger(revision.actualQuotedPriceCents)).toBe(true);
  });

  it("a very large calculated price that's still below an even larger minimum floors correctly", () => {
    const bigMaterial: Material = { id: "big", name: "Big job", unitCostCents: cents(500000000), unit: "each" }; // $5,000,000.00
    const bigAssembly: Assembly = { ...flatAssembly, id: "big-assembly", materials: [{ materialId: "big", quantityPerUnit: 1 }] };
    const project = baseProject({ serviceLines: [{ id: "l1", assemblyId: "big-assembly", quantity: 1 }] });
    const business = businessWithMinimum(999999999); // $9,999,999.99 minimum
    const result = evaluateProject(project, [bigAssembly], [bigMaterial], [], business);
    // trueCost $5,000,000.00 / 0.65 = $7,692,307.69... which is below the $9,999,999.99 minimum
    expect(result.preMinimumPriceCents).toBeLessThan(999999999);
    expect(result.displayPriceCents).toBe(999999999);
    expect(result.minimumPriceAppliedCents).toBe(999999999);
  });
});

describe("LEP-115 — integer-cent arithmetic is preserved through the minimum-price floor", () => {
  it("a minimum that is not a round dollar amount is applied exactly, in whole cents, no float drift", () => {
    const business = businessWithMinimum(50033); // $500.33 — deliberately not a round dollar figure
    const project = baseProject();
    const result = evaluateProject(project, [flatAssembly], [flatMaterial], [], business);
    expect(result.displayPriceCents).toBe(50033);
    expect(Number.isInteger(result.displayPriceCents)).toBe(true);
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business);
    expect(revision.actualQuotedPriceCents).toBe(50033);
    expect(Number.isInteger(revision.actualQuotedPriceCents)).toBe(true);
    // Margin computed from the exact odd-cent final price, still without drift.
    const margin = calculateMargin(cents(50033), cents(28470));
    expect(result.expectedMargin).toBe(margin);
  });
});

describe("LEP-115 — a manual 'actual price charged' override is a recorded historical fact and is never silently clamped to the minimum", () => {
  it("recording an actual price BELOW the configured minimum stores exactly what was entered, not the minimum", () => {
    const business = businessWithMinimum(50000);
    const project = baseProject();
    // A contractor discounting below their own configured minimum (e.g. a
    // favor, a loyalty discount) — an explicit override must be honored
    // exactly as recorded, never silently bumped up to the minimum, since
    // that would misrepresent what was actually charged.
    const revision = buildQuoteRevision(project, [flatAssembly], [flatMaterial], [], business, {
      actualQuotedPriceOverrideCents: 40000,
      reason: "Recorded actual price charged",
    });
    expect(revision.actualQuotedPriceCents).toBe(40000);
    expect(revision.configuredMinimumProjectPriceCents).toBe(50000); // still frozen/recorded for reference
    expect(revision.roundedRecommendedPriceCents).toBe(43800); // the calculated price is unaffected either
  });
});
