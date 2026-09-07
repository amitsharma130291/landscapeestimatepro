/**
 * Local-first persistence. The Pro app's entire workspace lives in
 * localStorage — nothing is ever sent to a server. Every read is defensively
 * parsed and validated (never trust stored JSON blindly: a corrupted or
 * hand-edited blob must degrade to defaults, not crash the app).
 */
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

const STORAGE_KEY = "landscapeEstimateProWorkspace:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Best-effort validation: confirms top-level shape without deeply
 * re-validating every field (a bad row is safer to keep than to silently
 * drop the whole workspace over one malformed entry). */
function isPlausibleWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!isRecord(value.business)) return false;
  if (!isArray(value.materials)) return false;
  if (!isArray(value.equipment)) return false;
  if (!isArray(value.assemblies)) return false;
  if (!isArray(value.projects)) return false;
  if (!isArray(value.templates)) return false;
  return true;
}

export function loadWorkspace(): Workspace {
  if (typeof window === "undefined") return createSampleWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSampleWorkspace();
    const parsed = JSON.parse(raw);
    if (!isPlausibleWorkspace(parsed)) return createSampleWorkspace();
    return parsed;
  } catch {
    return createSampleWorkspace();
  }
}

export function saveWorkspace(workspace: Workspace): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — fail silently
    // rather than throwing during a render-triggered save.
  }
}

export function exportWorkspaceJson(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2);
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  workspace?: Workspace;
}

export function parseWorkspaceJson(json: string): ImportResult {
  try {
    const parsed = JSON.parse(json);
    if (!isPlausibleWorkspace(parsed)) {
      return { ok: false, error: "That file doesn't look like a Landscape Estimate Pro backup." };
    }
    return { ok: true, workspace: parsed };
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type { Assembly, BusinessSettings, Equipment, Material, Project, ProjectTemplate, Workspace };
