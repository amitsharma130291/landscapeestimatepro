import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CustomerEstimateView from "./CustomerEstimateView";
import { buildCustomerDocumentFromDraft } from "../../lib/customerDocument";
import { DEFAULT_BUSINESS_SETTINGS, type Assembly, type BusinessSettings, type Project } from "../../lib/types";
import type { MoneyCents } from "../../lib/money";

afterEach(() => {
  cleanup();
});

function makeAssembly(overrides: Partial<Assembly> = {}): Assembly {
  return {
    id: "assembly-1",
    name: "Mulch install",
    unit: "yd3",
    materials: [],
    laborInputMode: "person-hours-per-unit",
    laborPersonHoursPerUnit: 0.5,
    equipment: [],
    otherCostPerUnitCents: 0 as MoneyCents,
    ...overrides,
  };
}

function makeBusiness(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    businessName: "Evergreen Lawns",
    loadedLaborRateCents: 4500 as MoneyCents,
    overheadPercent: 22,
    targetMarginPercent: 40,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Backyard refresh",
    customerName: "Jane Doe",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    status: "sent",
    serviceLines: [{ id: "line-1", assemblyId: "assembly-1", quantity: 8, taxable: true }],
    equipmentLines: [],
    laborLines: [],
    deliveryCostCents: 0 as MoneyCents,
    extraCosts: [],
    overheadPercent: 22,
    targetMarginPercent: 40,
    taxRatePercent: 0,
    quoteRevisions: [],
    ...overrides,
  };
}

/** Renders the real component from a real `buildCustomerDocumentFromDraft()`
 * call — proving the actual allowlist boundary function, not a hand-built
 * stand-in `doc` object. */
function renderCustomerView(opts: {
  business?: Partial<BusinessSettings>;
  project?: Partial<Project>;
  assemblies?: Assembly[];
  displayPriceCents?: MoneyCents;
  taxAmountCents?: MoneyCents;
  customerTotalCents?: MoneyCents;
}) {
  const business = makeBusiness(opts.business);
  const project = makeProject(opts.project);
  const assemblies = opts.assemblies ?? [makeAssembly()];
  const displayPriceCents = opts.displayPriceCents ?? (50000 as MoneyCents);
  const taxAmountCents = opts.taxAmountCents ?? (0 as MoneyCents);
  const customerTotalCents = opts.customerTotalCents ?? displayPriceCents;
  const doc = buildCustomerDocumentFromDraft(project, assemblies, [], [], business, displayPriceCents, taxAmountCents, customerTotalCents);
  return render(<CustomerEstimateView doc={doc} />);
}

describe("CustomerEstimateView — internal cost/margin leakage", () => {
  it("never renders the business's loaded labor rate, overhead %, or target margin %", () => {
    const { container } = renderCustomerView({ business: { loadedLaborRateCents: 7777 as MoneyCents, overheadPercent: 33, targetMarginPercent: 47 } });
    const text = container.textContent ?? "";
    expect(text).not.toContain("77.77");
    expect(text).not.toContain("33%");
    expect(text).not.toContain("47%");
    expect(text).not.toMatch(/overhead/i);
    expect(text).not.toMatch(/margin/i);
    expect(text).not.toMatch(/true (job )?cost/i);
    expect(text).not.toMatch(/direct cost/i);
  });

  it("never renders an assembly's per-unit cost fields, even when populated", () => {
    const assembly = makeAssembly({ otherCostPerUnitCents: 999 as MoneyCents, currentRateCents: 12345 as MoneyCents, laborPersonHoursPerUnit: 1.75 });
    const { container } = renderCustomerView({ assemblies: [assembly] });
    const text = container.textContent ?? "";
    expect(text).not.toContain("9.99");
    expect(text).not.toContain("123.45");
    expect(text).not.toContain("1.75");
  });

  it("shows ad-hoc labor lines and extra costs by label + customer-facing allocated amount only — never their internal rate, hours, or crew size", () => {
    renderCustomerView({
      project: {
        laborLines: [{ id: "labor-1", label: "Site cleanup crew", mode: "crew-duration", crewSize: 3, elapsedHours: 6, loadedRateCents: 8800 as MoneyCents }],
        extraCosts: [{ id: "extra-1", label: "Permit fee", amountCents: 15000 as MoneyCents }],
      },
    });
    expect(screen.getByText("Site cleanup crew")).toBeInTheDocument();
    expect(screen.getByText("Permit fee")).toBeInTheDocument();
    // The INTERNAL cost inputs behind those lines must never render — the
    // $88.00 loaded rate, the 3-person crew size, and the 6-hour duration.
    expect(screen.queryByText(/88\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b3\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b6\b/)).not.toBeInTheDocument();
  });

  it("shows the delivery line by label with only its customer-facing allocated amount, never its internal cost input", () => {
    renderCustomerView({ project: { deliveryCostCents: 12000 as MoneyCents } });
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    // $120.00 is the INTERNAL delivery cost input — never shown; whatever
    // customer-facing allocated amount appears is a DIFFERENT, already-safe
    // number derived from the total, not this raw internal figure.
    expect(screen.queryByText("$120.00")).not.toBeInTheDocument();
  });
});

