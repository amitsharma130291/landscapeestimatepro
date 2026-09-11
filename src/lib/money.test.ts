import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  addCents,
  allocateCents,
  centsToDecimal,
  divideCentsByRate,
  formatCents,
  fromDollarInputToCents,
  MoneyError,
  multiplyCentsByQuantity,
  multiplyCentsByRate,
  roundUpCentsToIncrement,
  safe,
  sumCents,
  ZERO_CENTS,
  type MoneyCents,
} from "./money";

function cents(n: number): MoneyCents {
  return n as MoneyCents;
}

describe("safe", () => {
  it("clamps NaN, Infinity, and negative cents to zero", () => {
    expect(safe(NaN)).toBe(0);
    expect(safe(Infinity)).toBe(0);
    expect(safe(-Infinity)).toBe(0);
    expect(safe(-500)).toBe(0);
  });

  it("clamps a non-integer (fractional-cent) value to zero rather than rounding it", () => {
    expect(safe(42.5)).toBe(0);
  });

  it("clamps an unsafe-integer cents value to zero", () => {
    expect(safe(Number.MAX_SAFE_INTEGER + 2)).toBe(0);
  });

  it("passes through a valid non-negative integer cents value unchanged", () => {
    expect(safe(4876)).toBe(4876);
    expect(safe(0)).toBe(ZERO_CENTS);
  });
});

describe("fromDollarInputToCents", () => {
  it("REGRESSION: $0.10 + $0.20 is exactly 30 cents, not 30.000000000000004", () => {
    const a = fromDollarInputToCents("0.10");
    const b = fromDollarInputToCents("0.20");
    expect(addCents(a, b)).toBe(30);
  });

  it("converts whole dollars, cents, and large amounts exactly", () => {
    expect(fromDollarInputToCents("48.76")).toBe(4876);
    expect(fromDollarInputToCents("2849.70")).toBe(284970);
    expect(fromDollarInputToCents("4385")).toBe(438500);
    expect(fromDollarInputToCents("0")).toBe(0);
    expect(fromDollarInputToCents(0.01)).toBe(1);
  });

  it("rounds half-up at the sub-cent boundary", () => {
    expect(fromDollarInputToCents("1.005")).toBe(101); // half-up, not banker's rounding
  });

  it("accepts a plain number input identically to its string form", () => {
    expect(fromDollarInputToCents(42.4)).toBe(fromDollarInputToCents("42.40"));
  });

  it("rejects malformed strings rather than silently parsing part of them", () => {
    expect(() => fromDollarInputToCents("abc")).toThrow(MoneyError);
    expect(() => fromDollarInputToCents("12abc")).toThrow(MoneyError);
    expect(() => fromDollarInputToCents("")).toThrow(MoneyError);
    expect(() => fromDollarInputToCents("-")).toThrow(MoneyError);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => fromDollarInputToCents(NaN)).toThrow(MoneyError);
    expect(() => fromDollarInputToCents(Infinity)).toThrow(MoneyError);
    expect(() => fromDollarInputToCents(-Infinity)).toThrow(MoneyError);
  });

  it("rejects an amount whose cents value would not be a safe integer", () => {
    // Number.MAX_SAFE_INTEGER cents is roughly $90 trillion — well beyond any
    // real invoice, but the boundary must still be enforced.
    const tooLarge = (Number.MAX_SAFE_INTEGER + 1000).toString();
    expect(() => fromDollarInputToCents(tooLarge)).toThrow(MoneyError);
  });
});

describe("centsToDecimal / formatCents", () => {
  it("round-trips cents to a Decimal and back to a formatted string", () => {
    expect(centsToDecimal(cents(4876)).toString()).toBe("48.76");
    expect(formatCents(cents(438500))).toBe("$4,385");
    expect(formatCents(cents(4876))).toBe("$48.76");
  });

  it("formats null as an em dash, never $0", () => {
    expect(formatCents(null)).toBe("—");
  });

  it("never mutates or rounds the stored cents value — formatting is presentation-only", () => {
    const original = cents(123456);
    formatCents(original);
    expect(original).toBe(123456);
  });
});

describe("addCents / subtractCents / sumCents", () => {
  it("sums many amounts exactly", () => {
    const values = [cents(100), cents(250), cents(1), cents(99)];
    expect(sumCents(values)).toBe(450);
  });

  it("throws rather than silently wrapping on overflow past Number.isSafeInteger", () => {
    const huge = cents(Number.MAX_SAFE_INTEGER);
    expect(() => addCents(huge, cents(10))).toThrow(MoneyError);
  });
});

