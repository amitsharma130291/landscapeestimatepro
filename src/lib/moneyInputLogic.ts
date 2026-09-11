/**
 * The pure draft/validate/commit logic behind `MoneyInput`
 * (`components/ui/primitives.tsx`), extracted so it's testable without a DOM
 * — this repo has no React component-test harness, so the exact rule that
 * decides "does this keystroke ever reach persisted workspace state" lives
 * here, in plain functions, rather than only inside JSX event handlers.
 *
 * The contract: while a field is being edited, whatever the user has typed
 * lives ONLY in local component draft state — `MoneyInput` never calls its
 * `onValueCentsChange` prop (which is always wired straight to a workspace
 * mutator) on every keystroke. A value is committed to the workspace only
 * when the draft is valid AND the field is blurred, Enter is pressed, or an
 * explicit save action fires. An invalid or incomplete draft is discarded on
 * commit, reverting the field to the last valid persisted value — never
 * coerced to zero, and never written to the workspace (so it can never reach
 * a backup or export either).
 */
import { centsToDecimal, fromDollarInputToCents, type MoneyCents } from "./money";
import { validateDollarInput } from "./validation";

/** What a `MoneyInput` should currently show, and what error (if any) to
 * display alongside it. While `draft` is non-null (the field has been
 * edited and not yet committed), the draft text is shown verbatim, with its
 * own validation message. Once there's no draft, the field shows the
 * persisted value, converted to a plain dollar string — never re-derived
 * from anything the user typed but didn't commit. */
export interface MoneyDraftDisplay {
  display: string;
  error: string | null;
}

export function resolveMoneyDraftDisplay(draft: string | null, persistedCents: MoneyCents | ""): MoneyDraftDisplay {
  if (draft !== null) {
    // An empty draft is a deliberate "I'm clearing this field" state, same
    // as every other NumberInput-backed field in this app — not yet an
    // error to nag about; `resolveMoneyCommit` treats it as a valid clear.
    const error = draft.trim() === "" ? null : validateDollarInput(draft);
    return { display: draft, error };
  }
  return { display: persistedCents === "" ? "" : centsToDecimal(persistedCents).toString(), error: null };
}

/**
 * What committing the current draft (on blur, Enter, or an explicit save)
 * should do. Three outcomes, and only three:
 *  - no draft to commit (the field was never edited) -> do nothing.
 *  - an empty draft (the user cleared the field) -> commit an explicit ""
 *    (the caller decides what "cleared" persists as, same as any other
 *    NumberInput-backed field in this app — this function never invents a
 *    dollar amount for "the user cleared it").
 *  - a valid, non-blank draft -> commit the exact cents it represents.
 *  - anything else (malformed text, a negative amount, NaN/Infinity — any
 *    string `validateDollarInput` rejects) -> DISCARD the draft. Nothing is
 *    committed, so the caller must fall back to displaying the last
 *    persisted value — the malformed keystroke is dropped, never coerced to
 *    zero and never written to the workspace.
 */
export type MoneyCommitResult = { commit: true; cents: MoneyCents | "" } | { commit: false };

export function resolveMoneyCommit(draft: string | null): MoneyCommitResult {
  if (draft === null) return { commit: false };
  const trimmed = draft.trim();
  if (trimmed === "") return { commit: true, cents: "" };
  if (validateDollarInput(trimmed)) return { commit: false };
  return { commit: true, cents: fromDollarInputToCents(trimmed) };
}
