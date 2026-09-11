import { useRef, useState } from "react";
import { AlertTriangle, Download, RefreshCw, Upload } from "lucide-react";
import { downloadTextFile } from "../../lib/download";
import type { ImportResult, WorkspaceLoadFailureReason } from "../../lib/persistence";
import { Button, Card } from "../ui/primitives";

/**
 * Blocks the whole app when the saved workspace couldn't be migrated because
 * one or more money fields are missing or malformed. Never renders the
 * normal tabs on top of an unmigrated/partial workspace — that would risk
 * quoting or reporting off of a silently-substituted number. The user's
 * original data is untouched in localStorage the entire time this is shown.
 *
 * Offers five recovery paths, ordered from safest/most-reversible to most
 * destructive:
 *  1. Download the exact original workspace (byte-for-byte, before any
 *     resort to the other options).
 *  2. Download a report of exactly what's wrong, to fix by hand or send to
 *     support.
 *  3. Retry migration in place — for after a manual localStorage fix.
 *  4. Restore from a previously-exported backup file.
 *  5. Reset to a fresh sample workspace — permanently discards the broken
 *     data; requires having downloaded it first, and an explicit confirm.
 */
export default function WorkspaceMigrationError({
  reason,
  rawOriginal,
  onReset,
  onRetry,
  onRestoreFromBackup,
}: {
  reason: WorkspaceLoadFailureReason;
  rawOriginal: string;
  onReset: () => void;
  onRetry: () => void;
  onRestoreFromBackup: (json: string) => ImportResult;
}) {
  const [hasDownloadedOriginal, setHasDownloadedOriginal] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fieldErrors = reason.kind === "field-errors" ? reason.errors : [];

  function handleDownloadOriginal() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`landscape-estimate-pro-original-workspace-${stamp}.json`, rawOriginal, "application/json");
    setHasDownloadedOriginal(true);
  }

  function handleDownloadReport() {
    const stamp = new Date().toISOString().slice(0, 10);
    const report =
      reason.kind === "field-errors"
        ? { generatedAt: new Date().toISOString(), kind: reason.kind, errorCount: reason.errors.length, errors: reason.errors }
        : { generatedAt: new Date().toISOString(), kind: reason.kind, message: reason.message };
    downloadTextFile(`landscape-estimate-pro-migration-error-report-${stamp}.json`, JSON.stringify(report, null, 2), "application/json");
  }

  function handleRetry() {
    setRetrying(true);
    // Give the UI a chance to paint the "Retrying…" state before the
    // synchronous re-read/re-migrate — retry is cheap but not instant to
    // perceive without this.
    setTimeout(() => {
      onRetry();
      setRetrying(false);
    }, 50);
  }

  function handleRestoreFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const json = String(reader.result ?? "");
      const result = onRestoreFromBackup(json);
      if (!result.ok) {
        const detail = result.fieldErrors?.length ? ` (${result.fieldErrors.map((e) => `${e.recordId}: ${e.field}`).join("; ")})` : "";
        setRestoreMessage({ type: "error", text: `${result.error ?? "Restore failed."}${detail}` });
      }
      // On success, `onRestoreFromBackup` already swapped the app into the
      // normal (validated) workspace state — this component unmounts, so
      // there's nothing further to show here.
    };
    reader.readAsText(file);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Card>
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className="mt-0.5 shrink-0 text-red" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-ink">Your saved data needs correction</h1>
            <p className="mt-1.5 text-sm text-muted">
              {reason.kind === "field-errors"
                ? `${reason.errors.length} amount${reason.errors.length === 1 ? "" : "s"} in your saved workspace ${reason.errors.length === 1 ? "is" : "are"} missing or couldn't be read as a valid dollar figure.`
                : reason.message}{" "}
              To protect your data, nothing was changed or upgraded — your original workspace is still saved exactly as it was, byte-for-byte.
            </p>
          </div>
        </div>

        {fieldErrors.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-2.5">Record</th>
                  <th scope="col" className="px-4 py-2.5">Field</th>
                  <th scope="col" className="px-4 py-2.5">Original value</th>
                  <th scope="col" className="px-4 py-2.5">Schema</th>
                </tr>
              </thead>
              <tbody>
                {fieldErrors.map((err, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink">{err.recordId}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink">{err.field}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-red">{JSON.stringify(err.originalValue) ?? "undefined"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted tabular-nums">
                      v{err.sourceSchemaVersion} → v{err.targetSchemaVersion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">1. Save a copy of your data</h2>
          <p className="mt-1 text-sm text-muted">Do this first, before trying anything else below.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={handleDownloadOriginal}>
              <Download size={16} aria-hidden="true" /> Download original workspace
            </Button>
            <Button type="button" variant="ghost" onClick={handleDownloadReport}>
              <Download size={16} aria-hidden="true" /> Download error report
            </Button>
          </div>
          {hasDownloadedOriginal && <p className="mt-2 text-xs font-medium text-mint-ink">Original workspace downloaded.</p>}
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">2. Try to recover</h2>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <div>
              <Button type="button" variant="ghost" onClick={handleRetry} disabled={retrying}>
                <RefreshCw size={16} aria-hidden="true" className={retrying ? "animate-spin" : undefined} /> {retrying ? "Retrying…" : "Retry migration"}
              </Button>
              <p className="mt-1.5 max-w-[16rem] text-xs text-muted">If you've corrected the field(s) above directly in local storage, retry without reloading.</p>
            </div>
            <div>
              <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} aria-hidden="true" /> Restore from backup
              </Button>
              <p className="mt-1.5 max-w-[16rem] text-xs text-muted">Replace this workspace with a previously exported backup file. Only applied once it fully validates.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRestoreFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          {restoreMessage && (
            <p role="status" className={`mt-3 text-sm font-medium ${restoreMessage.type === "error" ? "text-red" : "text-mint-ink"}`}>
              {restoreMessage.text}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-red">3. Or, start over (destructive)</h2>
          <p className="mt-1 text-sm text-muted">
            Replaces ALL of your local materials, equipment, assemblies, and projects with fresh sample data. Your current projects listed above will be permanently gone
            from this browser unless you've downloaded them. This cannot be undone.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant="danger"
              disabled={!hasDownloadedOriginal}
              title={hasDownloadedOriginal ? undefined : "Download the original workspace first"}
              onClick={() => {
                if (
                  window.confirm(
                    "This will PERMANENTLY replace all your local materials, equipment, assemblies, and projects with fresh sample data. This cannot be undone. Are you sure you want to reset?"
                  )
                ) {
                  onReset();
                }
              }}
            >
              Reset to sample workspace
            </Button>
            {!hasDownloadedOriginal && <p className="mt-1.5 text-xs text-muted">Download the original workspace above to enable this.</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
