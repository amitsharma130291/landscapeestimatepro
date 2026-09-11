import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Circle, CheckCircle2 } from "lucide-react";
import { Card, Button } from "../ui/primitives";
import { deriveFirstRunChecklist } from "../../lib/firstRunChecklist";
import type { Workspace } from "../../lib/types";

const CONFIRMED_STEPS_KEY = "landscapeEstimateProChecklistConfirmedSteps";
const COLLAPSED_KEY = "landscapeEstimateProChecklistCollapsed";

function readConfirmedSteps(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CONFIRMED_STEPS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeConfirmedSteps(steps: Set<string>): void {
  try {
    window.localStorage.setItem(CONFIRMED_STEPS_KEY, JSON.stringify(Array.from(steps)));
  } catch {
    // Non-critical — worst case a confirmed step re-prompts next visit.
  }
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Setup checklist for the app's Overview tab. Always reflects real workspace
 * data (see deriveFirstRunChecklist) rather than a separate "onboarding done"
 * flag, so it can never disagree with what's actually in the workspace. It's
 * dismissible (collapses to a one-line summary bar) but never disappears for
 * good — a contractor who set up 8 of 10 things a month ago should still be
 * able to reopen it and finish the other 2.
 */
export default function FirstRunChecklist({ workspace }: { workspace: Workspace }) {
  const [confirmedStepIds, setConfirmedStepIds] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setConfirmedStepIds(readConfirmedSteps());
    setCollapsed(readCollapsed());
  }, []);

  const steps = deriveFirstRunChecklist(workspace, confirmedStepIds);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  function confirmStep(id: string) {
    const next = new Set(confirmedStepIds);
    next.add(id);
    setConfirmedStepIds(next);
    writeConfirmedSteps(next);
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Non-critical.
    }
  }

  return (
    <Card>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls="first-run-checklist-body"
        className="tap-target flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="text-lg font-bold text-ink">Setup checklist</span>
          <span className="ml-2 text-sm font-semibold text-muted">
            {doneCount} of {steps.length} done
          </span>
        </span>
        {collapsed ? <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-muted" /> : <ChevronUp size={20} aria-hidden="true" className="shrink-0 text-muted" />}
      </button>

      {!collapsed && (
        <div id="first-run-checklist-body" className="mt-4">
          {allDone ? (
            <p className="text-sm text-mint-ink">
              Every setup step is done. You're working with real assumptions, not sample data — nice.
            </p>
          ) : (
            <p className="mb-3 text-sm text-muted">
              These are the things that make an estimate here trustworthy — no invented defaults, just your real numbers.
            </p>
          )}
          <ul className="space-y-3">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2 size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-mint-ink" />
                ) : (
                  <Circle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-border" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${step.done ? "text-muted line-through" : "text-ink"}`}>{step.label}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.description}</p>
                  {!step.done && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <a href={step.href} className="text-sm font-semibold text-forest hover:underline">
                        {step.id === "business-details" || step.id.startsWith("first-") || step.id === "loaded-labor-rate" || step.id === "overhead-percent" || step.id === "target-margin"
                          ? "Go set it up →"
                          : "Go review it →"}
                      </a>
                      {step.confirmable && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => confirmStep(step.id)}>
                          Already reviewed — keep default
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
