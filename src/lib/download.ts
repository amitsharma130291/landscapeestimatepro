/** Triggers a browser "Save As" for an in-memory string — used for every
 * recovery/backup download in the app (original workspace, error reports,
 * unsaved-change backups) so they all behave identically. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
