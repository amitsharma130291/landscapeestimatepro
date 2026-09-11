import { describe, expect, it } from "vitest";
import { resolveMoneyCommit, resolveMoneyDraftDisplay } from "./moneyInputLogic";
import type { MoneyCents } from "./money";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

describe("resolveMoneyCommit / resolveMoneyDraftDisplay — MoneyInput's draft/validate/commit boundary", () => {
  it("no draft (field never edited) never commits — the persisted value is untouched", () => {
    expect(resolveMoneyCommit(null)).toEqual({ commit: false });
  });

  it("an incomplete decimal ('45.') mid-edit is a valid intermediate draft, and DOES commit on blur to the whole-cent amount it represents", () => {
    // Decimal.js parses a trailing dot as the whole number — the user
    // tabbing away after typing "45." reasonably means $45.00, not an error.
    const display = resolveMoneyDraftDisplay("45.", cents(0));
    expect(display.error).toBeNull();
    const commit = resolveMoneyCommit("45.");
    expect(commit).toEqual({ commit: true, cents: 4500 });
  });

  it("malformed text ('abc', 'twelve dollars') is rejected — never committed, never coerced to zero", () => {
    expect(resolveMoneyDraftDisplay("abc", cents(0)).error).not.toBeNull();
    expect(resolveMoneyCommit("abc")).toEqual({ commit: false });

    expect(resolveMoneyDraftDisplay("twelve dollars", cents(0)).error).not.toBeNull();
    expect(resolveMoneyCommit("twelve dollars")).toEqual({ commit: false });
  });

  it("a negative amount ('-5') is rejected — never committed, never coerced to zero or made positive", () => {
    expect(resolveMoneyDraftDisplay("-5", cents(0)).error).toBe("Amount can't be negative.");
    expect(resolveMoneyCommit("-5")).toEqual({ commit: false });
  });

  it("NaN/Infinity-equivalent text is rejected — never committed, never coerced to zero", () => {
    for (const bad of ["NaN", "Infinity", "-Infinity"]) {
      expect(resolveMoneyDraftDisplay(bad, cents(0)).error).not.toBeNull();
      expect(resolveMoneyCommit(bad)).toEqual({ commit: false });
    }
  });

  it("REGRESSION: after a rejected (malformed) commit, the display falls back to the LAST PERSISTED value, never zero — this is what MoneyInput does by calling resolveMoneyDraftDisplay(null, persistedCents) once it discards the bad draft", () => {
    const persisted = cents(4200); // $42.00, the value before this edit
    const commit = resolveMoneyCommit("garbage");
    expect(commit.commit).toBe(false);
    // MoneyInput's own onBlur/onKeyDown handler, on a rejected commit, resets
    // its local draft state to null — simulate that and confirm the display
    // reverts to the untouched persisted amount, not 0 and not "garbage".
    const displayAfterDiscard = resolveMoneyDraftDisplay(null, persisted);
    expect(displayAfterDiscard).toEqual({ display: "42", error: null });
  });

  it("entering a valid replacement commits it exactly, in cents, via Decimal.js (not float multiplication)", () => {
    expect(resolveMoneyCommit("45.50")).toEqual({ commit: true, cents: 4550 });
    expect(resolveMoneyCommit("1.005")).toEqual({ commit: true, cents: 101 }); // half-up, same rule as everywhere else
    expect(resolveMoneyCommit("0")).toEqual({ commit: true, cents: 0 });
  });

  it("clearing the field entirely (empty draft) is a deliberate, valid commit of \"\" — not an error, not a malformed value coerced to zero by THIS function (the caller decides what \"\" persists as, same as every other NumberInput-backed field)", () => {
    expect(resolveMoneyDraftDisplay("", cents(4200)).error).toBeNull();
    expect(resolveMoneyCommit("")).toEqual({ commit: true, cents: "" });
    expect(resolveMoneyCommit("   ")).toEqual({ commit: true, cents: "" });
  });

  it("while there IS a draft, the display shows exactly what the user typed — never silently reformatted or reverted before commit", () => {
    expect(resolveMoneyDraftDisplay("45", cents(9999)).display).toBe("45");
    expect(resolveMoneyDraftDisplay("45.", cents(9999)).display).toBe("45.");
    expect(resolveMoneyDraftDisplay("garbage", cents(9999)).display).toBe("garbage");
  });

  it("with no draft, the display is derived from the persisted cents value, in dollars", () => {
    expect(resolveMoneyDraftDisplay(null, cents(4200)).display).toBe("42");
    expect(resolveMoneyDraftDisplay(null, cents(4550)).display).toBe("45.5");
    expect(resolveMoneyDraftDisplay(null, "").display).toBe("");
  });

  it("a value so large it exceeds a safe-integer cents amount is rejected, not silently overflowed or truncated", () => {
    const huge = (Number.MAX_SAFE_INTEGER + 1000).toString();
    expect(resolveMoneyDraftDisplay(huge, cents(0)).error).not.toBeNull();
    expect(resolveMoneyCommit(huge)).toEqual({ commit: false });
  });
});
