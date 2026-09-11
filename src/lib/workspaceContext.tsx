import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import BackupReminderBanner from "../components/app/BackupReminderBanner";
import SaveErrorBanner from "../components/app/SaveErrorBanner";
import WorkspaceMigrationError from "../components/app/WorkspaceMigrationError";
import { downloadTextFile } from "./download";
import { exportWorkspaceJson, loadWorkspace, makeId, parseWorkspaceJson, saveWorkspace, type ImportResult, type SaveWorkspaceResult, type WorkspaceLoadFailureReason } from "./persistence";
import { createSampleWorkspace } from "./sampleData";
import type {
  Assembly,
  BusinessSettings,
  Equipment,
  Material,
  Project,
  ProjectTemplate,
  Workspace,
} from "./types";

// Same key BackupReminderBanner.tsx reads/writes for its own reminder-timing
// logic — MUST stay byte-for-byte identical to that file's own
// `LAST_EXPORT_KEY` constant. Centralizing every *write* to this key here
// (via `recordBackupDownloaded`, called by every "download a backup" action
// in the app) is what keeps the Settings tab's "last backup" display and the
// banner's snooze/reset timer reading the same underlying timestamp — never
// two independently-tracked values that could drift apart.
const LAST_BACKUP_KEY = "landscapeEstimateProLastExportAt";

