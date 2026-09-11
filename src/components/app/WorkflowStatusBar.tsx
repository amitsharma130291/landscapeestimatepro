import { Check, Clock, Lock, Radio, TriangleAlert } from "lucide-react";
import { Badge, Button } from "../ui/primitives";
import {
  deriveLifecycleStage,
  deriveNextAction,
  LIFECYCLE_STAGE_LABELS,
  type LifecycleStage,
} from "../../lib/estimateMath";
import type { Project, QuoteRevision } from "../../lib/types";

const STAGE_TONE: Record<LifecycleStage, "neutral" | "mint" | "amber" | "red"> = {
  draft: "neutral",
  quoted: "amber",
  accepted: "mint",
  completed: "mint",
  lost: "red",
  archived: "neutral",
};

function relativeTime(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * The compact "where does this project stand right now" strip — deliberately
 * NOT a big multi-step progress stepper (the product owner explicitly asked
 * for one clear status line, not a repeated stepper on every screen). Shows
 * exactly the facts a contractor needs before touching anything: what stage
 * this project is in, whether the price on screen is still live/recalculating
 * or frozen at a locked revision, whether the workspace has saved, any
 * blocking problems, and the one next thing worth doing.
 */
export default function WorkflowStatusBar({
  project,
  activeRevision,
  canQuote,
  blockingErrors,
  lastSavedAt,
  onQuote,
  onMarkAccepted,
  onCreateRevision,
  onShowHistory,
}: {
  project: Project;
  activeRevision: QuoteRevision | null;
  canQuote: boolean;
  blockingErrors: readonly string[];
  lastSavedAt: number | null;
  onQuote: () => void;
  onMarkAccepted: () => void;
  onCreateRevision: () => void;
  onShowHistory: () => void;
}) {
  const stage = deriveLifecycleStage(project);
  const nextAction = deriveNextAction(project, canQuote, blockingErrors);

  return (
    <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-paper-dim px-4 py-3 text-xs">
      <Badge tone={STAGE_TONE[stage]}>{LIFECYCLE_STAGE_LABELS[stage]}</Badge>

      <span className="inline-flex items-center gap-1.5 font-semibold text-ink" title={activeRevision ? "Frozen at the locked revision — catalog cost changes won't silently change it" : "Recalculating live from your current catalog and settings"}>
        {activeRevision ? <Lock size={13} aria-hidden="true" /> : <Radio size={13} aria-hidden="true" />}
        {activeRevision ? "Locked" : "Live"}
      </span>

      <span className="text-muted">
        {activeRevision ? `Revision ${activeRevision.revisionNumber} of ${project.quoteRevisions.length}` : "No quote revision yet"}
      </span>

      <span className="inline-flex items-center gap-1.5 text-muted">
        {lastSavedAt !== null ? (
          <>
            <Check size={13} aria-hidden="true" className="text-mint-ink" /> Saved {relativeTime(lastSavedAt, Date.now())}
          </>
        ) : (
          <>
            <Clock size={13} aria-hidden="true" /> Not yet saved this session
          </>
        )}
      </span>

      {!canQuote && blockingErrors.length > 0 && (
        <span role="status" className="inline-flex items-center gap-1.5 font-semibold text-red">
          <TriangleAlert size={13} aria-hidden="true" /> {blockingErrors.length} blocking {blockingErrors.length === 1 ? "problem" : "problems"}
        </span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {nextAction.kind === "quote" && (
          <Button type="button" size="sm" disabled={nextAction.disabled} title={nextAction.reason} onClick={onQuote}>
            {nextAction.label}
          </Button>
        )}
        {nextAction.kind === "accept-or-requote" && (
          <>
            <span className="text-muted">{nextAction.label}:</span>
            <Button type="button" size="sm" variant="secondary" onClick={onMarkAccepted}>Mark accepted</Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCreateRevision}>Create revision</Button>
          </>
        )}
        {nextAction.kind === "record-actuals" && (
          <Button type="button" size="sm" onClick={() => (window.location.href = "/app/actuals/")}>{nextAction.label}</Button>
        )}
        {nextAction.kind === "review-profitability" && (
          <Button type="button" size="sm" onClick={() => (window.location.href = "/app/actuals/")}>{nextAction.label}</Button>
        )}
        {nextAction.kind === "view-history" && project.quoteRevisions.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={onShowHistory}>{nextAction.label}</Button>
        )}
        {nextAction.kind === "reopen-or-archive" && <span className="text-muted">{nextAction.label} using the Status field</span>}
      </div>
    </div>
  );
}
