/**
 * Phase 2 (touch targets): guards the shared `.tap-target` CSS contract
 * itself — this can't run in jsdom (no real pseudo-element layout), so it
 * asserts the actual CSS source defines the intended shape: at least 44px
 * in each dimension, centered via a pseudo-element rather than growing the
 * control's own visible box. Real rendered-geometry verification (that a
 * button using this class actually measures >=44px on screen) lives in the
 * Playwright suite (tests/e2e/touch-targets.spec.ts), which can compute
 * real layout.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/styles/global.css"), "utf-8");

function extractRule(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `expected to find a "${selector}" rule in global.css`).toBeGreaterThan(-1);
  const braceStart = css.indexOf("{", start);
  const braceEnd = css.indexOf("}", braceStart);
  return css.slice(braceStart, braceEnd + 1);
}

describe("shared .tap-target touch-target contract (Phase 2)", () => {
  it("makes the control a positioning context for its hit-area pseudo-element", () => {
    expect(extractRule(".tap-target {")).toMatch(/position:\s*relative/);
  });

  it("the ::after hit area is at least 44px in both dimensions via max(), never smaller than the control", () => {
    const rule = extractRule(".tap-target::after {");
    expect(rule).toMatch(/width:\s*max\(44px,\s*100%\)/);
    expect(rule).toMatch(/height:\s*max\(44px,\s*100%\)/);
  });

  it("the hit area is centered on the control (not offset toward one edge, which could bias overlap onto one neighbor)", () => {
    const rule = extractRule(".tap-target::after {");
    expect(rule).toMatch(/top:\s*50%/);
    expect(rule).toMatch(/left:\s*50%/);
    expect(rule).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
  });

  it("is invisible (no visible fill/border) — a hit-area expansion, not a new visible affordance", () => {
    const rule = extractRule(".tap-target::after {");
    expect(rule).not.toMatch(/background|border|box-shadow/);
  });
});

describe("shared .table-scroll contract (Phase 12) — a wide table scrolls in place, never the page", () => {
  it("provides horizontal scrolling for its own content", () => {
    expect(extractRule(".table-scroll {")).toMatch(/overflow-x:\s*auto/);
  });

  it("establishes a real layout containment boundary — confirmed live to be the actual fix (overflow-x:auto alone left a 129px phantom page-scroll on a 320px viewport; contain:layout closed it)", () => {
    expect(extractRule(".table-scroll {")).toMatch(/contain:\s*layout/);
  });
});
