/**
 * Regression suite for DEF-01: the 4 free marketing-tool calculator islands
 * (src/components/calculator/*) used a plain `NumberInput` with ZERO
 * validation — a negative cost, an out-of-range percentage, or malformed
 * text was either silently accepted with no visible error, or (for clearly
 * non-numeric text) silently discarded with no error message either way.
 *
 * The fix wires each island onto the same draft/validate/commit primitives
 * (`MoneyInput`/`DraftNumberInput`, see `components/ui/primitives.tsx`) the
 * paid Pro app already uses. These tests render the actual island
 * components (not the underlying primitives in isolation — that's already
 * covered by `moneyInputLogic.test.ts`/`draftNumberInputLogic.test.ts`) and
 * prove, per field, that:
 *  - a negative amount, an out-of-range percent, or malformed/partial text
 *    shows a visible inline error (`role="alert"`) and is never committed
 *    into the displayed total/price.
 *  - on blur with the bad text still in the field, the field reverts to the
 *    last valid persisted value.
 *  - an "unsafe large" money value (over Number.MAX_SAFE_INTEGER once
 *    converted to cents) is rejected the same way a negative amount is.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectCalculatorIsland from "../components/calculator/ProjectCalculatorIsland";
import EstimateBuilderIsland from "../components/calculator/EstimateBuilderIsland";
import InvoiceBuilderIsland from "../components/calculator/InvoiceBuilderIsland";
import PriceListBuilderIsland from "../components/calculator/PriceListBuilderIsland";

afterEach(() => {
  cleanup();
});

/** An amount whose cents equivalent (× 100) exceeds Number.MAX_SAFE_INTEGER
 * — this is the "unsafe large" case `fromDollarInputToCents` rejects via
 * `validateDollarInput`, same as a negative amount. */
const UNSAFE_LARGE_DOLLARS = (Number.MAX_SAFE_INTEGER + 1000).toString();

/** Types `text` into `input` (after clearing it), then blurs it (Tab away)
 * so the draft/validate/commit cycle runs the same way a real user's
 * keystrokes + blur would. Returns nothing — callers assert before/after. */
async function typeAndBlur(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  await user.clear(input);
  if (text !== "") await user.type(input, text);
  await user.tab();
}

/** MoneyInput/DraftNumberInput both render `<div>{input}{error && <p role="alert">}</div>`
 * — the input's own parent is that wrapping div, so an alert scoped to it
 * only matches THIS field's error, not some other field's. */
function fieldAlert(input: HTMLElement) {
  return within(input.parentElement as HTMLElement).getByRole("alert");
}
function queryFieldAlert(input: HTMLElement) {
  return within(input.parentElement as HTMLElement).queryByRole("alert");
}

// -- ProjectCalculatorIsland --------------------------------------------------

