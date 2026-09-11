/**
 * The single allowlisted boundary between the app's internal project/
 * assembly/business data and anything a customer ever sees (DEF-13/LEP-041/
 * 048/136-138). `buildCustomerDocument()` is the ONLY function permitted to
 * read internal cost/rate/overhead/margin fields for this purpose — it
 * returns a plain `CustomerDocument` object containing nothing but
 * already-safe, already-computed customer-facing values. `CustomerEstimateView`
 * renders ONLY from that object and never receives the raw `Project`/
 * `Assembly`/`BusinessSettings` types itself, so there is no CSS-hiding
 * layer standing between internal data and the rendered page — the internal
 * data structurally never reaches the render tree in the first place.
 *
 * Three presentation modes (customerDetailMode) change how much line-level
 * detail is shown; none of them can ever change `totalCents` — every mode
 * reads the exact same already-computed revenue allocation and tax figures.
 */
import { fromDecimalToCents, ZERO_CENTS, type MoneyCents } from "./money";
import { allocateRevenue, rollUpProject } from "./estimateMath";
import { formatUnitLabel } from "./calc";
import type { Assembly, BusinessSettings, CustomerDetailMode, Equipment, Material, Project, QuoteRevision } from "./types";
import Decimal from "decimal.js";

export interface CustomerDocumentLine {
  key: string;
  label: string;
  /** Present only for an itemizable service (assembly) line in "detailed"
   * mode — an ad-hoc labor line, delivery, or extra cost has no natural
   * per-unit quantity a customer would recognize, so those always render as
   * label + amount only, even in "detailed" mode. */
  quantity?: number;
  unit?: string;
  rateCents?: MoneyCents;
  amountCents: MoneyCents;
}

export interface CustomerDocument {
  businessName: string;
  businessLogoDataUrl?: string;
  /** Pre-joined, blank-safe lines — never an empty string, a stray comma, or
   * a line that's just whitespace. Empty array when no address fields are
   * set at all. */
  businessAddressLines: string[];
  businessPhone?: string;
  businessEmail?: string;
  businessWebsite?: string;
  businessLicenseNumber?: string;
  customerName: string;
  projectName: string;
  dateLabel: string;
  notes?: string;
  mode: CustomerDetailMode;
  /** Empty in "project-total" mode — the document shows only the project
   * name/description and the final price, no breakdown at all. */
  lines: CustomerDocumentLine[];
  subtotalCents: MoneyCents;
  taxAmountCents: MoneyCents;
  totalCents: MoneyCents;
}

function nonEmpty(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Joins a business's address fields into clean, punctuation-safe display
 * lines — no US-only shape assumed (state/postal/country are free text), and
 * never an orphan comma or a blank line for a field the contractor hasn't
 * filled in yet. */
export function buildBusinessAddressLines(business: Pick<BusinessSettings, "businessAddressLine1" | "businessAddressLine2" | "businessCity" | "businessStateRegion" | "businessPostalCode" | "businessCountry">): string[] {
  const lines: string[] = [];
  const line1 = nonEmpty(business.businessAddressLine1);
  const line2 = nonEmpty(business.businessAddressLine2);
  if (line1) lines.push(line1);
  if (line2) lines.push(line2);

  const city = nonEmpty(business.businessCity);
  const state = nonEmpty(business.businessStateRegion);
  const postal = nonEmpty(business.businessPostalCode);
  const cityState = [city, state].filter((v): v is string => Boolean(v)).join(", ");
  const cityStateLine = [cityState, postal].filter((v): v is string => Boolean(v)).join(" ").trim();
  if (cityStateLine) lines.push(cityStateLine);

  const country = nonEmpty(business.businessCountry);
  if (country) lines.push(country);

  return lines;
}

function formatDateLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Builds the allowlisted customer document for a LOCKED quote revision —
 * every figure comes from the revision's own frozen fields, so this never
 * touches the live catalog and can never drift from what was actually
 * quoted. The revision's OWN customerDetailMode is used (frozen at lock
 * time), never the project's possibly-since-changed live setting. */
