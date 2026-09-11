/**
 * The pure draft/validate/commit logic behind `DraftNumberInput`
 * (`components/ui/primitives.tsx`) — the same boundary `MoneyInput` enforces
 * (see `moneyInputLogic.ts`), generalized to every OTHER domain-critical
 * numeric field: production rate, person-hours-per-unit, quantities,
 * equipment usage, crew size, crew duration hours, overhead %, target
 * margin %, tax %. Extracted so the exact commit rule is unit-testable
 * without a DOM harness (this repo has none).
 *
 * The contract is identical to MoneyInput's: while a field is being edited,
 * the typed text lives ONLY in local component draft state — the
 * `onValueChange` prop (always wired straight to a workspace mutator by the
 * caller) is never invoked on a keystroke. A value commits only when the
 * draft is valid AND the field is blurred, Enter is pressed, or an explicit
 * save action fires. An invalid or incomplete draft is discarded on commit,
 * reverting the field to the last valid persisted value — never coerced to
 * zero, never parsed with `parseFloat` (which silently truncates trailing
 * garbage, e.g. `parseFloat("12abc") === 12`) and never written to the
 * workspace, so it can never reach a backup, a quote revision, a PDF, or a
 * CSV export either.
 */

export interface DraftDisplay {
  display: string;
  error: string | null;
}

/**
 * What a `DraftNumberInput` should currently show, and what error (if any)
 * to display. `validate` receives the PARSED number and returns a message
 * or `null` — the same field-level validators already used elsewhere in
 * this app (`validateQuantity`, `validateCrewSize`, `validateElapsedHours`,
 * `validatePersonHoursPerUnit`, `validateProductionRate`,
 * `validateOverheadPercent`, `validateTargetMarginPercent`,
 * `validateTaxRatePercent`), so the exact same rule governs a field whether
 * it's being typed right now or already persisted.
 */
export function resolveDraftDisplay(draft: string | null, persisted: number | "", validate: (n: number) => string | null): DraftDisplay {
  if (draft !== null) {
    const trimmed = draft.trim();
    // An empty draft is a deliberate "I'm clearing this field" state, same
    // as every NumberInput-backed field in this app — not yet an error to
    // nag about; `resolveDraftCommit` treats it as a valid clear.
    if (trimmed === "") return { display: draft, error: null };
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return { display: draft, error: "Enter a valid number." };
    return { display: draft, error: validate(parsed) };
  }
  return { display: persisted === "" ? "" : String(persisted), error: null };
}

export type DraftCommitResult = { commit: true; value: number | "" } | { commit: false };

/**
 * What committing the current draft (blur, Enter, or an explicit save)
 * should do:
 *  - no draft to commit (never edited) -> do nothing.
 *  - an empty draft (deliberately cleared) -> commit an explicit "" — the
 *    caller decides what "cleared" persists as (0 for a quantity, `undefined`
 *    for an optional field like a production rate), same as every other
 *    NumberInput-backed field already does at its own call site.
 *  - a valid, non-blank, finite number that passes `validate` -> commit it
 *    exactly, via `Number(trimmed)` (never `parseFloat`, which would accept
 *    "12abc" as 12 and silently discard the rest).
 *  - anything else (non-numeric text, NaN/Infinity, or a value `validate`
 *    rejects — negative where not allowed, zero where a positive value is
 *    required, ≥100% margin, etc.) -> DISCARD the draft. Nothing commits, so
 *    the caller falls back to the last persisted value — never coerced to
 *    zero and never written to the workspace.
 */
export function resolveDraftCommit(draft: string | null, validate: (n: number) => string | null): DraftCommitResult {
  if (draft === null) return { commit: false };
  const trimmed = draft.trim();
  if (trimmed === "") return { commit: true, value: "" };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { commit: false };
  if (validate(parsed)) return { commit: false };
  return { commit: true, value: parsed };
}
