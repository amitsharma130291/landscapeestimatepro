export const SITE_NAME = "Landscape Estimate Pro";
export const SITE_URL = "https://landscapeestimatepro.com";
export const PRICE_USD = 99;
export const PRICE_DISPLAY = "$99";

export const NAV_ITEMS = [
  { label: "Free Calculator", href: "/landscaping-cost-calculator/" },
  { label: "Estimate Template", href: "/landscaping-estimate-template/" },
  { label: "Features", href: "/#pro-features" },
  { label: "Pricing", href: "/pricing/" },
  { label: "Resources", href: "/resources/" },
] as const;

export interface ToolLink {
  label: string;
  href: string;
  description: string;
  eyebrow: string;
}

export const TOOL_LINKS: ToolLink[] = [
  {
    eyebrow: "Free tool",
    label: "Landscaping Cost Calculator",
    href: "/landscaping-cost-calculator/",
    description: "Build a fast, honest price from materials, labor, equipment, overhead and margin.",
  },
  {
    eyebrow: "Free tool",
    label: "Landscaping Estimate Calculator",
    href: "/landscaping-estimate-calculator/",
    description: "Turn one project's numbers into a true cost and a required selling price.",
  },
  {
    eyebrow: "Free template",
    label: "Landscaping Estimate Template",
    href: "/landscaping-estimate-template/",
    description: "A clean, customer-ready estimate you can fill in, print, or save as PDF.",
  },
  {
    eyebrow: "Free template",
    label: "Landscaping Quote Template",
    href: "/landscaping-quote-template/",
    description: "A customer-facing quote layout for sending a price before the job is booked.",
  },
  {
    eyebrow: "Free template",
    label: "Landscaping Invoice Template",
    href: "/landscaping-invoice-template/",
    description: "Bill a completed job with a simple, itemized invoice — no accounting software required.",
  },
  {
    eyebrow: "Free tool",
    label: "Landscaping Price List",
    href: "/landscaping-price-list/",
    description: "Build a per-service price book, then check whether those prices actually hit your margin.",
  },
  {
    eyebrow: "Guide",
    label: "Landscape Pricing Guide",
    href: "/landscape-pricing-guide/",
    description: "How labor, materials, overhead, and margin combine into a price that protects your business.",
  },
];
