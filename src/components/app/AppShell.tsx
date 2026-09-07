import { useState, type ReactElement } from "react";
import { LayoutGrid, Package, Settings, ClipboardList, FileText, Activity, ArrowLeft, Menu, X } from "lucide-react";
import { WorkspaceProvider } from "../../lib/workspaceContext";
import OverviewTab from "./tabs/OverviewTab";
import CatalogTab from "./tabs/CatalogTab";
import SettingsTab from "./tabs/SettingsTab";
import TemplatesTab from "./tabs/TemplatesTab";
import EstimatesTab from "./tabs/EstimatesTab";
import RateHealthTab from "./tabs/RateHealthTab";
import ActualsTab from "./tabs/ActualsTab";

export type AppTab = "overview" | "catalog" | "templates" | "estimates" | "rate-health" | "actuals" | "settings";

const NAV: { id: AppTab; label: string; href: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", href: "/app/", icon: LayoutGrid },
  { id: "catalog", label: "Catalog", href: "/app/catalog/", icon: Package },
  { id: "templates", label: "Assemblies & Templates", href: "/app/templates/", icon: FileText },
  { id: "estimates", label: "Estimates", href: "/app/estimates/", icon: ClipboardList },
  { id: "rate-health", label: "Rate Health", href: "/app/rate-health/", icon: Activity },
  { id: "actuals", label: "Estimate vs. Actual", href: "/app/actuals/", icon: Activity },
  { id: "settings", label: "Settings", href: "/app/settings/", icon: Settings },
];

const TAB_COMPONENTS: Record<AppTab, () => ReactElement> = {
  overview: OverviewTab,
  catalog: CatalogTab,
  templates: TemplatesTab,
  estimates: EstimatesTab,
  "rate-health": RateHealthTab,
  actuals: ActualsTab,
  settings: SettingsTab,
};

export default function AppShell({ activeTab }: { activeTab: AppTab }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const activeItem = NAV.find((item) => item.id === activeTab);

  return (
    <WorkspaceProvider>
      <div className="min-h-screen bg-paper">
        <a href="#app-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-forest focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>

        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-paper-dim lg:hidden"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-expanded={mobileNavOpen}
              aria-controls="app-sidebar"
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
            <a href="/" className="flex items-center gap-2 font-extrabold text-ink">
              <picture>
                <source srcSet="/brand/logo-mark.webp" type="image/webp" />
                <img src="/brand/logo-mark.png" alt="" width="36" height="36" className="h-8 w-8" />
              </picture>
              <span className="hidden sm:inline">
                Landscape Estimate <span className="text-lime-surface">Pro</span>
              </span>
            </a>
          </div>
          <a href="/" className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-forest">
            <ArrowLeft size={16} aria-hidden="true" /> Back to site
          </a>
        </header>

        <div className="mx-auto flex max-w-[90rem]">
          <nav
            id="app-sidebar"
            aria-label="Application"
            className={`${mobileNavOpen ? "block" : "hidden"} w-full shrink-0 border-b border-border bg-white p-3 lg:block lg:w-64 lg:border-b-0 lg:border-r lg:p-4`}
          >
            <ul className="space-y-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeTab;
                return (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                        isActive ? "bg-forest text-white" : "text-ink hover:bg-paper-dim"
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" />
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <main id="app-main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
            <h1 className="text-2xl font-extrabold text-ink">{activeItem?.label}</h1>
            <div className="mt-6">
              <ActiveComponent />
            </div>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
