import { DEFAULT_BUSINESS_SETTINGS, type Workspace } from "./types";

export interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  /** True for steps whose "not done" default (a valid business choice, like
   * 0% sales tax) is indistinguishable from "never looked at it" — the user
   * can manually confirm these instead of being forced to change the value. */
  confirmable: boolean;
}

/**
 * Real workspace data only — no separate "onboarding complete" flag that
 * could drift from what's actually in the workspace. A step counts as done
 * when the underlying business setting no longer matches the seeded default
 * (so we never claim the user "set" a value they never touched), when real
 * catalog/estimate data exists, or — for the two settings where the default
 * is itself a legitimate choice (no sales tax, no rounding) — when the user
 * has explicitly confirmed it via `confirmedStepIds`.
 */
export function deriveFirstRunChecklist(workspace: Workspace, confirmedStepIds: ReadonlySet<string>): ChecklistStep[] {
  const { business, materials, equipment, assemblies, projects } = workspace;
  const steps: ChecklistStep[] = [
    {
      id: "business-details",
      label: "Add your business details",
      description: "Your business name (and logo, if you add one) appears on every customer estimate you print or export.",
      done: Boolean(business.businessName?.trim()),
      href: "/app/settings/",
      confirmable: false,
    },
    {
      id: "loaded-labor-rate",
      label: "Set your loaded labor rate",
      description: "What one person-hour actually costs you — the wage plus payroll taxes, insurance, and other burden — not just the hourly wage on the paycheck.",
      done: business.loadedLaborRateCents !== DEFAULT_BUSINESS_SETTINGS.loadedLaborRateCents,
      href: "/app/settings/",
      confirmable: false,
    },
    {
      id: "overhead-percent",
      label: "Set your overhead percentage",
      description: "The share of every job's direct cost that covers expenses no single job pays for on its own — a truck payment, insurance, the shop phone.",
      done: business.overheadPercent !== DEFAULT_BUSINESS_SETTINGS.overheadPercent,
      href: "/app/settings/",
      confirmable: false,
    },
    {
      id: "target-margin",
      label: "Set your target profit margin",
      description: "The percentage of the final price you want left over as profit once labor, materials, equipment, and overhead are all covered.",
      done: business.targetMarginPercent !== DEFAULT_BUSINESS_SETTINGS.targetMarginPercent,
      href: "/app/settings/",
      confirmable: false,
    },
    {
      id: "tax-settings",
      label: "Review your tax settings",
      description: "Confirm the sales tax rate that applies to your quotes, or confirm that you don't charge sales tax.",
      done: business.taxRatePercent !== DEFAULT_BUSINESS_SETTINGS.taxRatePercent || confirmedStepIds.has("tax-settings"),
      href: "/app/settings/",
      confirmable: true,
    },
    {
      id: "quote-rounding",
      label: "Review your quote-rounding increment",
      description: "The amount a final customer price rounds up to, so quotes read as clean numbers instead of e.g. $1,432.17.",
      done: business.roundingIncrementCents !== DEFAULT_BUSINESS_SETTINGS.roundingIncrementCents || confirmedStepIds.has("quote-rounding"),
      href: "/app/settings/",
      confirmable: true,
    },
    {
      id: "first-material",
      label: "Add your first material",
      description: "A priced material — mulch, sod, pavers — that your service assemblies and estimates can pull costs from.",
      done: materials.length > 0,
      href: "/app/catalog/",
      confirmable: false,
    },
    {
      id: "first-equipment",
      label: "Add your first piece of equipment",
      description: "A priced piece of equipment — mower, skid steer, trailer — with its own cost per hour of use.",
      done: equipment.length > 0,
      href: "/app/catalog/",
      confirmable: false,
    },
    {
      id: "first-assembly",
      label: "Build your first service assembly",
      description: "A bundle of materials, equipment, and labor priced per unit. Its production rate — how many units one crew-hour covers — is what turns your costs into a per-unit price.",
      done: assemblies.length > 0,
      href: "/app/templates/",
      confirmable: false,
    },
    {
      id: "first-estimate",
      label: "Build your first estimate",
      description: "A real project, priced from your assemblies, that you can turn into a customer quote.",
      done: projects.length > 0,
      href: "/app/estimates/",
      confirmable: false,
    },
  ];
  return steps;
}
