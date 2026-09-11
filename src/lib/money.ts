/**
 * Exact-money utilities: integer minor units (cents), never floating-point
 * dollars, at every domain-layer boundary. This module is the ONLY place
 * that converts between a human-entered/displayed dollar string and the
 * integer-cents representation the rest of the domain layer uses.
 *
 * Every persisted monetary field in `types.ts` is `MoneyCents` — see that
 * file's `Material`, `Equipment`, `BusinessSettings`, `Project`,
 * `QuoteRevision`, and `ProjectActuals` interfaces. CSV export
 * (`estimateMath.ts`'s `buildProjectCsvRows`) converts to a plain decimal
 * dollar number only at that presentation boundary, never upstream of it.
 */
import Decimal from "decimal.js";

/** Integer number of cents. Branded so a plain `number` (dollars, or any
 * other unit) can't be passed where cents are expected without an explicit
 * cast — the type system won't stop a *deliberate* `as MoneyCents`, but it
 * stops silent accidental mixing through normal assignment/inference. */
export type MoneyCents = number & { readonly __brand: "MoneyCents" };

/**
 * A NORMALIZED 0–1 decimal rate (0.35, never 35) — the only shape a domain
 * pricing function may accept for a rate parameter. This app persists
 * percentages as whole numbers with an explicit `*Percent` suffix
 * (`targetMarginPercent: 35`, never a decimal fraction) — see the
 * `PercentValue` doc comment in `types.ts` for why. `DecimalRate` is the
 * OTHER end of that boundary: `calc.ts`'s `percentToFraction` is the only
 * function that produces one, converting a whole percent to a fraction
 * exactly once. Branding a `Decimal` instance (rather than a plain number or
 * string) means a caller cannot pass an un-converted `Decimal.js` value
 * (e.g. `new Decimal(35)`, still a whole percent) to a function that expects
 * an already-normalized rate without an explicit `as DecimalRate` — the
 * brand exists specifically to make "35 read as 0.35" or "0.35 read as 35%"
 * a type error, not a runtime bug.
 */
export type DecimalRate = Decimal & { readonly __brand: "DecimalRate" };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertSafeIntegerCents(value: number, context: string): MoneyCents {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${context}: not a finite number (${value}).`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${context}: not an integer number of cents (${value}) — round at an explicit boundary first.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${context}: exceeds Number.isSafeInteger — amount is too large to represent exactly (${value}).`);
  }
  return value as MoneyCents;
}

/** Zero, as a validated MoneyCents value — for defaults and accumulator seeds. */
export const ZERO_CENTS = 0 as MoneyCents;

/** Clamps a cents value to a safe, non-negative integer — NaN, Infinity,
 * negative, and non-integer (fractional-cent) inputs all become 0. This is
 * the financially-conservative "never explode, never go negative" guard for
 * money, mirroring calc.ts's `safe()` for plain quantities. Prefer
 * `fromDollarInputToCents`/`fromDecimalToCents` (which throw on malformed
 * input) at any real trust boundary; use `safe()` only for defensive
 * clamping deep inside a calculation where throwing would be disruptive. */
export function safe(cents: number): MoneyCents {
  if (!Number.isFinite(cents) || cents < 0 || !Number.isInteger(cents)) return ZERO_CENTS;
  if (!Number.isSafeInteger(cents)) return ZERO_CENTS;
  return cents as MoneyCents;
}

/**
 * Parses a human-entered dollar string/number (e.g. "42.40", 42.4, "-3") into
 * exact cents. Never uses `parseFloat` and continues in floating point —
 * Decimal.js parses the string once, and the only floating-point boundary is
 * the final, unavoidable `Number()` call to produce the safe-integer cents
 * result itself.
 *
 * Rounding rule: HALF-UP to the nearest cent (e.g. "0.005" → 1 cent,
 * "-0.005" → 0 cents per Decimal's default ROUND_HALF_UP, which rounds a
 * negative half-way value toward positive infinity — acceptable here since
 * money inputs are validated non-negative before this is called in
 * practice; a negative input is still parsed correctly, just documented as
 * "away from zero on the positive side" for the exact-half case).
 *
 * Throws MoneyError on malformed input (not a validation function — callers
 * needing a user-facing error message should validate the raw string first
 * with the validation.ts money rules, which return a message instead of
 * throwing).
 */
