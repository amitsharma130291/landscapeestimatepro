import { describe, expect, it } from "vitest";
import { resolveDraftCommit, resolveDraftDisplay } from "./draftNumberInputLogic";
import { validateCrewSize, validateProductionRate, validateQuantity, validateTargetMarginPercent } from "./validation";

describe("resolveDraftCommit / resolveDraftDisplay — DraftNumberInput's draft/validate/commit boundary (non-money fields)", () => {
  it("no draft (field never edited) never commits", () => {
    expect(resolveDraftCommit(null, validateQuantity)).toEqual({ commit: false });
  });

  it("a valid value commits exactly, parsed via Number() — never parseFloat's lenient prefix parsing", () => {
    expect(resolveDraftCommit("3.2", validateQuantity)).toEqual({ commit: true, value: 3.2 });
    // parseFloat("12abc") would be 12 — Number("12abc") is NaN, so this must be rejected, not silently truncated.
    expect(resolveDraftCommit("12abc", validateQuantity)).toEqual({ commit: false });
  });

  it("malformed text is rejected — never committed, never coerced to zero", () => {
    expect(resolveDraftDisplay("abc", 5, validateQuantity).error).not.toBeNull();
    expect(resolveDraftCommit("abc", validateQuantity)).toEqual({ commit: false });
  });

  it("NaN/Infinity-equivalent text is rejected — never committed, never coerced to zero", () => {
    for (const bad of ["NaN", "Infinity", "-Infinity"]) {
      expect(resolveDraftDisplay(bad, 5, validateQuantity).error).not.toBeNull();
      expect(resolveDraftCommit(bad, validateQuantity)).toEqual({ commit: false });
    }
  });

  it("a value the field's own validator rejects (e.g. a negative quantity) is discarded, never committed, never clamped to zero", () => {
    expect(resolveDraftDisplay("-3", 5, validateQuantity).error).toBe("Quantity can't be negative.");
    expect(resolveDraftCommit("-3", validateQuantity)).toEqual({ commit: false });
  });

  it("REGRESSION: crew size of 0 is rejected by validateCrewSize (must be >=1) — discarded, never committed as 0", () => {
    expect(resolveDraftDisplay("0", 3, validateCrewSize).error).toBe("Crew size must be at least 1.");
    expect(resolveDraftCommit("0", validateCrewSize)).toEqual({ commit: false });
  });

  it("REGRESSION: a production rate of 0 is rejected by validateProductionRate (must be >0) — discarded, never committed as 0", () => {
    expect(resolveDraftDisplay("0", 2.5, validateProductionRate).error).not.toBeNull();
    expect(resolveDraftCommit("0", validateProductionRate)).toEqual({ commit: false });
  });

  it("REGRESSION: a target margin of exactly 100 is rejected — discarded, never committed", () => {
    expect(resolveDraftCommit("100", validateTargetMarginPercent)).toEqual({ commit: false });
  });

  it("REGRESSION: after a rejected commit, the display falls back to the last PERSISTED value, never zero", () => {
    const persisted = 8; // the value before this edit
    const commit = resolveDraftCommit("-1", validateQuantity);
    expect(commit.commit).toBe(false);
    // DraftNumberInput's own commit() handler, on a rejected commit, resets
    // its local draft state to null — simulate that and confirm the display
    // reverts to the untouched persisted value, not 0 and not "-1".
    const displayAfterDiscard = resolveDraftDisplay(null, persisted, validateQuantity);
    expect(displayAfterDiscard).toEqual({ display: "8", error: null });
  });

  it("clearing the field entirely (empty draft) is a deliberate, valid commit of \"\" — the caller decides what \"\" persists as (0 for a quantity, undefined for an optional rate)", () => {
    expect(resolveDraftDisplay("", 8, validateQuantity).error).toBeNull();
    expect(resolveDraftCommit("", validateQuantity)).toEqual({ commit: true, value: "" });
    expect(resolveDraftCommit("   ", validateQuantity)).toEqual({ commit: true, value: "" });
  });

  it("while there IS a draft, the display shows exactly what the user typed — never silently reformatted before commit", () => {
    expect(resolveDraftDisplay("3", 0, validateQuantity).display).toBe("3");
    expect(resolveDraftDisplay("3.", 0, validateQuantity).display).toBe("3.");
    expect(resolveDraftDisplay("garbage", 0, validateQuantity).display).toBe("garbage");
  });

  it("with no draft, the display is derived from the persisted value", () => {
    expect(resolveDraftDisplay(null, 4, validateQuantity).display).toBe("4");
    expect(resolveDraftDisplay(null, 0.4, validateQuantity).display).toBe("0.4");
    expect(resolveDraftDisplay(null, "", validateQuantity).display).toBe("");
  });

  it("an incomplete decimal ('3.') mid-edit is a valid intermediate draft that DOES commit on blur, since Number('3.') is a finite 3", () => {
    expect(resolveDraftDisplay("3.", 0, validateQuantity).error).toBeNull();
    expect(resolveDraftCommit("3.", validateQuantity)).toEqual({ commit: true, value: 3 });
  });
});
