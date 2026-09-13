import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const salesConfigMock = vi.hoisted(() => ({ salesEnabled: true, plannedLifetimePriceCents: 9900, priceValidUntil: null as string | null }));
vi.mock("../data/salesConfig", () => ({ SALES_CONFIG: salesConfigMock }));

const startCheckoutMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/license", () => ({ startCheckout: startCheckoutMock }));

const { default: PurchaseButton } = await import("./PurchaseButton");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PurchaseButton — sales enabled", () => {
  it("renders a real, clickable purchase button that starts checkout", async () => {
    salesConfigMock.salesEnabled = true;
    startCheckoutMock.mockResolvedValue(undefined);
    render(<PurchaseButton />);

    const button = screen.getByRole("button", { name: /Get Landscape Estimate Pro/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(startCheckoutMock).toHaveBeenCalledTimes(1);
  });

  it("shows an error message if checkout fails to start, without pretending it succeeded", async () => {
    salesConfigMock.salesEnabled = true;
    startCheckoutMock.mockRejectedValue(new Error("network error"));
    render(<PurchaseButton />);

    fireEvent.click(screen.getByRole("button", { name: /Get Landscape Estimate Pro/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't start checkout/i);
  });
});

describe("PurchaseButton — sales disabled", () => {
  it("renders a disabled control that cannot start a purchase, never the real checkout button", () => {
    salesConfigMock.salesEnabled = false;
    render(<PurchaseButton />);

    expect(screen.queryByRole("button", { name: /Get Landscape Estimate Pro/ })).not.toBeInTheDocument();
    const disabledButton = screen.getByRole("button", { name: /purchasing temporarily unavailable/i });
    expect(disabledButton).toBeDisabled();
    fireEvent.click(disabledButton);
    expect(startCheckoutMock).not.toHaveBeenCalled();
  });
});
