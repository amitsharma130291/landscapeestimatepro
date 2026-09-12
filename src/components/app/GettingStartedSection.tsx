import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, CircleDot } from "lucide-react";
import { Card } from "../ui/primitives";
import { deriveGettingStartedProgress, type GettingStartedStepId } from "../../lib/gettingStarted";
import type { Workspace } from "../../lib/types";

const COLLAPSED_KEY = "landscapeEstimateProGettingStartedCollapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const STEP_META: Record<
  GettingStartedStepId,
  { title: string; description: string; actionLabel: string; sampleNoticeWhen?: (workspace: Workspace) => boolean }
> = {
  "business-setup": {
    title: "Set up your business",
    description: "Add your business details, loaded labor rate, overhead, target margin and minimum project price.",
    actionLabel: "Open Settings",
  },
  "add-costs": {
    title: "Add your costs",
    description: "Save the materials and equipment you regularly use so future estimates stay consistent.",
    actionLabel: "Build Your Catalog",
    // Sample data ships with materials/equipment pre-filled — clarify why
    // this still reads as "not started" instead of just looking wrong.
    sampleNoticeWhen: (w) => w.materials.length > 0 || w.equipment.length > 0,
  },
  "build-service": {
    title: "Build a service",
    description: "Combine materials, labor, equipment and other costs into a reusable landscaping service.",
    actionLabel: "Create a Service",
    sampleNoticeWhen: (w) => w.assemblies.length > 0,
  },
  "first-estimate": {
    title: "Create your first estimate",
    description: "Add project quantities and let Pro calculate true cost, minimum price and the quote required to reach your target margin.",
    actionLabel: "Create an Estimate",
  },
  "compare-actuals": {
    title: "Compare estimate vs. actual",
    description: "After completing a job, record actual labor, materials and equipment to see whether the project achieved its expected margin.",
    actionLabel: "Record Actuals",
  },
};

function statusLabel(id: GettingStartedStepId, status: "not-started" | "in-progress" | "complete"): string {
  if (status === "complete") return id === "first-estimate" ? "Complete — ready to quote" : "Complete";
  if (status === "in-progress") return id === "first-estimate" ? "In progress — estimate started" : "In progress";
  return "Not started";
}

function StatusIcon({ status }: { status: "not-started" | "in-progress" | "complete" }) {
  if (status === "complete") return <CheckCircle2 size={22} aria-hidden="true" className="shrink-0 text-mint-ink" />;
  if (status === "in-progress") return <CircleDot size={22} aria-hidden="true" className="shrink-0 text-amber" />;
  return <Circle size={22} aria-hidden="true" className="shrink-0 text-border" />;
}

/**
 * The one authoritative onboarding experience for the Pro app (supersedes
 * the earlier "Setup checklist" / FirstRunChecklist) — a five-step sequence
 * from a first business setting to closing the estimate-vs-actual learning
 * loop. Every step's status is DERIVED from real workspace data
 * (deriveGettingStartedProgress) rather than a separately-tracked "done"
 * flag, and rebuilt on every render, so it can never drift from what's
 * actually saved. Collapsing is a pure presentation preference (persisted
 * locally) — it never changes any step's actual completion state.
 */
export default function GettingStartedSection({ workspace }: { workspace: Workspace }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
    setHydrated(true);
  }, []);

  const progress = deriveGettingStartedProgress(workspace);
  const allDone = progress.completed === progress.total;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Non-critical — worst case the section re-expands next visit.
    }
  }

  // Avoid a flash of the wrong (server-rendered) collapsed state before the
  // persisted preference loads from localStorage on the client.
  const showCollapsed = hydrated && collapsed;

  return (
    <Card id="getting-started">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!showCollapsed}
        aria-controls="getting-started-body"
        className="tap-target flex w-full items-center justify-between gap-3 text-left"
      >
        {showCollapsed ? (
          <span className="text-sm font-semibold text-forest">Show getting-started guide</span>
        ) : (
          <span>
            <span className="text-lg font-bold text-ink">How to get started</span>
            <span className="ml-2 text-sm font-semibold text-muted">
              {progress.completed} of {progress.total} steps complete
            </span>
          </span>
        )}
        {showCollapsed ? <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-muted" /> : <ChevronUp size={20} aria-hidden="true" className="shrink-0 text-muted" />}
      </button>

      {!showCollapsed && (
        <div id="getting-started-body" className="mt-4">
          <p className="text-sm text-muted">Set up your business costs once, then reuse them to build faster estimates and protect your margin.</p>

          <div className="mt-4">
            <div
              role="progressbar"
              aria-valuenow={progress.completed}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-label={`Getting started progress: ${progress.completed} of ${progress.total} steps complete`}
              className="h-2 w-full overflow-hidden rounded-full bg-paper-dim"
            >
              <div
                className="h-full rounded-full bg-mint-ink transition-[width] duration-300"
                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
              />
            </div>
          </div>

          {allDone ? (
            <div className="mt-5 rounded-xl border border-lime-surface bg-mint p-4">
              <p className="font-bold text-mint-ink">You're ready to estimate with confidence.</p>
              <p className="mt-1 text-sm text-mint-ink">Your business costs, reusable services and job-costing workflow are set up.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a href="/app/estimates/" className="tap-target inline-flex min-h-[40px] items-center justify-center rounded-xl bg-forest px-4 text-sm font-bold text-white hover:bg-forest-light">
                  Create New Estimate
                </a>
                <a
                  href="/app/rate-health/"
                  className="tap-target inline-flex min-h-[40px] items-center justify-center rounded-xl border border-border bg-white px-4 text-sm font-bold text-forest hover:bg-paper-dim"
                >
                  Review Service Rate Health
                </a>
              </div>
            </div>
          ) : (
            <ol className="mt-5 space-y-3">
              {progress.steps.map((step, index) => {
                const meta = STEP_META[step.id];
                const isNext = step.id === progress.nextStepId;
                const showSampleNotice = step.status === "not-started" && meta.sampleNoticeWhen?.(workspace);
                return (
                  <li
                    key={step.id}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${isNext ? "border-lime-surface bg-mint/40" : "border-border"}`}
                  >
                    <StatusIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">
                          <span className="text-muted">{index + 1}.</span> {meta.title}
                        </p>
                        {isNext && (
                          <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-lime-ink">
                            Recommended next
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{meta.description}</p>
                      <p className="mt-1 text-xs font-semibold text-muted">{statusLabel(step.id, step.status)}</p>
                      {showSampleNotice && <p className="mt-1 text-xs italic text-muted">Sample data — replace with your business costs</p>}
                      <div className="mt-2">
                        <a href={step.href} className="text-sm font-semibold text-forest hover:underline">
                          {meta.actionLabel} →
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
