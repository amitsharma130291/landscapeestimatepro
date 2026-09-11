import { useId, useState, type ButtonHTMLAttributes, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { resolveDraftCommit, resolveDraftDisplay } from "../../lib/draftNumberInputLogic";
import type { MoneyCents } from "../../lib/money";
import { resolveMoneyCommit, resolveMoneyDraftDisplay } from "../../lib/moneyInputLogic";

// -- Card -------------------------------------------------------------------

export function Card({
  children,
  className = "",
  padded = true,
  tone = "light",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** "light" (default): white surface, dark text. "dark": forest surface, white
   * text — used for financial-result summaries. Kept as a fixed enum (rather
   * than accepting an arbitrary bg-* class through `className`) because two
   * same-specificity Tailwind utilities (e.g. bg-white and bg-forest) don't
   * reliably override by attribute order — only one enum's classes are ever
   * emitted at a time, so there's nothing to conflict with. */
  tone?: "light" | "dark";
}) {
  const toneClasses = tone === "dark" ? "bg-forest text-white border-forest-light" : "bg-white text-ink border-border";
  return (
    <div className={`rounded-2xl border shadow-sm ${toneClasses} ${padded ? "p-5 sm:p-6" : ""} ${className}`}>
      {children}
    </div>
  );
}

// -- Field wrapper (label + control + hint/error) ----------------------------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  labelExtra,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Optional content rendered right after the label text (e.g. a
   * `HelpTooltip`) — kept as a sibling of the `<label>` rather than nested
   * inside it, so a click on it never also triggers the label's own
   * "focus the associated control" behavior. Purely additive: omitted,
   * this renders identically to before. */
  labelExtra?: ReactNode;
  children: ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
          {label}
          {required && <span className="text-red ml-0.5" aria-hidden="true">*</span>}
        </label>
        {labelExtra}
      </div>
      {children}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red">
          {error}
        </p>
      )}
    </div>
  );
}

const baseControlClasses =
  "block w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-lime-surface focus:border-lime-surface transition-colors";

export function TextInput({
  className = "",
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={`${baseControlClasses} ${invalid ? "border-red focus:ring-red focus:border-red" : ""} ${className}`}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

/** Numeric input that displays an empty string while cleared, rather than
 * forcing a misleading "0" — clearing a field is not the same as typing 0. */
export function NumberInput({
  value,
  onValueChange,
  className = "",
  invalid,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | "";
  onValueChange: (value: number | "") => void;
  invalid?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className={`${baseControlClasses} text-right tabular-nums ${invalid ? "border-red focus:ring-red focus:border-red" : ""} ${className}`}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onValueChange("");
          return;
        }
        if (!/^-?\d*\.?\d*$/.test(raw)) return;
        const parsed = Number(raw);
        onValueChange(Number.isNaN(parsed) ? "" : parsed);
      }}
      {...props}
    />
  );
}

/**
 * Draft/validate/commit numeric input — the non-money counterpart to
 * `MoneyInput`, for every OTHER domain-critical numeric field (production
 * rate, person-hours-per-unit, quantities, equipment usage, crew size,
 * crew-duration hours, overhead %, target margin %, tax %). Unlike plain
 * `NumberInput`, this does NOT call `onValueChange` on every keystroke —
 * everything typed lives in local draft state until the field is blurred or
 * Enter is pressed, at which point the draft is validated (via the required
 * `validate` prop — reuse the field-level validators in `lib/validation.ts`)
 * and either committed exactly or discarded, reverting the display to the
 * last persisted value. An invalid or incomplete draft can never reach
 * persisted workspace state, a backup, a quote revision, a PDF, or a CSV
 * export. See `lib/draftNumberInputLogic.ts` for the underlying pure rules
 * and their tests.
 *
 * Reach for a plain `NumberInput` only for a field that's genuinely
 * low-stakes (e.g. already behind its own explicit-save step, like
 * `ActualsTab`'s per-line actual quantity/hours, which only ever reach
 * workspace state when "Save actuals" is clicked).
 */
export function DraftNumberInput({
  id,
  value,
  onValueChange,
  onCommit,
  validate,
  className = "",
  invalid,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | "";
  onValueChange: (value: number | "") => void;
  /** Fires with the freshly-committed value right when a valid commit
   * happens (blur/Enter) — use this instead of reading `value` inside a
   * plain `onBlur` handler, which would still see the pre-commit value
   * (React state updates from `onValueChange` haven't been applied to the
   * caller's props yet at that point in the same event). */
  onCommit?: (value: number | "") => void;
  /** Returns an error message for an invalid parsed value, or `null` when
   * valid — e.g. `validateQuantity`, `validateCrewSize`,
   * `validateOverheadPercent` from `lib/validation.ts`. Required, not
   * optional, so every use of this component makes a deliberate choice
   * about what "valid" means for that field. */
  validate: (n: number) => string | null;
  invalid?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [draft, setDraft] = useState<string | null>(null);
  const { display, error } = resolveDraftDisplay(draft, value, validate);

  function commit() {
    if (draft === null) return;
    const result = resolveDraftCommit(draft, validate);
    if (result.commit) {
      onValueChange(result.value);
      onCommit?.(result.value);
    }
    // Whether committed or discarded, the draft is done — the field goes
    // back to reflecting persisted state (the just-committed value, or the
    // prior one if the draft was invalid).
    setDraft(null);
  }

  return (
    <div>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        className={`${baseControlClasses} text-right tabular-nums ${invalid || error ? "border-red focus:ring-red focus:border-red" : ""} ${className}`}
        value={display}
        aria-invalid={invalid || Boolean(error) || undefined}
        onChange={(e) => {
          const raw = e.target.value;
          // Same character allowlist as NumberInput — reject anything that
          // could never be part of a valid amount, but otherwise keep
          // whatever the user typed as free-text draft, unvalidated until
          // commit.
          if (!/^-?\d*\.?\d*$/.test(raw)) return;
          setDraft(raw);
        }}
        onFocus={(e: FocusEvent<HTMLInputElement>) => onFocus?.(e)}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            commit();
          }
          onKeyDown?.(e);
        }}
        {...props}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Dollar-display / cents-storage adapter over a free-text input — every
 * money field in the app should use this rather than a plain `NumberInput`,
 * so a contractor always types and reads dollars while the app only ever
 * stores `MoneyCents`.
 *
 * Persistence boundary: while the field has focus, everything the user
 * types lives ONLY in local draft state — `onValueCentsChange` (always
 * wired straight to a workspace mutator by the caller) is never called on
 * a keystroke, so an in-progress or invalid edit can never reach saved
 * workspace state, a backup, or an export. The draft commits — converting
 * to exact cents via Decimal.js — only on blur, on Enter, or when the
 * component is told to `commit()` some other way a caller wires up. An
 * incomplete or malformed draft (non-numeric text, a negative amount,
 * NaN/Infinity) is discarded on commit and the field reverts to showing the
 * last valid PERSISTED value — never coerced to zero, never left showing
 * garbage. See `lib/moneyInputLogic.ts` for the underlying pure rules and
 * their tests.
 */