export function fromDollarInputToCents(input: string | number): MoneyCents {
  if (typeof input === "number" && !Number.isFinite(input)) {
    throw new MoneyError(`fromDollarInputToCents: not a finite number (${input}).`);
  }
  const raw = typeof input === "number" ? input.toString() : input.trim();
  if (raw === "" || raw === "-" || raw === ".") {
    throw new MoneyError(`fromDollarInputToCents: empty or malformed input (${JSON.stringify(input)}).`);
  }
  let decimal: Decimal;
  try {
    decimal = new Decimal(raw);
  } catch {
    throw new MoneyError(`fromDollarInputToCents: malformed numeric input (${JSON.stringify(input)}).`);
  }
  if (!decimal.isFinite()) {
    throw new MoneyError(`fromDollarInputToCents: not finite (${JSON.stringify(input)}).`);
  }
  const cents = decimal.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return assertSafeIntegerCents(cents.toNumber(), "fromDollarInputToCents");
}

/** Same as fromDollarInputToCents, but for a value ALREADY known to be a
 * Decimal (e.g. an intermediate calculation result) — the explicit rounding
 * boundary this module's contract requires before anything becomes cents. */
export function fromDecimalToCents(value: Decimal, roundingMode: typeof Decimal.ROUND_HALF_UP | typeof Decimal.ROUND_CEIL = Decimal.ROUND_HALF_UP): MoneyCents {
  const cents = value.toDecimalPlaces(0, roundingMode);
  return assertSafeIntegerCents(cents.toNumber(), "fromDecimalToCents");
}

/** Cents → an exact Decimal number of dollars, for further Decimal math
 * (e.g. multiplying by a quantity before converting back to cents). This is
 * NOT a formatting function — see formatCents for that. */
export function centsToDecimal(cents: MoneyCents): Decimal {
  return new Decimal(cents).dividedBy(100);
}

/** Presentation-layer only: cents → a formatted currency string. Never used
 * inside domain calculations — formatting must not feed back into math.
 * `opts.cents` forces two decimal places even for a whole-dollar amount
 * (named to match the pre-existing `formatCurrency(value, { cents: true })`
 * call sites this function replaces). */
export function formatCents(cents: MoneyCents | null, opts?: { cents?: boolean }): string {
  if (cents === null) return "—";
  const dollars = centsToDecimal(cents);
  const needsCents = opts?.cents || !dollars.isInteger();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: needsCents ? 2 : 0,
    maximumFractionDigits: needsCents ? 2 : 0,
  }).format(dollars.toNumber());
}

function assertFiniteCentsInput(cents: number, context: string): void {
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw new MoneyError(`${context}: expected an integer number of cents, got ${cents}.`);
  }
}

/** Exact integer addition of two cent amounts — plain `+` is safe here since
 * both operands are already validated integers and their sum is checked
 * against Number.isSafeInteger, but going through this function keeps every
 * cents arithmetic call visibly money-typed and centrally guarded. */
export function addCents(a: MoneyCents, b: MoneyCents): MoneyCents {
  assertFiniteCentsInput(a, "addCents(a)");
  assertFiniteCentsInput(b, "addCents(b)");
  return assertSafeIntegerCents(a + b, "addCents");
}

export function subtractCents(a: MoneyCents, b: MoneyCents): MoneyCents {
  assertFiniteCentsInput(a, "subtractCents(a)");
  assertFiniteCentsInput(b, "subtractCents(b)");
  return assertSafeIntegerCents(a - b, "subtractCents");
}

/** Sums any number of cent amounts (e.g. every line's direct cost) without
 * accumulating floating-point error — each addend is already an exact
 * integer, so plain summation is exact; this exists so a caller never has
 * to reach for `Array.prototype.reduce` with raw `+` on money by hand. */
export function sumCents(values: MoneyCents[]): MoneyCents {
  let total = 0;
  for (const v of values) {
    assertFiniteCentsInput(v, "sumCents");
    total += v;
  }
  return assertSafeIntegerCents(total, "sumCents");
}

/** cents × an integer quantity — exact, no rounding boundary needed since
 * both factors are already exact and quantities in this app are used as
 * plain multipliers (fractional quantities go through multiplyCentsByRate
 * instead, which documents its rounding). */
export function multiplyCentsByQuantity(cents: MoneyCents, quantity: number): MoneyCents {
  assertFiniteCentsInput(cents, "multiplyCentsByQuantity(cents)");
  if (!Number.isFinite(quantity)) throw new MoneyError(`multiplyCentsByQuantity: quantity is not finite (${quantity}).`);
  const result = new Decimal(cents).times(quantity);
  return fromDecimalToCents(result);
}

/** cents × a rate expressed as a Decimal fraction (e.g. 0.15 for 15%
 * overhead) — rounds HALF-UP to the nearest cent at this explicit boundary. */
export function multiplyCentsByRate(cents: MoneyCents, rate: Decimal | number): MoneyCents {
  assertFiniteCentsInput(cents, "multiplyCentsByRate(cents)");
  const rateDecimal = rate instanceof Decimal ? rate : new Decimal(rate);
  if (!rateDecimal.isFinite()) throw new MoneyError(`multiplyCentsByRate: rate is not finite (${rate}).`);
  return fromDecimalToCents(new Decimal(cents).times(rateDecimal));
}