export function buildCustomerDocumentFromRevision(project: Project, revision: QuoteRevision, business: BusinessSettings): CustomerDocument {
  const mode: CustomerDetailMode = revision.customerDetailMode ?? "detailed";
  const allocationByKey = new Map(revision.revenueAllocation.map((a) => [a.key, a]));

  const lines: CustomerDocumentLine[] = [];
  if (mode !== "project-total") {
    revision.serviceLines.forEach((line, i) => {
      const allocated = allocationByKey.get(`service:${i}`);
      const amountCents = allocated?.allocatedSellingPriceCents ?? ZERO_CENTS;
      const entry: CustomerDocumentLine = { key: `service:${i}`, label: line.assemblyName, amountCents };
      if (mode === "detailed" && line.quantity > 0) {
        entry.quantity = line.quantity;
        entry.unit = formatUnitLabel(line.unit);
        entry.rateCents = fromDecimalToCents(new Decimal(amountCents).dividedBy(line.quantity));
      }
      lines.push(entry);
    });
    revision.laborLines.forEach((line, i) => {
      const allocated = allocationByKey.get(`labor:${i}`);
      lines.push({ key: `labor:${i}`, label: line.label, amountCents: allocated?.allocatedSellingPriceCents ?? ZERO_CENTS });
    });
    revision.extraCosts.forEach((extra, i) => {
      const allocated = allocationByKey.get(`extra:${i}`);
      lines.push({ key: `extra:${i}`, label: extra.label, amountCents: allocated?.allocatedSellingPriceCents ?? ZERO_CENTS });
    });
    // rollUpProject/buildQuoteRevision always produce a "delivery" revenue
    // row (even at $0), so its mere presence in the allocation map can't be
    // the gate — only a genuinely non-zero delivery cost should ever show
    // this line to the customer, matching the pre-existing behavior.
    if (revision.deliveryCostCents > 0) {
      const deliveryAllocated = allocationByKey.get("delivery");
      lines.push({ key: "delivery", label: "Delivery", amountCents: deliveryAllocated?.allocatedSellingPriceCents ?? ZERO_CENTS });
    }
  }

  return {
    businessName: business.businessName || "Your Business Name",
    businessLogoDataUrl: business.businessLogoDataUrl,
    businessAddressLines: buildBusinessAddressLines(business),
    businessPhone: nonEmpty(business.businessPhone),
    businessEmail: nonEmpty(business.businessEmail),
    businessWebsite: nonEmpty(business.businessWebsite),
    businessLicenseNumber: nonEmpty(business.businessLicenseNumber),
    customerName: project.customerName || "—",
    projectName: project.name,
    dateLabel: formatDateLabel(project.updatedAt),
    notes: nonEmpty(project.notes),
    mode,
    lines,
    subtotalCents: revision.actualQuotedPriceCents,
    taxAmountCents: revision.taxAmountCents,
    totalCents: revision.customerTotalCents,
  };
}

/** Builds the allowlisted customer document for a LIVE DRAFT preview (no
 * locked revision yet) — reprices against the CURRENT catalog, exactly the
 * same way the live "Estimate summary" panel does, using the project's own
 * live customerDetailMode setting. */
export function buildCustomerDocumentFromDraft(
  project: Project,
  assemblies: Assembly[],
  materials: Material[],
  equipment: Equipment[],
  business: BusinessSettings,
  displayPriceCents: MoneyCents,
  taxAmountCents: MoneyCents,
  customerTotalCents: MoneyCents
): CustomerDocument {
  const mode: CustomerDetailMode = project.customerDetailMode ?? "detailed";
  const rollup = rollUpProject(project, assemblies, materials, equipment, business.loadedLaborRateCents, 0);

  let allocationByKey = new Map<string, MoneyCents>();
  if (mode !== "project-total") {
    try {
      const allocation = allocateRevenue(displayPriceCents, rollup.revenueRows);
      allocationByKey = new Map(allocation.map((a) => [a.key, a.allocatedSellingPriceCents]));
    } catch {
      // Every line has zero direct cost — nothing to allocate proportionally
      // yet (e.g. a brand-new project with only a $0 placeholder line).
      // Fall through with an empty allocation map; every line below then
      // shows $0.00 rather than crashing a live preview.
    }
  }

  const lines: CustomerDocumentLine[] = [];
  if (mode !== "project-total") {
    rollup.resolvedServiceLines.forEach((resolved, i) => {
      if (!resolved.assembly) return;
      const amountCents = allocationByKey.get(`service:${i}`) ?? ZERO_CENTS;
      const entry: CustomerDocumentLine = { key: `service:${i}`, label: resolved.assembly.name, amountCents };
      if (mode === "detailed" && resolved.quantity > 0) {
        entry.quantity = resolved.quantity;
        entry.unit = formatUnitLabel(resolved.assembly.unit);
        entry.rateCents = fromDecimalToCents(new Decimal(amountCents).dividedBy(resolved.quantity));
      }
      lines.push(entry);
    });
    rollup.resolvedLaborLines.forEach((resolved, i) => {
      lines.push({ key: `labor:${i}`, label: resolved.label, amountCents: allocationByKey.get(`labor:${i}`) ?? ZERO_CENTS });
    });
    project.extraCosts.forEach((extra, i) => {
      lines.push({ key: `extra:${i}`, label: extra.label, amountCents: allocationByKey.get(`extra:${i}`) ?? ZERO_CENTS });
    });
    if (project.deliveryCostCents > 0) {
      lines.push({ key: "delivery", label: "Delivery", amountCents: allocationByKey.get("delivery") ?? ZERO_CENTS });
    }
  }

  return {
    businessName: business.businessName || "Your Business Name",
    businessLogoDataUrl: business.businessLogoDataUrl,
    businessAddressLines: buildBusinessAddressLines(business),
    businessPhone: nonEmpty(business.businessPhone),
    businessEmail: nonEmpty(business.businessEmail),
    businessWebsite: nonEmpty(business.businessWebsite),
    businessLicenseNumber: nonEmpty(business.businessLicenseNumber),
    customerName: project.customerName || "—",
    projectName: project.name,
    dateLabel: formatDateLabel(project.updatedAt),
    notes: nonEmpty(project.notes),
    mode,
    lines,
    subtotalCents: displayPriceCents,
    taxAmountCents,
    totalCents: customerTotalCents,
  };
}