export function MoneyInput({
  id,
  valueCents,
  onValueCentsChange,
  onCommit,
  className = "",
  invalid,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  valueCents: MoneyCents | "";
  onValueCentsChange: (value: MoneyCents | "") => void;
  /** Fires with the freshly-committed cents value right when a valid commit
   * happens (blur/Enter) — use this instead of reading `valueCents` inside
   * a plain `onBlur` handler, which would still see the value from BEFORE
   * this commit (React state updates from `onValueCentsChange` haven't been
   * applied to the caller's props yet at that point in the same event). */
  onCommit?: (value: MoneyCents | "") => void;
  invalid?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [draft, setDraft] = useState<string | null>(null);
  const { display, error } = resolveMoneyDraftDisplay(draft, valueCents);

  function commit() {
    if (draft === null) return;
    const result = resolveMoneyCommit(draft);
    if (result.commit) {
      onValueCentsChange(result.cents);
      onCommit?.(result.cents);
    }
    // Whether committed or discarded, the draft is done — the field goes
    // back to reflecting persisted state (the just-committed value, or the
    // prior one if the draft was invalid).
    setDraft(null);
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        className={`${baseControlClasses} pl-7 text-right tabular-nums ${invalid || error ? "border-red focus:ring-red focus:border-red" : ""} ${className}`}
        value={display}
        aria-invalid={invalid || Boolean(error) || undefined}
        onChange={(e) => {
          const raw = e.target.value;
          // Same character allowlist as NumberInput — reject anything that
          // could never be part of a valid amount, but otherwise keep
          // whatever the user typed as free-text draft, unvalidated until
          // commit (an in-progress "45." or "-" must stay visible, not be
          // silently reformatted mid-edit).
          if (!/^-?\d*\.?\d*$/.test(raw)) return;
          setDraft(raw);
        }}
        onFocus={(e: FocusEvent<HTMLInputElement>) => onFocus?.(e)}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            commit();
          }
          onKeyDown?.(e);
        }}
        {...props}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red">
          {error}
        </p>
      )}
    </div>
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${baseControlClasses} pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

// -- Unit input: number + trailing unit label --------------------------------

export function UnitInput({
  value,
  onValueChange,
  unit,
  id,
  invalid,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id"> & {
  value: number | "";
  onValueChange: (value: number | "") => void;
  unit: string;
  id: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <NumberInput id={id} value={value} onValueChange={onValueChange} invalid={invalid} className="pr-16" {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
        {unit}
      </span>
    </div>
  );
}

// -- Button -------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-lime text-lime-ink hover:bg-[#d9ff5e] focus-visible:ring-forest",
  secondary: "bg-forest text-white hover:bg-forest-light focus-visible:ring-lime",
  ghost: "bg-transparent text-forest border border-border hover:bg-paper-dim",
  danger: "bg-red text-white hover:bg-[#9c2a22]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3.5 py-2 text-sm min-h-[40px]",
  md: "px-5 py-3 text-[15px] min-h-[44px]",
  lg: "px-7 py-4 text-base min-h-[52px]",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      // `tap-target` is a no-op once a button is already >=44px in both
      // dimensions (size="md"/"lg") — it only actually expands anything for
      // the compact size="sm" buttons used throughout the app (40px tall),
      // so every Button call site gets a real 44px hit area without a
      // single one of them growing visually.
      className={`tap-target inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// -- Badge / status chip --------------------------------------------------------

type BadgeTone = "neutral" | "mint" | "amber" | "red" | "lime";

const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: "bg-paper-dim text-ink",
  mint: "bg-mint text-mint-ink",
  amber: "bg-amber-light text-amber",
  red: "bg-red-light text-red",
  lime: "bg-lime text-lime-ink",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${badgeToneClasses[tone]}`}>
      {children}
    </span>
  );
}

// -- Stat tile ------------------------------------------------------------------

export function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "positive" | "warning";
}) {
  const toneClasses =
    tone === "positive" ? "text-mint-ink" : tone === "warning" ? "text-amber" : "text-ink";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${toneClasses}`}>{value}</p>
    </div>
  );
}

// -- Empty state ------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-paper-dim px-6 py-12 text-center">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
