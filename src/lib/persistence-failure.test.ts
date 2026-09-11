/**
 * Regression suite for two defects found by an independent QA pass against
 * the QA test plan's LEP-143 (storage-write failures) and LEP-144
 * (corrupt-storage recovery) cases — DEF-03 and DEF-04.
 *
 * DEF-04: a JSON.parse failure (or any other unreadable-storage case) must
 * never silently substitute a fresh sample workspace for what was actually
 * stored — that looks like a fix but is actually silent data loss the next
 * time autosave runs. It must surface the same `needs-correction` recovery
 * flow as a malformed-money-field failure.
 *
 * DEF-03: a failed `saveWorkspace()` write must never be swallowed — the
 * caller needs a typed reason so the UI can show a persistent, visible error
 * instead of presenting a false "saved" state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { createSampleWorkspace } from "./sampleData";
import { loadWorkspace, parseWorkspaceJson, saveWorkspace } from "./persistence";
import { useWorkspace, WorkspaceProvider } from "./workspaceContext";
import type { Workspace } from "./types";

const STORAGE_KEY = "landscapeEstimateProWorkspace:v1";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// -- DEF-04: corrupt/unparseable storage never silently becomes sample data --

describe("DEF-04 — corrupt storage recovery (loadWorkspace)", () => {
  it("truncated JSON: surfaces needs-correction/unparseable, preserves the raw original, never crashes", () => {
    const rawBlob = '{"version":5,"business":{"loadedLaborRateCents":3200';
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    expect(() => loadWorkspace()).not.toThrow();
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.reason.kind).toBe("unparseable");
    expect(result.rawOriginal).toBe(rawBlob);
  });

  it("empty raw string (something WAS stored, just empty — distinct from never having a key at all): needs-correction, not treated as a fresh visit", () => {
    window.localStorage.setItem(STORAGE_KEY, "");
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.reason.kind).toBe("unparseable");
    expect(result.rawOriginal).toBe("");
  });

  it("no stored key at all (a genuine first-time visit): this is the ONE legitimate case that returns a fresh sample workspace", () => {
    // localStorage was cleared in beforeEach — the key was never set.
    const result = loadWorkspace();
    expect(result.status).toBe("ok");
  });

  it("syntactically valid JSON but the wrong schema shape entirely: needs-correction, not a silent sample substitution", () => {
    const rawBlob = JSON.stringify({ hello: "world", notAWorkspace: true });
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.reason.kind).toBe("invalid-shape");
    expect(result.rawOriginal).toBe(rawBlob);
  });

  it("malformed/unpaired Unicode surrogate inside an otherwise-valid workspace: never crashes, loads normally (a content-robustness proof, not a rejection)", () => {
    const sample = createSampleWorkspace();
    const withOddName: Workspace = { ...sample, materials: [{ id: "m1", name: "Mulch\uD800Extra", unitCostCents: 100 as never, unit: "each" }] };
    const rawBlob = JSON.stringify(withOddName);
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    expect(() => loadWorkspace()).not.toThrow();
    const result = loadWorkspace();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.workspace.materials[0].name).toBe("Mulch\uD800Extra");
  });

  it("repeated failed reload: calling loadWorkspace() again after another failure is idempotent — same reason, storage still untouched", () => {
    const rawBlob = "{not valid json at all";
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    const first = loadWorkspace();
    const second = loadWorkspace();
    const third = loadWorkspace();
    expect(first.status).toBe("needs-correction");
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBlob);
  });

  it("no storage mutation before confirmed recovery: STORAGE_KEY itself is never written to by a failed load — only the separate backup slot may be", () => {
    const rawBlob = "{not valid json";
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    loadWorkspace();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBlob);
  });

  it("byte-exact original preserved: rawOriginal is the literal stored string, not a re-serialized stand-in, for an unparseable blob", () => {
    const rawBlob = '{"weird":   "spacing",\n"trailing":true,}'; // trailing comma — invalid JSON, specific whitespace
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    const result = loadWorkspace();
    expect(result.status).toBe("needs-correction");
    if (result.status !== "needs-correction") throw new Error("unreachable");
    expect(result.rawOriginal).toBe(rawBlob);
  });

  it("successful restore after a parse failure: parseWorkspaceJson (the same pipeline 'Restore from backup' uses) accepts a valid backup and produces a workspace that saves cleanly, without ever touching the still-broken STORAGE_KEY as a side effect of the failed load", () => {
    const rawBlob = "{not valid json";
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    const failedLoad = loadWorkspace();
    expect(failedLoad.status).toBe("needs-correction");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBlob); // still untouched

    const goodBackup = JSON.stringify(createSampleWorkspace());
    const restoreResult = parseWorkspaceJson(goodBackup);
    expect(restoreResult.ok).toBe(true);
    expect(restoreResult.workspace).toBeDefined();

    // Only once the caller explicitly saves the restored workspace does
    // storage change — parsing alone never mutates it.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBlob);
    const saveResult = saveWorkspace(restoreResult.workspace!);
    expect(saveResult.ok).toBe(true);
    const reloaded = loadWorkspace();
    expect(reloaded.status).toBe("ok");
  });
});

// -- DEF-04, component level: the migration-error screen renders for every failure kind --

describe("DEF-04 — WorkspaceProvider renders recovery UI for every load-failure kind", () => {
  function Probe() {
    const { workspace } = useWorkspace();
    return createElement("div", { "data-testid": "workspace-loaded" }, workspace.materials.length);
  }

  it("unparseable JSON shows the recovery screen, not the normal app", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    render(createElement(WorkspaceProvider, null, createElement(Probe)));
    expect(await screen.findByText(/needs correction/i)).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-loaded")).not.toBeInTheDocument();
    expect(screen.getByText(/isn't valid JSON/i)).toBeInTheDocument();
  });

  it("Download original workspace hands back the byte-exact raw string for an unparseable blob", async () => {
    const rawBlob = "{not valid json, corrupted mid-write";
    window.localStorage.setItem(STORAGE_KEY, rawBlob);
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });
    let capturedHref: string | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      // jsdom Blob text isn't synchronously readable here; capture the blob
      // itself for a later async read instead of the (unused) fake URL.
      capturedBlob = blob as Blob;
      return "blob:fake";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let capturedBlob: Blob | null = null;

    render(createElement(WorkspaceProvider, null, createElement(Probe)));
    await screen.findByText(/needs correction/i);
    fireEvent.click(screen.getByRole("button", { name: /download original workspace/i }));

    expect(clickSpy).toHaveBeenCalled();
    expect(capturedBlob).not.toBeNull();
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = reject;
      reader.readAsText(capturedBlob!);
    });
    expect(text).toBe(rawBlob); // exact, byte-for-byte
    void capturedHref;
  });
});

// -- DEF-03: saveWorkspace surfaces every write failure as a typed result --

describe("DEF-03 — saveWorkspace never swallows a write failure", () => {
  function quotaExceeded(): DOMException {
    return new DOMException("Quota exceeded", "QuotaExceededError");
  }
  function securityBlocked(): DOMException {
    return new DOMException("Storage disabled", "SecurityError");
  }

  it("QuotaExceededError is reported as reason: 'quota', not swallowed", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw quotaExceeded();
    });
    const result = saveWorkspace(createSampleWorkspace());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("quota");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("SecurityError (storage blocked, e.g. private browsing) is reported as reason: 'security'", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw securityBlocked();
    });
    const result = saveWorkspace(createSampleWorkspace());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("security");
  });

  it("an unrecognized thrown error is reported as reason: 'unknown', never silently discarded", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("disk on fire");
    });
    const result = saveWorkspace(createSampleWorkspace());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unknown");
  });

  it("legacy Firefox-style numeric quota codes (22 and 1014) are also classified as 'quota'", () => {
    const legacy = new DOMException("legacy quota");
    Object.defineProperty(legacy, "code", { value: 22 });
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw legacy;
    });
    const result = saveWorkspace(createSampleWorkspace());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("quota");
  });

  it("a successful write reports ok:true", () => {
    const result = saveWorkspace(createSampleWorkspace());
    expect(result).toEqual({ ok: true });
  });

  it("a successful retry after the underlying problem is fixed clears the failure", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementationOnce(() => {
      throw quotaExceeded();
    });
    const first = saveWorkspace(createSampleWorkspace());
    expect(first.ok).toBe(false);
    spy.mockRestore(); // "fixed" — subsequent calls behave normally
    const second = saveWorkspace(createSampleWorkspace());
    expect(second.ok).toBe(true);
  });
});

// -- DEF-03, component level: visible banner, retained changes, unload guard --

describe("DEF-03 — WorkspaceProvider surfaces a persistent visible error on save failure", () => {
  function Editor() {
    const { workspace, updateBusiness } = useWorkspace();
    return createElement(
      "div",
      null,
      createElement("span", { "data-testid": "margin" }, workspace.business.targetMarginPercent),
      createElement("button", { onClick: () => updateBusiness({ targetMarginPercent: 41 }) }, "Edit")
    );
  }

  it("a failed autosave shows a persistent visible error banner, and the in-memory edit is retained (not reverted)", async () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    render(createElement(WorkspaceProvider, null, createElement(Editor)));
    await waitFor(() => expect(screen.getByTestId("margin")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/wasn't saved/i);
    // The edit itself is still visible in-memory — it was never rolled back.
    expect(screen.getByTestId("margin")).toHaveTextContent("41");
  });

  it("clicking Retry save after the underlying problem clears re-saves successfully and dismisses the banner", async () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    render(createElement(WorkspaceProvider, null, createElement(Editor)));
    await waitFor(() => expect(screen.getByTestId("margin")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    await screen.findByRole("alert");

    spy.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: /retry save/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("warns before the page unloads while there's an unsaved (failed-to-save) change", async () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    render(createElement(WorkspaceProvider, null, createElement(Editor)));
    await waitFor(() => expect(screen.getByTestId("margin")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    await screen.findByRole("alert");

    const event = new Event("beforeunload", { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("does NOT warn before unload when there is no pending save failure", async () => {
    render(createElement(WorkspaceProvider, null, createElement(Editor)));
    await waitFor(() => expect(screen.getByTestId("margin")).toBeInTheDocument());

    const event = new Event("beforeunload", { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});
