import { HelpCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Click/tap-triggered "toggletip" — a small "?" icon button that reveals a
 * short plain-language explanation next to a label, control, or value.
 *
 * Built for Phase 6 (help system) to explain the app's pricing vocabulary
 * (loaded labor rate, target margin, true job cost, etc.) without EVER being
 * the only place a real validation error or constraint is stated — this
 * component is for context only; inline `role="alert"` error text from
 * `Field`/`DraftNumberInput`/`MoneyInput` must always remain as-is alongside
 * it. See `src/lib/validation.ts` for where those real constraints live.
 *
 * Deliberately NOT a CSS `:hover`/`title` tooltip — those never work on
 * touchscreens and aren't reliably announced by screen readers. Instead this
 * is a real, focusable `<button>` that:
 *  - opens on click/tap AND on Enter/Space while focused (keyboard-only, no
 *    mouse required)
 *  - closes on Escape (returning focus to the trigger) or on an outside
 *    click/tap
 *  - exposes `aria-expanded`/`aria-controls` on the trigger and
 *    `role="tooltip"` on the popover, with `aria-describedby` linking the
 *    trigger to the popover's content so a screen reader announces the
 *    explanation as part of the button's accessible description.
 */
export function HelpTooltip({
  label,
  children,
  className = "",
}: {
  /** The concept being explained (e.g. "Target margin") — used to build the
   * trigger's accessible name ("Help: Target margin"), not displayed as
   * visible text (the label itself is rendered by the caller alongside this
   * component). */
  label: string;
  /** 1-3 short sentences of plain-language context. Never the only place a
   * real validation error/requirement is stated. */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [shiftPx, setShiftPx] = useState(0);
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function close(returnFocus: boolean) {
    setOpen(false);
    setShiftPx(0);
    if (returnFocus) triggerRef.current?.focus();
  }

  // Edge-collision guard: the popover is centered under its trigger by
  // default, but a trigger near either side of the viewport (common in a
  // right-aligned summary card, or on a narrow phone screen) would otherwise
  // push it half off-screen. Nudge it back in-bounds after it renders,
  // leaving an 8px margin — never let a real popup go unreadable off the
  // edge of the viewport.
  useEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    if (!popover) return;
    const margin = 8;
    const rect = popover.getBoundingClientRect();
    let shift = 0;
    if (rect.right > window.innerWidth - margin) shift -= rect.right - (window.innerWidth - margin);
    if (rect.left + shift < margin) shift += margin - (rect.left + shift);
    setShiftPx(shift);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    }
    // Outside click/tap dismissal — "mousedown" (not "click") so it fires
    // before a click on another control, matching the standard popover
    // dismissal pattern. Covers touch too: touch taps also raise a
    // synthetic mousedown/click sequence in every supported browser.
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close(false);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handlePointerDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Help: ${label}`}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          // Native <button> already activates on Enter/Space in a real
          // browser, but we handle it explicitly (and preventDefault, so
          // there's no double-toggle) so this is verifiably keyboard-driven
          // rather than relying on that default browser behavior, and so it
          // behaves identically under a raw keydown simulation in tests.
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="tap-target inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted hover:text-forest focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-surface focus-visible:ring-offset-1"
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={popoverId}
          ref={popoverRef}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${shiftPx}px))` }}
          className="absolute left-1/2 top-full z-20 mt-1.5 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-white p-3 text-xs font-normal normal-case leading-relaxed text-ink shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  );
}