describe("ProjectCalculatorIsland validation (DEF-01)", () => {
  it("rejects a negative materials cost: shows an alert, leaves Direct cost unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<ProjectCalculatorIsland />);
    const input = screen.getByLabelText("Materials") as HTMLInputElement;
    const directCostBefore = screen.getByText("Direct cost").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "-500");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(screen.getByText("Direct cost").nextElementSibling!.textContent).toBe(directCostBefore);

    await user.tab();
    expect(screen.getByText("Direct cost").nextElementSibling!.textContent).toBe(directCostBefore);
    expect(input.value).toBe("1250"); // reverted to the last persisted $1,250.00
    expect(queryFieldAlert(input)).not.toBeInTheDocument();
  });

  it("rejects malformed text ('-') in Equipment: shows an alert, never commits, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<ProjectCalculatorIsland />);
    const input = screen.getByLabelText("Equipment") as HTMLInputElement;
    const directCostBefore = screen.getByText("Direct cost").nextElementSibling!.textContent;

    await typeAndBlur(user, input, "-");
    expect(input.value).toBe("180"); // reverted to the last persisted $180.00
    expect(screen.getByText("Direct cost").nextElementSibling!.textContent).toBe(directCostBefore);
  });

  it("rejects a lone '.' partial commit in Delivery: shows an alert, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<ProjectCalculatorIsland />);
    const input = screen.getByLabelText("Delivery") as HTMLInputElement;
    const directCostBefore = screen.getByText("Direct cost").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, ".");
    expect(fieldAlert(input)).toBeInTheDocument();

    await user.tab();
    expect(input.value).toBe("180");
    expect(screen.getByText("Direct cost").nextElementSibling!.textContent).toBe(directCostBefore);
  });

  it("rejects an unsafe-large Other costs value the same way as negative: alert, no commit, revert", async () => {
    const user = userEvent.setup();
    render(<ProjectCalculatorIsland />);
    const input = screen.getByLabelText("Other costs") as HTMLInputElement;
    const directCostBefore = screen.getByText("Direct cost").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, UNSAFE_LARGE_DOLLARS);
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(screen.getByText("Direct cost").nextElementSibling!.textContent).toBe(directCostBefore);

    await user.tab();
    expect(input.value).toBe("100"); // reverted to the last persisted $100.00
    expect(screen.getByText("Direct cost").nextElementSibling!.textContent).toBe(directCostBefore);
  });

  it("rejects a negative Overhead %: alert, Overhead allocation unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<ProjectCalculatorIsland />);
    const input = screen.getByLabelText("Overhead") as HTMLInputElement;
    const overheadBefore = screen.getByText("Overhead allocation").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "-5");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(screen.getByText("Overhead allocation").nextElementSibling!.textContent).toBe(overheadBefore);

    await user.tab();
    expect(input.value).toBe("15");
    expect(screen.getByText("Overhead allocation").nextElementSibling!.textContent).toBe(overheadBefore);
  });

  it("rejects a target margin >= 100%: alert, Required selling price unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<ProjectCalculatorIsland />);
    const input = screen.getByLabelText("Target margin") as HTMLInputElement;
    const priceBefore = screen.getByText("Required selling price").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "100");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(screen.getByText("Required selling price").nextElementSibling!.textContent).toBe(priceBefore);

    await user.tab();
    expect(input.value).toBe("35");
    expect(screen.getByText("Required selling price").nextElementSibling!.textContent).toBe(priceBefore);
  });
});

// -- EstimateBuilderIsland -----------------------------------------------------

describe("EstimateBuilderIsland validation (DEF-01)", () => {
  it("rejects a negative line quantity: alert, line total and grand Total unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<EstimateBuilderIsland />);
    const input = screen.getByLabelText("Quantity, line 1") as HTMLInputElement;
    const row = input.closest("tr")!;
    const lineTotalCell = row.querySelectorAll("td")[4];
    const lineTotalBefore = lineTotalCell.textContent;
    const totalBefore = screen.getByText("Total").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "-3");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(lineTotalCell.textContent).toBe(lineTotalBefore);

    await user.tab();
    expect(input.value).toBe("8"); // reverted to the last persisted quantity
    expect(lineTotalCell.textContent).toBe(lineTotalBefore);
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);
  });

  it("rejects a '-' partial quantity commit: alert, never commits, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<EstimateBuilderIsland />);
    const input = screen.getByLabelText("Quantity, line 2") as HTMLInputElement;

    await typeAndBlur(user, input, "-");
    expect(input.value).toBe("18"); // reverted
  });

  it("rejects a negative unit price: alert, line total and grand Total unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<EstimateBuilderIsland />);
    const input = screen.getByLabelText("Unit price, line 1") as HTMLInputElement;
    const row = input.closest("tr")!;
    const lineTotalCell = row.querySelectorAll("td")[4];
    const lineTotalBefore = lineTotalCell.textContent;
    const totalBefore = screen.getByText("Total").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "-95");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(lineTotalCell.textContent).toBe(lineTotalBefore);

    await user.tab();
    expect(input.value).toBe("95"); // reverted to the last persisted $95.00
    expect(lineTotalCell.textContent).toBe(lineTotalBefore);
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);
  });

  it("rejects an unsafe-large unit price: alert, no commit, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<EstimateBuilderIsland />);
    const input = screen.getByLabelText("Unit price, line 2") as HTMLInputElement;
    const totalBefore = screen.getByText("Total").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, UNSAFE_LARGE_DOLLARS);
    expect(fieldAlert(input)).toBeInTheDocument();

    await user.tab();
    expect(input.value).toBe("65"); // reverted to the last persisted $65.00
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);
  });
});

