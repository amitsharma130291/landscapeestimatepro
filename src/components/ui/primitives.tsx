import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

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
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-red ml-0.5" aria-hidden="true">*</span>}
      </label>
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
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
