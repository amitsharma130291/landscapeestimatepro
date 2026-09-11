import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useWorkspace } from "../../lib/workspaceContext";

function relativeTime(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * "Saved just now" / "Saved 4m ago" in the app header — visible save/unsaved
 * state is a real data-safety feature for a client-only app, not cosmetic.
 * A failed save is handled entirely separately by SaveErrorBanner (a
 * persistent, impossible-to-miss banner), so this indicator only ever needs
 * to represent the success case.
 */
export default function SaveStatusIndicator() {
  const { lastSavedAt } = useWorkspace();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);

  if (lastSavedAt === null) return null;

  return (
    <p className="hidden items-center gap-1.5 text-xs font-medium text-muted sm:flex" title={new Date(lastSavedAt).toLocaleString()}>
      <Check size={14} className="text-mint-ink" aria-hidden="true" />
      Saved {relativeTime(lastSavedAt, now)}
    </p>
  );
}