describe("CustomerEstimateView — required customer-facing fields", () => {
  it("shows business name, customer name, project name, service description/quantity, and total", () => {
    renderCustomerView({
      business: { businessName: "Evergreen Lawns" },
      project: { customerName: "Jane Doe", name: "Backyard refresh" },
      assemblies: [makeAssembly({ name: "Mulch install" })],
      customerTotalCents: 50000 as MoneyCents,
    });
    expect(screen.getByText("Evergreen Lawns")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Backyard refresh")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && (el?.textContent ?? "").startsWith("Mulch install") && el.className.includes("font-medium"))).toBeInTheDocument();
    expect(screen.getAllByText("$500.00").length).toBeGreaterThan(0);
  });

  it("shows notes/terms when present, preserving line breaks", () => {
    renderCustomerView({ project: { notes: "Line one\nLine two" } });
    const notes = screen.getByText((_, el) => el?.textContent === "Line one\nLine two");
    expect(notes).toBeInTheDocument();
    expect(notes.className).toMatch(/whitespace-pre-wrap/);
  });

  it("omits notes entirely when absent", () => {
    renderCustomerView({ project: { notes: undefined } });
    expect(screen.queryByText(/notes/i)).not.toBeInTheDocument();
  });
});

describe("CustomerEstimateView — tax scenarios", () => {
  it("zero tax: shows no subtotal/tax breakdown, and total equals the pre-tax price", () => {
    renderCustomerView({ project: { taxRatePercent: 0 }, taxAmountCents: 0 as MoneyCents, customerTotalCents: 50000 as MoneyCents });
    expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
    expect(screen.queryByText("Sales tax")).not.toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("$500.00")[0]).toBeInTheDocument();
  });

  it("mixed/partial tax: shows subtotal, tax, and a total that is subtotal + tax", () => {
    renderCustomerView({
      project: {
        taxRatePercent: 7,
        serviceLines: [
          { id: "line-1", assemblyId: "assembly-1", quantity: 8, taxable: true },
          { id: "line-2", assemblyId: "assembly-1", quantity: 2, taxable: false },
        ],
      },
      taxAmountCents: 2100 as MoneyCents,
      customerTotalCents: 52100 as MoneyCents,
    });
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getAllByText("$500.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Sales tax")).toBeInTheDocument();
    expect(screen.getByText("$21.00")).toBeInTheDocument();
    expect(screen.getByText("$521.00")).toBeInTheDocument();
  });
});

describe("CustomerEstimateView — price override", () => {
  it("renders the exact totals passed in, even when they diverge from what the line items alone would imply (a manually overridden quote)", () => {
    renderCustomerView({ displayPriceCents: 61234 as MoneyCents, taxAmountCents: 0 as MoneyCents, customerTotalCents: 61234 as MoneyCents });
    expect(screen.getAllByText("$612.34")[0]).toBeInTheDocument();
  });
});

