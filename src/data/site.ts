import { SALES_CONFIG } from "./salesConfig";

export const SITE_NAME = "Landscape Estimate Pro";
export const SITE_URL = "https://landscapeestimatepro.com";
// Derived from the one source of truth (salesConfig.ts) so every page/CTA/
// structured-data block that mentions price agrees with it automatically.
export const PRICE_USD = SALES_CONFIG.plannedLifetimePriceCents / 100;
export const PRICE_DISPLAY = `$${PRICE_USD}`;
// The struck-through "regular" price, shown next to PRICE_DISPLAY while a
// real launch discount is active — null (and LAUNCH_PRICE_ACTIVE false)
// once SALES_CONFIG.originalPriceCents is cleared back to null.
export const ORIGINAL_PRICE_USD = SALES_CONFIG.originalPriceCents !== null ? SALES_CONFIG.originalPriceCents / 100 : null;
export const ORIGINAL_PRICE_DISPLAY = ORIGINAL_PRICE_USD !== null ? `$${ORIGINAL_PRICE_USD}` : null;
export const LAUNCH_PRICE_ACTIVE = ORIGINAL_PRICE_USD !== null && ORIGINAL_PRICE_USD > PRICE_USD;
export const PRO_CTA_LABEL = SALES_CONFIG.salesEnabled ? `Explore Pro — ${PRICE_DISPLAY} lifetime` : "Explore Pro features";

export const NAV_ITEMS = [
  { label: "Free Calculator", href: "/landscaping-cost-calculator/" },
  { label: "Estimate Template", href: "/landscaping-estimate-template/" },
  { label: "Estimating Software", href: "/landscaping-estimating-software/" },
  { label: "Pricing", href: "/pricing/" },
  { label: "Resources", href: "/resources/" },
] as const;

export interface ToolLink {
  category: "calculators" | "templates" | "guides";
  label: string;
  href: string;
  description: string;
  eyebrow: string;
}

export const TOOL_LINKS: ToolLink[] = [
  {
    category: "calculators",
    eyebrow: "Free tool",
    label: "Landscaping Cost Calculator",
    href: "/landscaping-cost-calculator/",
    description: "Build a fast, honest price from materials, labor, equipment, overhead and margin.",
  },
  {
    category: "calculators",
    eyebrow: "Free tool",
    label: "Landscaping Estimate Calculator",
    href: "/landscaping-estimate-calculator/",
    description: "Turn one project's numbers into a true cost and a required selling price.",
  },
  {
    category: "templates",
    eyebrow: "Free template",
    label: "Landscaping Estimate Template",
    href: "/landscaping-estimate-template/",
    description: "A clean, customer-ready estimate you can fill in, print, or save as PDF.",
  },
  {
    category: "templates",
    eyebrow: "Free template",
    label: "Landscaping Quote Template",
    href: "/landscaping-quote-template/",
    description: "A customer-facing quote layout for sending a price before the job is booked.",
  },
  {
    category: "templates",
    eyebrow: "Free template",
    label: "Landscaping Invoice Template",
    href: "/landscaping-invoice-template/",
    description: "Bill a completed job with a simple, itemized invoice — no accounting software required.",
  },
  {
    category: "calculators",
    eyebrow: "Free tool",
    label: "Landscaping Price List",
    href: "/landscaping-price-list/",
    description: "Organize service rates and a minimum project price into a printable price book.",
  },
  {
    category: "guides",
    eyebrow: "Guide",
    label: "Landscape Pricing Guide",
    href: "/landscape-pricing-guide/",
    description: "How labor, materials, overhead, and margin combine into a price that protects your business.",
  },
  { category: "calculators", eyebrow: "Job review", label: "Landscape Job Cost Calculator", href: "/landscape-job-cost-calculator/", description: "Compare budget with actual job costs and see where profit changed." },
  { category: "calculators", eyebrow: "Profit check", label: "Landscape Profit Margin Calculator", href: "/landscape-profit-margin-calculator/", description: "Check margin versus markup and solve for your target selling price." },
  { category: "calculators", eyebrow: "Material calculator", label: "Mulch Cost Calculator", href: "/mulch-cost-calculator/", description: "Calculate cubic yards, whole bags, bulk delivery, and installation pricing." },
  { category: "calculators", eyebrow: "Material calculator", label: "Topsoil Cost Calculator", href: "/topsoil-cost-calculator/", description: "Compare soil volume and supplier-density weight, with delivery and spreading costs." },
  { category: "calculators", eyebrow: "Crew calculator", label: "Landscape Labor Cost Calculator", href: "/landscape-labor-cost-calculator/", description: "Calculate loaded wages, paid person-hours, and crew cost including travel." },
  { category: "guides", eyebrow: "Guide", label: "Calculation Methods & Examples", href: "/calculation-methodology/", description: "Check formulas, units, and rounding rules, and reproduce an illustrative job-cost review." },
];
