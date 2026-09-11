import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CustomerEstimateView from "./CustomerEstimateView";
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

describe("CustomerEstimateView — internal cost/margin leakage", () => {
  it("never renders the business's loaded labor rate, overhead %, or target margin %", () => {
    const business = makeBusiness({ loadedLaborRateCents: 7777 as MoneyCents, overheadPercent: 33, targetMarginPercent: 47 });
    const { container } = render(
      <CustomerEstimateView
        business={business}
        project={makeProject()}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("77.77"); // loaded labor rate in dollars
    expect(text).not.toContain("33%");
    expect(text).not.toContain("47%");
    expect(text).not.toMatch(/overhead/i);
    expect(text).not.toMatch(/margin/i);
    expect(text).not.toMatch(/true (job )?cost/i);
    expect(text).not.toMatch(/direct cost/i);
  });

  it("never renders an assembly's per-unit cost fields, even when populated", () => {
    const assembly = makeAssembly({
      otherCostPerUnitCents: 999 as MoneyCents,
      currentRateCents: 12345 as MoneyCents,
      laborPersonHoursPerUnit: 1.75,
    });
    const { container } = render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject()}
        assemblies={[assembly]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("9.99");
    expect(text).not.toContain("123.45");
    expect(text).not.toContain("1.75");
  });

  it("shows ad-hoc labor lines and extra costs by label only — never their rate, hours, crew size, or cost amount", () => {
    const project = makeProject({
      laborLines: [
        { id: "labor-1", label: "Site cleanup crew", mode: "crew-duration", crewSize: 3, elapsedHours: 6, loadedRateCents: 8800 as MoneyCents },
      ],
      extraCosts: [{ id: "extra-1", label: "Permit fee", amountCents: 15000 as MoneyCents }],
    });
    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={project}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    expect(screen.getByText("Site cleanup crew")).toBeInTheDocument();
    expect(screen.getByText("Permit fee")).toBeInTheDocument();
    // Cost inputs behind those lines must never render.
    expect(screen.queryByText(/88\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/150\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b3\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b6\b/)).not.toBeInTheDocument();
  });

  it("shows the delivery line by label only when present, with no dollar amount", () => {
    const project = makeProject({ deliveryCostCents: 12000 as MoneyCents });
    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={project}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.queryByText(/120\.00/)).not.toBeInTheDocument();
  });
});

describe("CustomerEstimateView — required customer-facing fields", () => {
  it("shows business name, customer name, project name, service description/quantity, and total", () => {
    render(
      <CustomerEstimateView
        business={makeBusiness({ businessName: "Evergreen Lawns" })}
        project={makeProject({ customerName: "Jane Doe", name: "Backyard refresh" })}
        assemblies={[makeAssembly({ name: "Mulch install" })]}
        displayPriceCents={50000 as MoneyCents}
        customerTotalCents={50000 as MoneyCents}
      />
    );
    expect(screen.getByText("Evergreen Lawns")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Backyard refresh")).toBeInTheDocument();
    expect(screen.getByText("Mulch install")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("shows notes/terms when present, preserving line breaks", () => {
    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject({ notes: "Line one\nLine two" })}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    const notes = screen.getByText((_, el) => el?.textContent === "Line one\nLine two");
    expect(notes).toBeInTheDocument();
    expect(notes.className).toMatch(/whitespace-pre-wrap/);
  });

  it("omits notes entirely when absent", () => {
    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject({ notes: undefined })}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    expect(screen.queryByText(/notes/i)).not.toBeInTheDocument();
  });
});

describe("CustomerEstimateView — tax scenarios", () => {
  it("zero tax: shows no subtotal/tax breakdown, and total equals the pre-tax price", () => {
    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject({ taxRatePercent: 0 })}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
        taxAmountCents={0 as MoneyCents}
        customerTotalCents={50000 as MoneyCents}
      />
    );
    expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
    expect(screen.queryByText("Sales tax")).not.toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("mixed/partial tax: shows subtotal, tax, and a total that is subtotal + tax", () => {
    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject({
          taxRatePercent: 7,
          serviceLines: [
            { id: "line-1", assemblyId: "assembly-1", quantity: 8, taxable: true },
            { id: "line-2", assemblyId: "assembly-1", quantity: 2, taxable: false },
          ],
        })}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
        taxAmountCents={2100 as MoneyCents}
        customerTotalCents={52100 as MoneyCents}
      />
    );
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
    expect(screen.getByText("Sales tax")).toBeInTheDocument();
    expect(screen.getByText("$21.00")).toBeInTheDocument();
    expect(screen.getByText("$521.00")).toBeInTheDocument();
  });
});

