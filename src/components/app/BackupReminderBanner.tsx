import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "../ui/primitives";
import type { Workspace } from "../../lib/types";

const LAST_EXPORT_KEY = "landscapeEstimateProLastExportAt";
const DISMISSED_UNTIL_KEY = "landscapeEstimateProBackupReminderDismissedUntil";
const REMIND_AFTER_MS = 1000 * 60 * 60 * 24 * 3; // 3 days since the last export
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 3; // dismissing quiets it for another 3 days

function hasMeaningfulContent(workspace: Workspace): boolean {
  // Not worth nagging someone who's only ever seen the sample data —
  // "meaningful" means they've actually built something of their own.
  return workspace.projects.length > 0 || workspace.materials.length >= 3 || workspace.assemblies.length > 0;
}

function readTimestamp(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

/**
 * A gentle, dismissible nudge to export a JSON backup — never a blocking
 * modal, never shown on every visit. Because this app has no server, a
 * cleared browser or a device change is the ONLY way project data is lost,
 * so a periodic reminder (not a one-time tip) is a real safety feature, not
 * nagging — as long as it stays easy to dismiss and doesn't reappear
 * immediately after.
 */
export default function BackupReminderBanner({ workspace, onDownload }: { workspace: Workspace; onDownload: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasMeaningfulContent(workspace)) return;
    const now = Date.now();
    const dismissedUntil = readTimestamp(DISMISSED_UNTIL_KEY);
    if (dismissedUntil && now < dismissedUntil) return;
    const lastExportAt = readTimestamp(LAST_EXPORT_KEY);
    if (lastExportAt && now - lastExportAt < REMIND_AFTER_MS) return;
    setVisible(true);
    // Only depends on whether the workspace has *any* meaningful content —
    // re-running this check on every keystroke elsewhere is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMeaningfulContent(workspace)]);

  function handleDownload() {
    onDownload();
    try {
      window.localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
    } catch {
      // Non-critical — worst case the reminder resurfaces sooner than ideal.
    }
    setVisible(false);
  }

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // Non-critical.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div role="status" className="border-b border-border bg-mint px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium text-mint-ink">
          Your project data lives only in this browser. Download a backup now, especially before clearing browser data or
          switching computers.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleDownload}>
            <Download size={14} aria-hidden="true" /> Download backup
          </Button>
          <button type="button" onClick={handleDismiss} className="flex h-9 w-9 items-center justify-center rounded-lg text-mint-ink hover:bg-black/5" aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