describe("CustomerEstimateView — long content and special characters", () => {
  it("wraps an unusually long business name instead of clipping it", () => {
    const longName = "Evergreen Premium Landscaping, Hardscaping & Full-Service Property Maintenance Solutions LLC";
    renderCustomerView({ business: { businessName: longName } });
    const el = screen.getByText(longName);
    expect(el.className).toMatch(/break-words/);
    expect(el.className).not.toMatch(/truncate/);
  });

  it("wraps a long customer name, project name, and service description instead of clipping", () => {
    const longCustomer = "Alexandria Featherstonhaugh-Worthington of the Riverside Estates Homeowners Association";
    const longProject = "Complete front and back yard hardscape, drainage, and irrigation overhaul — phase one of three";
    const longAssemblyName = "Full-depth triple-ground hardwood mulch installation with pre-emergent weed barrier and edging";

    renderCustomerView({ project: { customerName: longCustomer, name: longProject }, assemblies: [makeAssembly({ name: longAssemblyName })] });
    expect(screen.getByText(longCustomer).className).toMatch(/break-words/);
    expect(screen.getByText(longProject).className).toMatch(/break-words/);
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && (el?.textContent ?? "").startsWith(longAssemblyName) && el.className.includes("font-medium")).className).toMatch(/break-words/);
  });

  it("renders apostrophes, ampersands, and quotes literally as text, with no HTML injection", () => {
    const businessName = `O'Brien & Sons "Premium" Landscaping`;
    const customerName = `<img src=x onerror=alert(1)>Mary O'Malley`;
    const assemblyName = `Mulch & Edging — "deluxe" package`;

    const { container } = renderCustomerView({ business: { businessName }, project: { customerName }, assemblies: [makeAssembly({ name: assemblyName })] });

    expect(screen.getByText(businessName)).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && (el?.textContent ?? "").startsWith(assemblyName) && el.className.includes("font-medium"))).toBeInTheDocument();
    // The malicious-looking string renders as literal text, not a real <img> element.
    expect(container.querySelectorAll("img[src='x']").length).toBe(0);
    expect(container.textContent).toContain(customerName);
  });
});

describe("CustomerEstimateView — page-break resilience", () => {
  it("renders many line items across multiple line-item categories without error (multi-page estimate)", () => {
    const assemblies: Assembly[] = Array.from({ length: 30 }, (_, i) => makeAssembly({ id: `a${i}`, name: `Service ${i}` }));
    renderCustomerView({
      assemblies,
      project: {
        serviceLines: assemblies.map((a, i) => ({ id: `line-${i}`, assemblyId: a.id, quantity: i + 1, taxable: true })),
        laborLines: [{ id: "labor-1", label: "Extra crew day", mode: "crew-duration", crewSize: 2, elapsedHours: 8, loadedRateCents: 5000 as MoneyCents }],
        extraCosts: [{ id: "extra-1", label: "Disposal fee", amountCents: 5000 as MoneyCents }],
        deliveryCostCents: 10000 as MoneyCents,
      },
      displayPriceCents: 500000 as MoneyCents,
    });

    expect(screen.getByText("Service 0")).toBeInTheDocument();
    expect(screen.getByText("Service 29")).toBeInTheDocument();
    expect(screen.getByText("Extra crew day")).toBeInTheDocument();
    expect(screen.getByText("Disposal fee")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
  });

  it("marks each line item, the header, notes, and the total box to avoid breaking mid-element when printed", () => {
    const { container } = renderCustomerView({ project: { notes: "Thanks for your business!" } });
    const listItems = container.querySelectorAll("li");
    expect(listItems.length).toBeGreaterThan(0);
    listItems.forEach((li) => {
      if (li.textContent === "No services added yet.") return;
      expect(li.className).toMatch(/print:break-inside-avoid/);
    });
    const total = screen.getByText("Total").closest("div");
    expect(total?.className).toMatch(/print:break-inside-avoid/);
  });
});