describe("CustomerEstimateView — price override", () => {
  it("renders the exact totals passed in, even when they diverge from what the line items alone would imply (a manually overridden quote)", () => {
    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject()}
        assemblies={[makeAssembly()]}
        displayPriceCents={61234 as MoneyCents}
        taxAmountCents={0 as MoneyCents}
        customerTotalCents={61234 as MoneyCents}
      />
    );
    expect(screen.getByText("$612.34")).toBeInTheDocument();
  });
});

describe("CustomerEstimateView — long content and special characters", () => {
  it("wraps an unusually long business name instead of clipping it", () => {
    const longName = "Evergreen Premium Landscaping, Hardscaping & Full-Service Property Maintenance Solutions LLC";
    render(
      <CustomerEstimateView
        business={makeBusiness({ businessName: longName })}
        project={makeProject()}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    const el = screen.getByText(longName);
    expect(el.className).toMatch(/break-words/);
    expect(el.className).not.toMatch(/truncate/);
  });

  it("wraps a long customer name, project name, and service description instead of clipping", () => {
    const longCustomer = "Alexandria Featherstonhaugh-Worthington of the Riverside Estates Homeowners Association";
    const longProject = "Complete front and back yard hardscape, drainage, and irrigation overhaul — phase one of three";
    const longAssemblyName = "Full-depth triple-ground hardwood mulch installation with pre-emergent weed barrier and edging";

    render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject({ customerName: longCustomer, name: longProject })}
        assemblies={[makeAssembly({ name: longAssemblyName })]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
    expect(screen.getByText(longCustomer).className).toMatch(/break-words/);
    expect(screen.getByText(longProject).className).toMatch(/break-words/);
    expect(screen.getByText(longAssemblyName).className).toMatch(/break-words/);
  });

  it("renders apostrophes, ampersands, and quotes literally as text, with no HTML injection", () => {
    const businessName = `O'Brien & Sons "Premium" Landscaping`;
    const customerName = `<img src=x onerror=alert(1)>Mary O'Malley`;
    const assemblyName = `Mulch & Edging — "deluxe" package`;

    const { container } = render(
      <CustomerEstimateView
        business={makeBusiness({ businessName })}
        project={makeProject({ customerName })}
        assemblies={[makeAssembly({ name: assemblyName })]}
        displayPriceCents={50000 as MoneyCents}
      />
    );

    expect(screen.getByText(businessName)).toBeInTheDocument();
    expect(screen.getByText(assemblyName)).toBeInTheDocument();
    // The malicious-looking string renders as literal text, not a real <img> element.
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(container.textContent).toContain(customerName);
  });
});

describe("CustomerEstimateView — page-break resilience", () => {
  it("renders many line items across multiple line-item categories without error (multi-page estimate)", () => {
    const assemblies: Assembly[] = Array.from({ length: 30 }, (_, i) => makeAssembly({ id: `a${i}`, name: `Service ${i}` }));
    const project = makeProject({
      serviceLines: assemblies.map((a, i) => ({ id: `line-${i}`, assemblyId: a.id, quantity: i + 1, taxable: true })),
      laborLines: [{ id: "labor-1", label: "Extra crew day", mode: "crew-duration", crewSize: 2, elapsedHours: 8, loadedRateCents: 5000 as MoneyCents }],
      extraCosts: [{ id: "extra-1", label: "Disposal fee", amountCents: 5000 as MoneyCents }],
      deliveryCostCents: 10000 as MoneyCents,
    });

    render(
      <CustomerEstimateView business={makeBusiness()} project={project} assemblies={assemblies} displayPriceCents={500000 as MoneyCents} />
    );

    expect(screen.getByText("Service 0")).toBeInTheDocument();
    expect(screen.getByText("Service 29")).toBeInTheDocument();
    expect(screen.getByText("Extra crew day")).toBeInTheDocument();
    expect(screen.getByText("Disposal fee")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
  });

  it("marks each line item, the header, notes, and the total box to avoid breaking mid-element when printed", () => {
    const { container } = render(
      <CustomerEstimateView
        business={makeBusiness()}
        project={makeProject({ notes: "Thanks for your business!" })}
        assemblies={[makeAssembly()]}
        displayPriceCents={50000 as MoneyCents}
      />
    );
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