describe("multiplyCentsByQuantity / multiplyCentsByRate / divideCentsByRate", () => {
  it("multiplies cents by an integer quantity exactly", () => {
    expect(multiplyCentsByQuantity(cents(4200), 8)).toBe(33600); // 8 yd3 of $42.00 mulch
  });

  it("multiplies cents by a fractional quantity, rounding half-up at the boundary", () => {
    expect(multiplyCentsByQuantity(cents(3200), 0.45)).toBe(1440); // 0.45 hrs @ $32.00/hr = $14.40
  });

  it("multiplies cents by a rate (overhead example): $4,240 direct * 15% = $636 overhead", () => {
    expect(multiplyCentsByRate(cents(4240), new Decimal(0.15))).toBe(636);
  });

  it("divides cents by a rate and stays exact (unrounded) until an explicit boundary — assembly overhead example", () => {
    // direct cost $100.00, overhead 15% -> true cost $115.00, target margin 35%
    const trueCostCents = addCents(cents(10000), multiplyCentsByRate(cents(10000), new Decimal(0.15)));
    expect(trueCostCents).toBe(11500);
    const exactRequired = divideCentsByRate(trueCostCents, new Decimal(0.65));
    expect(exactRequired.toNumber()).toBeCloseTo(17692.307692, 4); // $176.923076... in cents
  });

  it("throws on division by a zero rate rather than producing Infinity", () => {
    expect(() => divideCentsByRate(cents(1000), 0)).toThrow(MoneyError);
  });
});

describe("roundUpCentsToIncrement", () => {
  it("rounds the Smith Residence example up to the next dollar", () => {
    // exact required price $4,384.153846... -> cents
    const exact = new Decimal("438415.3846");
    expect(roundUpCentsToIncrement(exact, cents(100))).toBe(438500); // $4,385.00
  });

  it("leaves an exact multiple unchanged", () => {
    expect(roundUpCentsToIncrement(new Decimal(50000), cents(500))).toBe(50000);
  });

  it("never rounds down, even by a fraction of a cent", () => {
    const justAbove = new Decimal("438500.001");
    const rounded = roundUpCentsToIncrement(justAbove, cents(100));
    expect(rounded).toBeGreaterThan(438500);
  });
});

describe("allocateCents — deterministic largest-remainder allocation", () => {
  it("splits evenly when the total divides evenly", () => {
    const result = allocateCents(cents(300), [1, 1, 1], ["a", "b", "c"]);
    expect(result).toEqual([100, 100, 100]);
    expect(sumCents(result)).toBe(300);
  });

  it("REGRESSION: sum of allocated cents always exactly equals the total, even when it doesn't divide evenly", () => {
    // $100.00 across three equal-weight lines: 10000 / 3 = 3333.33... each.
    const result = allocateCents(cents(10000), [1, 1, 1], ["line-a", "line-b", "line-c"]);
    expect(sumCents(result)).toBe(10000);
    // Two lines get 3334, one gets 3333 (or similar) - never a fraction, never lost.
    expect(result.every((v) => Number.isInteger(v))).toBe(true);
  });

  it("allocates proportionally to weight (direct-cost share)", () => {
    // Line A has 3x the direct cost of line B -> should receive ~3x the revenue.
    const result = allocateCents(cents(4000), [300, 100], ["a", "b"]);
    expect(result[0]).toBe(3000);
    expect(result[1]).toBe(1000);
    expect(sumCents(result)).toBe(4000);
  });

  it("tie-breaks deterministically by the supplied key, not by unspecified sort order", () => {
    // Three equal-weight lines splitting an amount with 2 leftover cents —
    // the same input must always produce the same output.
    const run1 = allocateCents(cents(101), [1, 1, 1], ["b", "a", "c"]);
    const run2 = allocateCents(cents(101), [1, 1, 1], ["b", "a", "c"]);
    expect(run1).toEqual(run2);
    expect(sumCents(run1)).toBe(101);
  });

  it("throws rather than dividing by zero when every weight is zero", () => {
    expect(() => allocateCents(cents(500), [0, 0], ["a", "b"])).toThrow(MoneyError);
  });

  it("handles a single line by giving it everything", () => {
    expect(allocateCents(cents(12345), [1], ["only"])).toEqual([12345]);
  });
});
