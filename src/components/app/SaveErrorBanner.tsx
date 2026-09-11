import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/primitives";

/**
 * A persistent, impossible-to-miss banner shown whenever the most recent
 * change to the workspace failed to persist to localStorage (quota
 * exceeded, storage blocked, or an unknown write error). It never blocks the
 * rest of the app — the in-memory edit the user just made is kept exactly as
 * they left it — but it never lets that failure pass as a silent success
 * either: it stays up until a retry actually succeeds.
 */
export default function SaveErrorBanner({
  message,
  onRetry,
  onDownloadBackup,
}: {
  message: string;
  onRetry: () => void;
  onDownloadBackup: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  function handleRetry() {
    setRetrying(true);
    setTimeout(() => {
      onRetry();
      setRetrying(false);
    }, 50);
  }

  return (
    <div role="alert" className="sticky top-0 z-50 border-b border-red bg-red-light px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3">
        <AlertTriangle size={18} className="shrink-0 text-red" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-red">
          Your last change wasn't saved. {message} Your work is still here on this screen, but it won't survive a reload until this is fixed.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onDownloadBackup}>
            <Download size={14} aria-hidden="true" /> Download backup
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={handleRetry} disabled={retrying}>
            <RefreshCw size={14} aria-hidden="true" className={retrying ? "animate-spin" : undefined} /> {retrying ? "Retrying…" : "Retry save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
