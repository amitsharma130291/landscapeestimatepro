import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button, TextInput } from "./primitives";

type DialogTone = "default" | "danger";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

interface AlertOptions {
  title?: string;
  okLabel?: string;
}

interface PromptOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  placeholder?: string;
}

type DialogState =
  | { kind: "alert"; message: string; options: AlertOptions; resolve: () => void }
  | { kind: "confirm"; message: string; options: ConfirmOptions; resolve: (result: boolean) => void }
  | { kind: "prompt"; message: string; options: PromptOptions; resolve: (result: string | null) => void };

const FOCUSABLE_SELECTOR = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * In-app replacement for window.alert/confirm/prompt — those native browser
 * dialogs are unstyled, block the whole tab (including any in-progress
 * autosave feedback), and read as "something went wrong" rather than part of
 * the product. This renders a Card-styled modal instead, driven by the same
 * imperative await-based API so call sites barely change (`window.confirm(x)`
 * becomes `await confirm(x)`).
 *
 * Each component that needs a dialog calls this hook itself and renders the
 * returned `dialog` node somewhere in its own JSX (position doesn't matter —
 * it's a fixed-position overlay). There's no shared provider/context because
 * Astro islands are independent React roots that don't share a tree.
 */
export function useDialog() {
  const [state, setState] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const alertFn = useCallback((message: string, options: AlertOptions = {}) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    return new Promise<void>((resolve) => {
      setState({ kind: "alert", message, options, resolve });
    });
  }, []);

  const confirmFn = useCallback((message: string, options: ConfirmOptions = {}) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    return new Promise<boolean>((resolve) => {
      setState({ kind: "confirm", message, options, resolve });
    });
  }, []);

  const promptFn = useCallback((message: string, options: PromptOptions = {}) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setPromptValue(options.defaultValue ?? "");
    return new Promise<string | null>((resolve) => {
      setState({ kind: "prompt", message, options, resolve });
    });
  }, []);

  function close() {
    setState(null);
    // Native dialogs return focus to whatever triggered them — without this
    // a keyboard user's focus silently drops to <body> when the modal unmounts.
    triggerRef.current?.focus?.();
  }

  function handleCancel() {
    if (!state) return;
    if (state.kind === "confirm") state.resolve(false);
    else if (state.kind === "prompt") state.resolve(null);
    else state.resolve();
    close();
  }

  function handleConfirm() {
    if (!state) return;
    if (state.kind === "confirm") state.resolve(true);
    else if (state.kind === "prompt") state.resolve(promptValue);
    else state.resolve();
    close();
  }

  // Prevent the page behind the modal from scrolling while it's open —
  // matches how a native dialog blocks the rest of the page.
  useEffect(() => {
    if (!state) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [state]);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      handleCancel();
      return;
    }
    if (e.key === "Tab" && dialogRef.current) {
      // Minimal focus trap — a real dialog never leaks Tab focus onto the
      // page behind it, which would otherwise be reachable since the
      // overlay doesn't remove that content from the DOM.
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  const dialog = state ? (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        ref={dialogRef}
        role={state.kind === "alert" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={state.options.title ? "app-dialog-title" : undefined}
        aria-describedby="app-dialog-message"
        className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {state.options.title && (
          <h2 id="app-dialog-title" className="text-lg font-bold text-ink">
            {state.options.title}
          </h2>
        )}
        <p id="app-dialog-message" className={`whitespace-pre-line text-sm text-muted ${state.options.title ? "mt-1.5" : ""}`}>
          {state.message}
        </p>
        {state.kind === "prompt" && (
          <div className="mt-4">
            <TextInput
              autoFocus
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={state.options.placeholder}
              aria-label={state.message}
            />
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          {state.kind !== "alert" && (
            <Button type="button" variant="ghost" onClick={handleCancel}>
              {state.options.cancelLabel ?? "Cancel"}
            </Button>
          )}
          <Button
            type="button"
            variant={state.kind === "confirm" && state.options.tone === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            autoFocus={state.kind !== "prompt"}
          >
            {state.kind === "alert" ? state.options.okLabel ?? "OK" : state.kind === "prompt" ? state.options.confirmLabel ?? "OK" : state.options.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { alert: alertFn, confirm: confirmFn, prompt: promptFn, dialog };
}