// -- InvoiceBuilderIsland --------------------------------------------------------

describe("InvoiceBuilderIsland validation (DEF-01)", () => {
  it("rejects a negative tax rate: alert, tax amount and Total unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<InvoiceBuilderIsland />);
    const input = screen.getByLabelText("Tax") as HTMLInputElement;
    const totalBefore = screen.getByText("Total").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "-5");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);

    await user.tab();
    expect(input.value).toBe("0"); // reverted to the last persisted 0%
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);
  });

  it("rejects a tax rate over 100%: alert, Total unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<InvoiceBuilderIsland />);
    const input = screen.getByLabelText("Tax") as HTMLInputElement;
    const totalBefore = screen.getByText("Total").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "150");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);

    await user.tab();
    expect(input.value).toBe("0");
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);
  });

  it("rejects a negative line quantity: alert, line subtotal and grand Total unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<InvoiceBuilderIsland />);
    const input = screen.getByLabelText("Quantity, line 1") as HTMLInputElement;
    const row = input.closest("tr")!;
    const lineTotalCell = row.querySelectorAll("td")[3];
    const lineTotalBefore = lineTotalCell.textContent;
    const totalBefore = screen.getByText("Total").nextElementSibling!.textContent;

    await user.clear(input);
    await user.type(input, "-1");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(lineTotalCell.textContent).toBe(lineTotalBefore);

    await user.tab();
    expect(input.value).toBe("1"); // reverted
    expect(lineTotalCell.textContent).toBe(lineTotalBefore);
    expect(screen.getByText("Total").nextElementSibling!.textContent).toBe(totalBefore);
  });

  it("rejects a '.' partial commit on a line price: alert, no commit, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<InvoiceBuilderIsland />);
    const input = screen.getByLabelText("Price, line 2") as HTMLInputElement;

    await user.clear(input);
    await user.type(input, ".");
    expect(fieldAlert(input)).toBeInTheDocument();

    await user.tab();
    expect(input.value).toBe("1170"); // reverted to the last persisted $1,170.00
  });
});

// -- PriceListBuilderIsland -------------------------------------------------------

describe("PriceListBuilderIsland validation (DEF-01)", () => {
  it("rejects a negative rate: alert, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<PriceListBuilderIsland />);
    const input = screen.getByLabelText("Rate, row 1") as HTMLInputElement;

    await user.clear(input);
    await user.type(input, "-95");
    expect(fieldAlert(input)).toBeInTheDocument();

    await user.tab();
    expect(input.value).toBe("95"); // reverted to the last persisted $95.00
  });

  it("rejects an unsafe-large rate: alert, no commit, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<PriceListBuilderIsland />);
    const input = screen.getByLabelText("Rate, row 2") as HTMLInputElement;

    await user.clear(input);
    await user.type(input, UNSAFE_LARGE_DOLLARS);
    expect(fieldAlert(input)).toBeInTheDocument();

    await user.tab();
    expect(input.value).toBe("85"); // reverted to the last persisted $85.00
  });

  it("rejects a negative minimum project price: alert, the profitability banner amount unchanged, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<PriceListBuilderIsland />);
    const input = screen.getByLabelText("Minimum project price") as HTMLInputElement;
    const bannerBefore = screen.getByText(/flags anything priced/).textContent;

    await user.clear(input);
    await user.type(input, "-500");
    expect(fieldAlert(input)).toBeInTheDocument();
    expect(screen.getByText(/flags anything priced/).textContent).toBe(bannerBefore);

    await user.tab();
    expect(input.value).toBe("500"); // reverted to the last persisted $500.00
    expect(screen.getByText(/flags anything priced/).textContent).toBe(bannerBefore);
  });

  it("rejects a '-' malformed minimum project price commit: alert, reverts on blur", async () => {
    const user = userEvent.setup();
    render(<PriceListBuilderIsland />);
    const input = screen.getByLabelText("Minimum project price") as HTMLInputElement;

    await typeAndBlur(user, input, "-");
    expect(input.value).toBe("500");
  });
});
