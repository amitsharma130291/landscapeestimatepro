import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadWorkspace, makeId, saveWorkspace } from "./persistence";
import type {
  Assembly,
  BusinessSettings,
  Equipment,
  Material,
  Project,
  ProjectTemplate,
  Workspace,
} from "./types";

interface WorkspaceContextValue {
  workspace: Workspace;
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [hydrated, setHydrated] = useState(false);

  // loadWorkspace() already runs client-only-safe on first render (via
  // `client:only="react"` pages), but re-reading once on mount keeps this
  // provider correct if it's ever reused somewhere that isn't client:only.
  useEffect(() => {
    setWorkspace(loadWorkspace());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkspace(workspace);
  }, [workspace, hydrated]);

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
      const source = workspace.projects.find((p) => p.id === id);
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
      };
      setWorkspace((prev) => ({ ...prev, projects: [copy, ...prev.projects] }));
      return copy;
    },
    [workspace.projects]
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
    setWorkspace(next);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
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
    }),
    [
      workspace,
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

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  return ctx;
}