function readBackupTimestamp(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_BACKUP_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

interface WorkspaceContextValue {
  workspace: Workspace;
  /** Epoch ms of the last successful save, or null if nothing has saved yet
   * this session. Drives the visible "Saved just now" / "Saved 4m ago"
   * indicator — data safety is a core feature of a client-only app, so this
   * is never left implicit. */
  lastSavedAt: number | null;
  /** Epoch ms of the last completed backup/export download, or null if none
   * has ever happened in this browser. Read from `LAST_BACKUP_KEY` — the
   * exact same storage key BackupReminderBanner uses for its own "should I
   * nag about a backup" timer, so the Settings tab's display can never show
   * a different "last backup" time than the one the banner is actually
   * reasoning about. */
  lastBackupAt: number | null;
  /** Call after any action outside this file completes a backup download
   * (e.g. Settings' "Export workspace" button) so `lastBackupAt` — and the
   * banner's own snooze timer, since they share `LAST_BACKUP_KEY` — reflect
   * it immediately, without that caller needing to know the storage key or
   * duplicate this bookkeeping itself. */
  recordBackupDownloaded: () => void;
  updateBusiness: (patch: Partial<BusinessSettings>) => void;

  addMaterial: (material: Omit<Material, "id">) => Material;
  updateMaterial: (id: string, patch: Partial<Material>) => void;
  removeMaterial: (id: string) => void;

  addEquipment: (equipment: Omit<Equipment, "id">) => Equipment;
  updateEquipment: (id: string, patch: Partial<Equipment>) => void;
  removeEquipment: (id: string) => void;

  addAssembly: (assembly: Omit<Assembly, "id">) => Assembly;
  updateAssembly: (id: string, patch: Partial<Assembly>) => void;
  removeAssembly: (id: string) => void;

  addProject: (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  removeProject: (id: string) => void;
  duplicateProject: (id: string) => Project | null;

  addTemplate: (template: Omit<ProjectTemplate, "id">) => ProjectTemplate;
  removeTemplate: (id: string) => void;

  replaceWorkspace: (workspace: Workspace) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface LoadedState {
  workspace: Workspace | null;
  loadFailure: WorkspaceLoadFailureReason | null;
  /** The exact raw string that failed to load — only set alongside
   * `loadFailure`, so "download original workspace" can hand back
   * byte-for-byte what was actually stored, never a re-serialized/parsed
   * stand-in. */
  rawOriginal: string | null;
}

function initialLoad(): LoadedState {
  const result = loadWorkspace();
  return result.status === "ok"
    ? { workspace: result.workspace, loadFailure: null, rawOriginal: null }
    : { workspace: null, loadFailure: result.reason, rawOriginal: result.rawOriginal };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [{ workspace, loadFailure, rawOriginal }, setLoaded] = useState<LoadedState>(initialLoad);
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<(SaveWorkspaceResult & { ok: false }) | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Lazy-initialized the same way `initialLoad()` is — reading localStorage
  // directly in a `useState` initializer is safe here because this whole
  // provider is only ever mounted client-side (`client:only="react"` pages).
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(() => (typeof window === "undefined" ? null : readBackupTimestamp()));

  // loadWorkspace() already runs client-only-safe on first render (via
  // `client:only="react"` pages), but re-reading once on mount keeps this
  // provider correct if it's ever reused somewhere that isn't client:only.
  useEffect(() => {
    setLoaded(initialLoad());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !workspace || loadFailure) return;
    const result = saveWorkspace(workspace);
    setSaveError(result.ok ? null : result);
    if (result.ok) setLastSavedAt(Date.now());
  }, [workspace, loadFailure, hydrated]);

  // Warn before the tab closes/reloads/navigates away while the most recent
  // edit hasn't actually made it to storage — losing it silently would be
  // worse than an extra confirmation dialog.
  useEffect(() => {
    if (!saveError) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveError]);

  const retrySave = useCallback(() => {
    setLoaded((prev) => {
      if (!prev.workspace) return prev;
      const result = saveWorkspace(prev.workspace);
      setSaveError(result.ok ? null : result);
      if (result.ok) setLastSavedAt(Date.now());
      return prev;
    });
  }, []);

  // The one and only place that writes `LAST_BACKUP_KEY` — every "download a
  // backup" action (this callback, and Settings' own export button via the
  // exposed `recordBackupDownloaded`) routes through here, so there is never
  // more than one code path updating this timestamp.
  const recordBackupDownloaded = useCallback(() => {
    const now = Date.now();
    try {
      window.localStorage.setItem(LAST_BACKUP_KEY, String(now));
    } catch {
      // Non-critical — worst case the "last backup" display and the
      // reminder banner's snooze timer are both slightly stale, not wrong.
    }
    setLastBackupAt(now);
  }, []);

  // A plain read of the current `workspace` — no need to route through
  // `setLoaded`'s functional-updater trick, since this never mutates state.
  // (An earlier version funneled the download through `setLoaded(prev =>
  // ...)` purely to read the latest workspace without adding it as a
  // dependency, then tried to call `recordBackupDownloaded` — a DIFFERENT
  // state setter — from inside that updater. React does not guarantee that
  // updater runs synchronously within the same event handler, so the
  // dependent `recordBackupDownloaded()` call could run before the download
  // it was supposed to follow. Depending on `workspace` directly keeps
  // everything in this callback synchronous and ordered.)
  const downloadUnsavedBackup = useCallback(() => {
    if (!workspace) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`landscape-estimate-pro-unsaved-backup-${stamp}.json`, exportWorkspaceJson(workspace), "application/json");
    recordBackupDownloaded();
  }, [workspace, recordBackupDownloaded]);

  const resetToSample = useCallback(() => {
    const sample = createSampleWorkspace();
    const result = saveWorkspace(sample);
    setSaveError(result.ok ? null : result);
    setLoaded({ workspace: sample, loadFailure: null, rawOriginal: null });
  }, []);

  // Re-reads localStorage from scratch and re-runs migration — useful after
  // the user has hand-corrected the offending field via devtools without
  // reloading the page. Never touches storage itself; on another failure it
  // simply reports the (possibly updated) failure reason again.
  const retryMigration = useCallback(() => {
    setLoaded(initialLoad());
  }, []);

  // Reads a user-selected backup file and replaces the workspace ONLY after
  // `parseWorkspaceJson` fully validates it (same atomic migration pipeline
  // as every other import) — a malformed backup is rejected with its own
  // field errors and changes nothing.
  const restoreFromBackup = useCallback((json: string): ImportResult => {
    const result = parseWorkspaceJson(json);
    if (result.ok && result.workspace) {
      const saveResult = saveWorkspace(result.workspace);
      setSaveError(saveResult.ok ? null : saveResult);
      setLoaded({ workspace: result.workspace, loadFailure: null, rawOriginal: null });
    }
    return result;
  }, []);

  // Every mutator below still updates through this single setter — a no-op
  // when there's no valid workspace to update (the "needs correction" state
  // never renders the tabs that could call these anyway).
  const setWorkspace = useCallback((updater: (prev: Workspace) => Workspace) => {
    setLoaded((prev) => (prev.workspace ? { workspace: updater(prev.workspace), loadFailure: null, rawOriginal: null } : prev));
  }, []);

  const updateBusiness = useCallback((patch: Partial<BusinessSettings>) => {
    setWorkspace((prev) => ({ ...prev, business: { ...prev.business, ...patch } }));
  }, []);

  const addMaterial = useCallback((material: Omit<Material, "id">) => {
    const full: Material = { ...material, id: makeId("mat") };
    setWorkspace((prev) => ({ ...prev, materials: [...prev.materials, full] }));
    return full;
  }, []);
  const updateMaterial = useCallback((id: string, patch: Partial<Material>) => {
    setWorkspace((prev) => ({
      ...prev,
      materials: prev.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }, []);
  const removeMaterial = useCallback((id: string) => {
    setWorkspace((prev) => ({ ...prev, materials: prev.materials.filter((m) => m.id !== id) }));
  }, []);

  const addEquipment = useCallback((equipment: Omit<Equipment, "id">) => {
    const full: Equipment = { ...equipment, id: makeId("eq") };
    setWorkspace((prev) => ({ ...prev, equipment: [...prev.equipment, full] }));
    return full;
  }, []);
  const updateEquipment = useCallback((id: string, patch: Partial<Equipment>) => {
    setWorkspace((prev) => ({
      ...prev,
      equipment: prev.equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, []);
  const removeEquipment = useCallback((id: string) => {
    setWorkspace((prev) => ({ ...prev, equipment: prev.equipment.filter((e) => e.id !== id) }));
  }, []);

  const addAssembly = useCallback((assembly: Omit<Assembly, "id">) => {
    const full: Assembly = { ...assembly, id: makeId("asm") };
    setWorkspace((prev) => ({ ...prev, assemblies: [...prev.assemblies, full] }));
    return full;
  }, []);
  const updateAssembly = useCallback((id: string, patch: Partial<Assembly>) => {
    setWorkspace((prev) => ({
      ...prev,
      assemblies: prev.assemblies.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);
  const removeAssembly = useCallback((id: string) => {
    setWorkspace((prev) => ({ ...prev, assemblies: prev.assemblies.filter((a) => a.id !== id) }));
  }, []);

  const addProject = useCallback((project: Omit<Project, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const full: Project = { ...project, id: makeId("proj"), createdAt: now, updatedAt: now };
    setWorkspace((prev) => ({ ...prev, projects: [full, ...prev.projects] }));
    return full;
  }, []);
  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    setWorkspace((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
    }));
  }, []);
  const removeProject = useCallback((id: string) => {
    setWorkspace((prev) => ({ ...prev, projects: prev.projects.filter((p) => p.id !== id) }));
  }, []);
  const duplicateProject = useCallback(
    (id: string): Project | null => {
      const source = workspace?.projects.find((p) => p.id === id);
      if (!source) return null;
      const now = new Date().toISOString();
      const copy: Project = {
        ...source,
        id: makeId("proj"),
        name: `${source.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        status: "draft",
        actual: undefined,
        // A duplicate starts fresh — a draft's price re-solves live, so
        // carrying over the source project's revision history would attach
        // someone else's quoted history to a job that hasn't actually been
        // quoted yet.
        quoteRevisions: [],
        activeQuoteRevisionId: undefined,
      };
      setWorkspace((prev) => ({ ...prev, projects: [copy, ...prev.projects] }));
      return copy;
    },
    [workspace]
  );

  const addTemplate = useCallback((template: Omit<ProjectTemplate, "id">) => {
    const full: ProjectTemplate = { ...template, id: makeId("tmpl") };
    setWorkspace((prev) => ({ ...prev, templates: [...prev.templates, full] }));
    return full;
  }, []);
  const removeTemplate = useCallback((id: string) => {
    setWorkspace((prev) => ({ ...prev, templates: prev.templates.filter((t) => t.id !== id) }));
  }, []);

  const replaceWorkspace = useCallback((next: Workspace) => {
    setWorkspace(() => next);
  }, []);

  const value = useMemo<WorkspaceContextValue | null>(
    () =>
      workspace && {
        workspace,
      lastSavedAt,
      lastBackupAt,
      recordBackupDownloaded,
      updateBusiness,
      addMaterial,
      updateMaterial,
      removeMaterial,
      addEquipment,
      updateEquipment,
      removeEquipment,
      addAssembly,
      updateAssembly,
      removeAssembly,
      addProject,
      updateProject,
      removeProject,
      duplicateProject,
      addTemplate,
      removeTemplate,
      replaceWorkspace,
      },
    [
      workspace,
      lastSavedAt,
      lastBackupAt,
      recordBackupDownloaded,
      updateBusiness,
      addMaterial,
      updateMaterial,
      removeMaterial,
      addEquipment,
      updateEquipment,
      removeEquipment,
      addAssembly,
      updateAssembly,
      removeAssembly,
      addProject,
      updateProject,
      removeProject,
      duplicateProject,
      addTemplate,
      removeTemplate,
      replaceWorkspace,
    ]
  );

  if (loadFailure) {
    return (
      <WorkspaceMigrationError
        reason={loadFailure}
        rawOriginal={rawOriginal ?? ""}
        onReset={resetToSample}
        onRetry={retryMigration}
        onRestoreFromBackup={restoreFromBackup}
      />
    );
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {saveError && <SaveErrorBanner message={saveError.message} onRetry={retrySave} onDownloadBackup={downloadUnsavedBackup} />}
      {!saveError && workspace && <BackupReminderBanner workspace={workspace} onDownload={downloadUnsavedBackup} />}
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  return ctx;
}
