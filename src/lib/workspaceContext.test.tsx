/**
 * Phase 10 — Data & Backup. `lastBackupAt` and `recordBackupDownloaded` are
 * additive to WorkspaceProvider; the critical property under test is that
 * they read/write the EXACT SAME storage key BackupReminderBanner already
 * uses for its own reminder-timing logic (`landscapeEstimateProLastExportAt`)
 * — otherwise the Settings tab's "last backup" display and the banner's
 * snooze/reset timer could silently drift apart. `downloadUnsavedBackup`
 * itself stays a private implementation detail of WorkspaceProvider (wired
 * directly into SaveErrorBanner/BackupReminderBanner as a prop, not exposed
 * via `useWorkspace()`), so it's exercised here through that banner's own
 * real "Download backup" button rather than by reaching into internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The banner's download button calls this module's `downloadTextFile` —
// mocked here rather than exercising a real jsdom Blob/anchor download, so
// this test is about the timestamp bookkeeping around the download, not
// about re-proving jsdom can fake a file save (already covered elsewhere,
// e.g. persistence-failure.test.ts's "Download original workspace" case).
vi.mock("./download", () => ({ downloadTextFile: vi.fn() }));

const { useWorkspace, WorkspaceProvider } = await import("./workspaceContext");
const { downloadTextFile } = await import("./download");

const LAST_BACKUP_KEY = "landscapeEstimateProLastExportAt";

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(downloadTextFile).mockClear();
});
afterEach(() => {
  cleanup();
});

function Probe() {
  const { lastBackupAt, recordBackupDownloaded } = useWorkspace();
  return (
    <div>
      <span data-testid="last-backup">{lastBackupAt === null ? "none" : String(lastBackupAt)}</span>
      <button onClick={recordBackupDownloaded}>record</button>
    </div>
  );
}

describe("workspaceContext — lastBackupAt shares BackupReminderBanner's storage key (no drift)", () => {
  it("starts as null when nothing has ever been backed up in this browser", async () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    );
    expect(await screen.findByTestId("last-backup")).toHaveTextContent("none");
  });

  it("reads a timestamp already written under BackupReminderBanner's own key on mount", async () => {
    window.localStorage.setItem(LAST_BACKUP_KEY, "1234567890");
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    );
    expect(await screen.findByTestId("last-backup")).toHaveTextContent("1234567890");
  });

  it("clicking BackupReminderBanner's own 'Download backup' button (the real onDownload=downloadUnsavedBackup wiring) writes LAST_BACKUP_KEY and updates the context's lastBackupAt", async () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    );
    // The sample workspace has meaningful content (sample assemblies), so
    // the reminder banner is up with nothing dismissed/exported yet.
    const bannerButton = await screen.findByRole("button", { name: /download backup/i });
    fireEvent.click(bannerButton);

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("last-backup")).not.toHaveTextContent("none"));
    // The banner itself dismisses once its own download completes — wait for
    // that too, since the banner's own (separate) write to LAST_BACKUP_KEY
    // happens right after `onDownload()` returns, as part of the same click.
    await waitFor(() => expect(screen.queryByRole("button", { name: /download backup/i })).not.toBeInTheDocument());

    const stored = Number(window.localStorage.getItem(LAST_BACKUP_KEY));
    const displayed = Number(screen.getByTestId("last-backup").textContent);
    expect(stored).toBeGreaterThan(0);
    expect(displayed).toBeGreaterThan(0);
    // Both this context's write (via `recordBackupDownloaded`) and the
    // banner's own subsequent write land on the exact same key — the
    // "source of truth" guarantee — so they describe the same backup event
    // even if they're two independent `Date.now()` calls a few
    // milliseconds apart (not two unrelated, drifting timestamps).
    expect(Math.abs(stored - displayed)).toBeLessThan(5000);
  });

  it("recordBackupDownloaded (used by Settings' own Export button) updates the SAME shared timestamp, not a second independently-tracked one", async () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    );
    expect(await screen.findByTestId("last-backup")).toHaveTextContent("none");

    fireEvent.click(screen.getByText("record"));

    await waitFor(() => expect(screen.getByTestId("last-backup")).not.toHaveTextContent("none"));
    const displayed = screen.getByTestId("last-backup").textContent;
    expect(window.localStorage.getItem(LAST_BACKUP_KEY)).toBe(displayed);
  });
});

// LEP-127 — duplicating an estimate must produce a fully independent record:
// a distinct id, no shared quote-revision history, and editing one must
// never affect the other.
function DuplicateProbe() {
  const { workspace, addProject, duplicateProject, updateProject } = useWorkspace();
  // duplicateProject unshifts the copy to the FRONT of the array, so array
  // position alone can't distinguish original from copy after duplicating —
  // identify each by its name instead (the copy is always suffixed).
  const project = workspace?.projects.find((p) => !p.name.endsWith("(copy)"));
  const duplicate = workspace?.projects.find((p) => p.name.endsWith("(copy)"));
  return (
    <div>
      <button
        onClick={() =>
          addProject({
            name: "Original Job",
            status: "draft",
            serviceLines: [],
            equipmentLines: [],
            laborLines: [],
            deliveryCostCents: 0 as never,
            extraCosts: [],
            overheadPercent: 15,
            targetMarginPercent: 35,
            taxRatePercent: 0,
            quoteRevisions: [],
          })
        }
      >
        add
      </button>
      <button onClick={() => project && duplicateProject(project.id)}>duplicate</button>
      <button onClick={() => project && updateProject(project.id, { name: "Renamed Original" })}>rename original</button>
      <span data-testid="count">{workspace?.projects.length ?? 0}</span>
      <span data-testid="original-id">{project?.id ?? ""}</span>
      <span data-testid="original-name">{project?.name ?? ""}</span>
      <span data-testid="duplicate-id">{duplicate?.id ?? ""}</span>
      <span data-testid="duplicate-name">{duplicate?.name ?? ""}</span>
      <span data-testid="duplicate-status">{duplicate?.status ?? ""}</span>
      <span data-testid="duplicate-revisions">{duplicate?.quoteRevisions.length ?? -1}</span>
    </div>
  );
}

describe("workspaceContext — duplicateProject produces a fully independent record", () => {
  it("gives the duplicate a distinct id, resets its status/revision history, and never mutates the original when either is edited", async () => {
    render(
      <WorkspaceProvider>
        <DuplicateProbe />
      </WorkspaceProvider>
    );
    fireEvent.click(screen.getByText("add"));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
    const originalId = screen.getByTestId("original-id").textContent;

    fireEvent.click(screen.getByText("duplicate"));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));

    const duplicateId = screen.getByTestId("duplicate-id").textContent;
    expect(duplicateId).not.toBe("");
    expect(duplicateId).not.toBe(originalId); // distinct identity, never a shared/reused id
    expect(screen.getByTestId("duplicate-name")).toHaveTextContent("Original Job (copy)");
    expect(screen.getByTestId("duplicate-status")).toHaveTextContent("draft");
    expect(screen.getByTestId("duplicate-revisions")).toHaveTextContent("0"); // no inherited quote history

    // Editing the ORIGINAL must never touch the duplicate.
    fireEvent.click(screen.getByText("rename original"));
    await waitFor(() => expect(screen.getByTestId("original-name")).toHaveTextContent("Renamed Original"));
    expect(screen.getByTestId("duplicate-name")).toHaveTextContent("Original Job (copy)");
  });
});
