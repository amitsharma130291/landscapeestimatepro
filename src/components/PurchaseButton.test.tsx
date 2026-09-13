import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const salesConfigMock = vi.hoisted(() => ({ salesEnabled: true, plannedLifetimePriceCents: 7900, originalPriceCents: 9900 as number | null, priceValidUntil: null as string | null }));
vi.mock("../data/salesConfig", () => ({ SALES_CONFIG: salesConfigMock }));

const startCheckoutMock = vi.hoisted(() => vi.fn());
const hasStoredLicenseMock = vi.hoisted(() => vi.fn(() => false));
vi.mock("../lib/license", () => ({ startCheckout: startCheckoutMock, hasStoredLicense: hasStoredLicenseMock }));

const { default: PurchaseButton } = await import("./PurchaseButton");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  hasStoredLicenseMock.mockReturnValue(false);
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

describe("PurchaseButton — already licensed", () => {
  it("shows a Go to App link instead of a buy button, even while sales are enabled", async () => {
    salesConfigMock.salesEnabled = true;
    hasStoredLicenseMock.mockReturnValue(true);
    render(<PurchaseButton />);

    const link = await screen.findByRole("link", { name: "Go to App" });
    expect(link).toHaveAttribute("href", "/app/");
    expect(screen.queryByRole("button", { name: /Get Landscape Estimate Pro/ })).not.toBeInTheDocument();
  });

  it("shows a Go to App link instead of the disabled state, even while sales are disabled", async () => {
    salesConfigMock.salesEnabled = false;
    hasStoredLicenseMock.mockReturnValue(true);
    render(<PurchaseButton />);

    expect(await screen.findByRole("link", { name: "Go to App" })).toHaveAttribute("href", "/app/");
    expect(screen.queryByRole("button", { name: /purchasing temporarily unavailable/i })).not.toBeInTheDocument();
  });
});