/** cents ÷ a rate — used for e.g. "required price = true cost ÷ (1 −
 * margin)". Returns a Decimal (NOT rounded to cents) so the caller can chain
 * further math before rounding at its own explicit boundary — required
 * price must stay exact until the final ceiling-to-increment step. */
export function divideCentsByRate(cents: MoneyCents, rate: Decimal | number): Decimal {
  assertFiniteCentsInput(cents, "divideCentsByRate(cents)");
  const rateDecimal = rate instanceof Decimal ? rate : new Decimal(rate);
  if (!rateDecimal.isFinite()) throw new MoneyError(`divideCentsByRate: rate is not finite (${rate}).`);
  if (rateDecimal.isZero()) throw new MoneyError("divideCentsByRate: division by zero.");
  return new Decimal(cents).dividedBy(rateDecimal);
}

/**
 * Rounds a required price (in cents, as an exact Decimal — see
 * divideCentsByRate) UP to the nearest configured increment. Ceiling, never
 * nearest, never down — a required price is a floor; rounding it down or to
 * nearest can land below the price that was solved for and silently miss
 * the target margin.
 */
export function roundUpCentsToIncrement(exactCents: Decimal, incrementCents: MoneyCents): MoneyCents {
  assertFiniteCentsInput(incrementCents, "roundUpCentsToIncrement(incrementCents)");
  if (incrementCents <= 0) throw new MoneyError("roundUpCentsToIncrement: increment must be positive.");
  const increment = new Decimal(incrementCents);
  const roundedUp = exactCents.dividedBy(increment).ceil().times(increment);
  return fromDecimalToCents(roundedUp, Decimal.ROUND_CEIL);
}

/**
 * Splits `totalCents` across `weights` (one weight per line, e.g. each
 * line's direct cost) using the largest-remainder method: every line first
 * gets its floor share, then the leftover cents (always < number of lines)
 * are handed out one each, in order of largest fractional remainder, with a
 * caller-supplied stable tie-breaker for exact ties. Guarantees
 * `sum(result) === totalCents` exactly — no cent is created or lost — and
 * every result is a non-negative integer (when totalCents and every weight
 * are non-negative).
 *
 * `tieBreakerKeys[i]` must be unique and comparable (e.g. a line's id or its
 * index) — when two lines tie on remainder, the one with the
 * lexicographically smaller key receives the extra cent first, so the
 * outcome is deterministic and reproducible rather than dependent on
 * unspecified sort stability.
 */
export function allocateCents(totalCents: MoneyCents, weights: number[], tieBreakerKeys: string[]): MoneyCents[] {
  assertFiniteCentsInput(totalCents, "allocateCents(totalCents)");
  if (weights.length !== tieBreakerKeys.length) {
    throw new MoneyError("allocateCents: weights and tieBreakerKeys must be the same length.");
  }
  if (weights.length === 0) {
    if (totalCents !== 0) throw new MoneyError("allocateCents: no weights to allocate a non-zero total across.");
    return [];
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError("allocateCents: weights must be finite and non-negative.");
  }
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) {
    throw new MoneyError("allocateCents: total weight is zero — cannot allocate proportionally (caller must assign explicit line prices instead).");
  }

  const totalWeightDecimal = new Decimal(totalWeight);
  const exactShares = weights.map((w) => new Decimal(totalCents).times(w).dividedBy(totalWeightDecimal));
  const floorShares = exactShares.map((s) => s.floor());
  const remainders = exactShares.map((s, i) => s.minus(floorShares[i]));

  let allocated = floorShares.reduce((sum, s) => sum.plus(s), new Decimal(0));
  let leftover = new Decimal(totalCents).minus(allocated).toNumber();
  if (!Number.isInteger(leftover) || leftover < 0) {
    throw new MoneyError("allocateCents: internal invariant violated computing leftover cents.");
  }

  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      const remainderDiff = remainders[b].comparedTo(remainders[a]);
      if (remainderDiff !== 0) return remainderDiff;
      return tieBreakerKeys[a] < tieBreakerKeys[b] ? -1 : tieBreakerKeys[a] > tieBreakerKeys[b] ? 1 : 0;
    });

  const result = floorShares.map((s) => s.toNumber());
  for (let i = 0; i < leftover; i++) {
    result[order[i]] += 1;
  }

  const finalResult = result.map((v) => assertSafeIntegerCents(v, "allocateCents result"));
  const finalSum = sumCents(finalResult);
  if (finalSum !== totalCents) {
    throw new MoneyError(`allocateCents: internal invariant violated — allocated sum ${finalSum} !== total ${totalCents}.`);
  }
  return finalResult;
}
