import { beforeEach, describe, expect, it } from "vitest";
import { createSampleWorkspace } from "./sampleData";
import { exportWorkspaceJson, loadWorkspace, parseWorkspaceJson, saveWorkspace } from "./persistence";

const STORAGE_KEY = "landscapeEstimateProWorkspace:v1";

describe("persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns a sample workspace when nothing is stored yet", () => {
    const workspace = loadWorkspace();
    expect(workspace.version).toBe(1);
    expect(workspace.materials.length).toBeGreaterThan(0);
  });

  it("round-trips a saved workspace exactly", () => {
    const workspace = createSampleWorkspace();
    workspace.business.targetMarginPercent = 42;
    saveWorkspace(workspace);
    const loaded = loadWorkspace();
    expect(loaded.business.targetMarginPercent).toBe(42);
    expect(loaded.materials).toEqual(workspace.materials);
  });

  it("falls back to defaults instead of throwing on corrupted JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(() => loadWorkspace()).not.toThrow();
    const workspace = loadWorkspace();
    expect(workspace.version).toBe(1);
  });

  it("falls back to defaults when the stored shape is missing required arrays", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, business: {} }));
    const workspace = loadWorkspace();
    expect(Array.isArray(workspace.materials)).toBe(true);
  });

  it("export → parseWorkspaceJson round-trips a valid backup", () => {
    const workspace = createSampleWorkspace();
    const json = exportWorkspaceJson(workspace);
    const result = parseWorkspaceJson(json);
    expect(result.ok).toBe(true);
    expect(result.workspace?.materials.length).toBe(workspace.materials.length);
  });

  it("rejects a backup file that isn't valid JSON", () => {
    const result = parseWorkspaceJson("not json at all");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a JSON file that isn't a plausible workspace", () => {
    const result = parseWorkspaceJson(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
  });
});
