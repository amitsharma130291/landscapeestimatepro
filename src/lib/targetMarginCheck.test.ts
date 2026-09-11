import { describe, expect, it } from "vitest";
import { evaluateQuoteAgainstTarget } from "./estimateMath";
import type { MoneyCents } from "./money";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

describe("evaluateQuoteAgainstTarget", () => {
  it("is not below target when the actual price meets or exceeds the required price for the target margin", () => {
    // trueCost=1000, required price for 35% margin = 1000 / 0.65 ≈ 1538.46 -> chain would round; use a clean example instead
    const check = evaluateQuoteAgainstTarget(cents(2000), cents(1000), cents(1539), 35);
    expect(check.isBelowTarget).toBe(false);
    expect(check.shortfallCents).toBeNull();
    expect(check.achievedMargin).toBe(50); // (2000-1000)/2000
  });

  it("flags a materially under-target price with the exact dollar shortfall and margin gap", () => {
    // trueCost=1000, required price for 35% margin ≈ 1539, actual charged = 1200 (well under)
    const check = evaluateQuoteAgainstTarget(cents(1200), cents(1000), cents(1539), 35);
    expect(check.isBelowTarget).toBe(true);
    expect(check.shortfallCents).toBe(339); // 1539 - 1200
    expect(check.achievedMargin).toBeCloseTo((1200 - 1000) / 1200 * 100, 5);
    expect(check.marginPointsShort).not.toBeNull();
    expect(check.marginPointsShort as number).toBeGreaterThan(0);
  });

  it("never blocks — it only ever reports, so a contractor can still charge below target on purpose", () => {
    const check = evaluateQuoteAgainstTarget(cents(500), cents(1000), cents(1539), 35);
    // Even a price BELOW true cost (negative margin) is reported, never thrown/blocked.
    expect(check.isBelowTarget).toBe(true);
    expect(check.achievedMargin).toBeLessThan(0);
  });

  it("returns not-below-target when there isn't enough data to compare (no required price available)", () => {
    const check = evaluateQuoteAgainstTarget(cents(1200), cents(1000), null, 35);
    expect(check.isBelowTarget).toBe(false);
    expect(check.shortfallCents).toBeNull();
  });

  it("treats an exact match at the target margin as not below target (no off-by-one rounding false alarm)", () => {
    // trueCost=650, price=1000 -> margin exactly 35%
    const check = evaluateQuoteAgainstTarget(cents(1000), cents(650), cents(1000), 35);
    expect(check.achievedMargin).toBe(35);
    expect(check.isBelowTarget).toBe(false);
  });
});
