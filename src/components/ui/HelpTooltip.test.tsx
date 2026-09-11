/**
 * Phase 6 — HelpTooltip: a click/tap-triggered "toggletip" used to explain
 * pricing vocabulary (loaded labor rate, target margin, true job cost, ...)
 * without ever being the only way to see a real validation error. See the
 * component's doc comment in HelpTooltip.tsx for the full requirements this
 * covers: keyboard-operable (not hover-only), screen-reader labelled,
 * dismissible via Escape/outside click, and touch-usable via a plain click.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HelpTooltip } from "./HelpTooltip";

afterEach(() => {
  cleanup();
});

function renderTooltip() {
  return render(
    <div>
      <HelpTooltip label="Target margin">Profit share of the selling price, not a markup on cost.</HelpTooltip>
      <button type="button">Outside button</button>
    </div>
  );
}

describe("HelpTooltip", () => {
  it("is closed by default and has no visible explanation text", () => {
    renderTooltip();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on click", () => {
    renderTooltip();
    fireEvent.click(screen.getByRole("button", { name: "Help: Target margin" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Profit share of the selling price");
  });

  it("opens on Enter when focused, via a keyboard event only — no mouseover/click ever fired", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    trigger.focus();
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Profit share of the selling price");
  });

  it("opens on Space when focused, via a keyboard event only", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: " " });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Profit share of the selling price");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click", () => {
    renderTooltip();
    fireEvent.click(screen.getByRole("button", { name: "Help: Target margin" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside button" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not close when clicking inside the popover itself", () => {
    renderTooltip();
    fireEvent.click(screen.getByRole("button", { name: "Help: Target margin" }));
    const tooltip = screen.getByRole("tooltip");
    fireEvent.mouseDown(tooltip);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("has a screen-reader-discoverable accessible name and links the popover as its description", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    expect(trigger).toHaveAccessibleName("Help: Target margin");
    fireEvent.click(trigger);

    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
    expect(trigger).toHaveAttribute("aria-controls", tooltip.id);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("sets aria-expanded=false while closed", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles closed on a second click", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("never exposes the explanation via a `title` attribute (hover-only/title-only is explicitly disallowed)", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    expect(trigger).not.toHaveAttribute("title");
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).not.toHaveAttribute("title");
  });

  it("is reachable via Tab (a real, focusable button, not a hover-only span)", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Help: Target margin" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).not.toHaveAttribute("disabled");
  });

  it("Phase 12: nudges the popover back on-screen when it would overflow the right edge of the viewport", () => {
    // jsdom never actually lays anything out, so getBoundingClientRect always
    // returns zeros by default — mock it globally BEFORE opening so the
    // component's post-open effect reads a realistic overflowing rect the
    // first time it runs. Simulates exactly the failure confirmed live in
    // the browser: a trigger near the right edge of the "Estimate summary"
    // card pushed its popover 40px past the edge of a 768px viewport.
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.getAttribute("role") === "tooltip") {
        return { left: 700, right: 808, top: 0, bottom: 0, width: 108, height: 60, x: 700, y: 0, toJSON() {} } as DOMRect;
      }
      return originalRect.call(this);
    };

    try {
      renderTooltip();
      fireEvent.click(screen.getByRole("button", { name: "Help: Target margin" }));
      const tooltip = screen.getByRole("tooltip");
      // A negative shift pulls the (would-be off-screen-right) popover back left.
      expect(tooltip.style.transform).toMatch(/calc\(-50% \+ -\d/);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("supports rendering multiple independent tooltips without id collisions", () => {
    render(
      <div>
        <HelpTooltip label="Overhead percentage">Applied to direct cost.</HelpTooltip>
        <HelpTooltip label="Rounding increment">Always rounds up.</HelpTooltip>
      </div>
    );
    const first = screen.getByRole("button", { name: "Help: Overhead percentage" });
    const second = screen.getByRole("button", { name: "Help: Rounding increment" });
    fireEvent.click(first);
    fireEvent.click(second);
    const tooltips = screen.getAllByRole("tooltip");
    expect(tooltips).toHaveLength(2);
    expect(tooltips[0].id).not.toBe(tooltips[1].id);
  });
});
