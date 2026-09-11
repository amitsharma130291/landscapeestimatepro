/**
 * Phase 10 — Data & Backup section of the Settings tab. Covers: honest
 * (no cloud-sync claim) storage-location copy, the last-saved/last-backup
 * timestamps sourced from WorkspaceProvider (not re-derived locally), the
 * schema version pulled from the live workspace, and that "Reset all data"
 * is gated behind a type-to-confirm control — a single click can never
 * trigger it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadWorkspace } from "../../../lib/persistence";
import { WorkspaceProvider } from "../../../lib/workspaceContext";
import SettingsTab from "./SettingsTab";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSettings() {
  return render(
    <WorkspaceProvider>
      <SettingsTab />
    </WorkspaceProvider>
  );
}

/** Same jsdom download stub used elsewhere (persistence-failure.test.ts,
 * workspaceContext.test.tsx) — there's no real "Save As" in a test env. */
function mockDownload() {
  const clickSpy = vi.fn();
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = originalCreateElement(tag);
    if (tag === "a") el.click = clickSpy;
    return el;
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return clickSpy;
}

describe("SettingsTab — Data & Backup section", () => {
  it("renders a dedicated 'Data & Backup' heading, distinct from the existing Backup & restore / Reset cards", async () => {
    renderSettings();
    expect(await screen.findByRole("heading", { name: "Data & Backup" })).toBeInTheDocument();
    // The pre-existing sections must still be present, untouched.
    expect(screen.getByRole("heading", { name: /backup.*restore/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reset" })).toBeInTheDocument();
  });

  it("describes storage honestly as browser-local only, and never claims cloud sync, encryption, or a server-side backup", async () => {
    renderSettings();
    const heading = await screen.findByRole("heading", { name: "Data & Backup" });
    const section = heading.closest("div")!;
    expect(section).toHaveTextContent(/stored locally in this browser only/i);
    expect(section).toHaveTextContent(/not backed up to any server or cloud/i);
    const text = section.textContent ?? "";
    expect(text).not.toMatch(/cloud sync|synced to the cloud|encrypted backup|automatically backed up/i);
  });

  it("shows the current data schema version from the live workspace", async () => {
    const loaded = loadWorkspace();
    if (loaded.status !== "ok") throw new Error("expected a fresh sample workspace to load");
    renderSettings();
    expect(await screen.findByText(`v${loaded.workspace.version}`)).toBeInTheDocument();
  });

  it("shows a real 'last saved' timestamp once the initial autosave completes (not stuck on a placeholder)", async () => {
    renderSettings();
    await waitFor(() => {
      const dts = screen.getAllByText("Last saved", { exact: false });
      expect(dts.length).toBeGreaterThan(0);
    });
    const lastSavedLabel = screen.getByText("Last saved");
    const value = lastSavedLabel.nextElementSibling;
    await waitFor(() => expect(value).not.toHaveTextContent("Never"));
  });

  it("shows 'Never' for last backup when none has happened yet, then updates after Export / Download backup is clicked", async () => {
    mockDownload();
    renderSettings();

    const lastBackupLabel = await screen.findByText("Last backup");
    expect(lastBackupLabel.nextElementSibling).toHaveTextContent("Never");

    fireEvent.click(screen.getByRole("button", { name: /export.*download backup/i }));

    await waitFor(() => expect(lastBackupLabel.nextElementSibling).not.toHaveTextContent("Never"));
    // Same key BackupReminderBanner reads for its own snooze/reset timer —
    // no second, independently-tracked "last backup" timestamp.
    expect(window.localStorage.getItem("landscapeEstimateProLastExportAt")).not.toBeNull();
  });

  it("'Restore from backup' reuses the existing single hidden file-input restore mechanism, rather than inventing a second one", async () => {
    renderSettings();
    await screen.findByRole("heading", { name: "Data & Backup" });

    const fileInputs = document.querySelectorAll('input[type="file"][accept="application/json"]');
    expect(fileInputs).toHaveLength(1);

    const input = fileInputs[0] as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("'Reset all data' is disabled until the confirmation phrase is typed, and a single click never resets the workspace", async () => {
    renderSettings();
    const nameInput = await screen.findByLabelText("Business name");
    fireEvent.change(nameInput, { target: { value: "Custom Test Business" } });
    expect(nameInput).toHaveValue("Custom Test Business");

    const resetButton = screen.getByRole("button", { name: "Reset all data" });
    expect(resetButton).toBeDisabled();

    fireEvent.click(resetButton); // disabled — must be a no-op
    expect(nameInput).toHaveValue("Custom Test Business");
  });

  it("'Reset all data' proceeds only after the exact confirmation phrase is typed", async () => {
    renderSettings();
    const nameInput = await screen.findByLabelText("Business name");
    fireEvent.change(nameInput, { target: { value: "Custom Test Business" } });

    const confirmInput = screen.getByLabelText(/type reset to confirm/i);
    fireEvent.change(confirmInput, { target: { value: "reset" } }); // case-insensitive match is fine

    const resetButton = screen.getByRole("button", { name: "Reset all data" });
    expect(resetButton).not.toBeDisabled();
    fireEvent.click(resetButton);

    // createSampleWorkspace() never sets a business name — a real reset
    // clears the value we just typed.
    await waitFor(() => expect(screen.getByLabelText("Business name")).toHaveValue(""));
  });

  it("does not touch the pre-existing Reset card's own window.confirm-gated action", async () => {
    renderSettings();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    expect(confirmSpy).toHaveBeenCalled();
  });
});
