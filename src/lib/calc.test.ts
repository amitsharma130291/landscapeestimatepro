import { describe, expect, it } from "vitest";
import {
  calculateLabor,
  calculateMargin,
  calculateMarkup,
  calculatePriceFromMarkup,
  calculateProjectCost,
  calculateQuotePricing,
  calculateRequiredSellingPrice,
  formatCurrency,
  formatPercent,
  roundDisplayPrice,
  safe,
} from "./calc";

describe("safe", () => {
  it("clamps NaN to 0", () => {
    expect(safe(NaN)).toBe(0);
  });
  it("clamps negative to 0", () => {
    expect(safe(-50)).toBe(0);
  });
  it("clamps Infinity to 0", () => {
    expect(safe(Infinity)).toBe(0);
  });
  it("passes through a normal positive number", () => {
    expect(safe(42.5)).toBe(42.5);
  });
});

describe("calculateLabor — direct mode", () => {
  it("matches the brief's 3-person, 8-hour crew example: 24 person-hours, $768", () => {
    const result = calculateLabor({ mode: "direct", crewSize: 3, hours: 8, loadedRate: 32 });
    expect(result.personHours).toBe(24);
    expect(result.laborCost).toBe(768);
  });
});

describe("calculateLabor — production-rate mode", () => {
  it("matches the brief's mulch example: 8 yd3 at 2.5 yd3/person-hour = 3.2 person-hours", () => {
    const result = calculateLabor({
      mode: "production",
      quantity: 8,
      productionRate: 2.5,
      loadedRate: 32,
    });
    expect(result.personHours).toBeCloseTo(3.2, 10);
    expect(result.laborCost).toBeCloseTo(102.4, 10);
  });

  it("returns zero (not Infinity/NaN) when production rate is 0", () => {
    const result = calculateLabor({ mode: "production", quantity: 8, productionRate: 0, loadedRate: 32 });
    expect(result.personHours).toBe(0);
    expect(result.laborCost).toBe(0);
  });
});

describe("calculateProjectCost — Smith Residence reference example", () => {
  // Materials $1,250 + Labor $768 + Equipment $180 + Delivery $180 + Other $100
  const inputs = {
    materialsCost: 1250,
    laborCost: 768,
    equipmentCost: 180,
    deliveryCost: 180,
    otherCost: 100,
    overheadPercent: 15,
  };

  it("direct cost is $2,478", () => {
    expect(calculateProjectCost(inputs).directCost).toBe(2478);
  });

  it("overhead allocation is $371.70 (~$372 as shown, rounded, in the brief)", () => {
    expect(calculateProjectCost(inputs).overheadAmount).toBeCloseTo(371.7, 10);
  });

  it("exact true cost is $2,849.70 before display rounding", () => {
    expect(calculateProjectCost(inputs).trueCost).toBeCloseTo(2849.7, 10);
  });
});

describe("calculateRequiredSellingPrice", () => {
  it("solves margin (not markup): $2,850 true cost at 35% target margin = $4,384.6153...", () => {
    expect(calculateRequiredSellingPrice(2850, 35)).toBeCloseTo(4384.615384615, 6);
  });

  it("minimum-job-audit reference example: $390 true cost at 35% margin = exactly $600", () => {
    expect(calculateRequiredSellingPrice(390, 35)).toBeCloseTo(600, 10);
  });

  it("does not divide by zero at a 100% target margin", () => {
    expect(Number.isFinite(calculateRequiredSellingPrice(1000, 100))).toBe(true);
  });
});

describe("calculateQuotePricing — Smith Residence, end to end", () => {
  const pricing = calculateQuotePricing(2849.7, 35, "dollar");

  it("rounds true cost to $2,850 before solving for price", () => {
    expect(pricing.trueCostRounded).toBe(2850);
  });

  it("required selling price to the cent is $4,384.62", () => {
    expect(pricing.requiredSellingPrice).toBe(4384.62);
  });

  it("display price rounds to $4,385", () => {
    expect(pricing.displayPrice).toBe(4385);
  });

  it("expected gross profit is displayPrice minus trueCostRounded ($1,535)", () => {
    expect(pricing.expectedGrossProfit).toBe(1535);
  });

  it("effective margin is at or just above the 35% target (rounding favors the contractor)", () => {
    expect(pricing.effectiveMargin).not.toBeNull();
    expect(pricing.effectiveMargin as number).toBeGreaterThanOrEqual(35);
    expect(pricing.effectiveMargin as number).toBeLessThan(35.1);
  });
});

describe("margin vs markup — brief's worked distinction", () => {
  it("a 35% markup on $2,850 produces $3,847.50 (not the same as 35% margin)", () => {
    expect(calculatePriceFromMarkup(2850, 35)).toBeCloseTo(3847.5, 10);
  });

  it("that $3,847.50 markup price only yields a 25.9% margin", () => {
    const margin = calculateMargin(3847.5, 2850);
    expect(margin).not.toBeNull();
    expect(margin as number).toBeCloseTo(25.925926, 4);
  });

  it("a true 35% margin instead requires the full $4,384.62 selling price", () => {
    expect(calculateRequiredSellingPrice(2850, 35)).toBeCloseTo(4384.615384615, 6);
  });

  it("markup and margin diverge more as the target percentage grows", () => {
    const markupPrice = calculatePriceFromMarkup(1000, 50);
    const marginPrice = calculateRequiredSellingPrice(1000, 50);
    expect(markupPrice).toBe(1500);
    expect(marginPrice).toBe(2000);
    expect(markupPrice).toBeLessThan(marginPrice);
  });
});

describe("calculateMargin", () => {
  it("returns null (not 0) when selling price is 0/unset", () => {
    expect(calculateMargin(0, 500)).toBeNull();
  });

  it("underpricing example: $3,850 quote against $2,850 true cost is a 25.9% margin", () => {
    const margin = calculateMargin(3850, 2850);
    expect(margin).not.toBeNull();
    expect(margin as number).toBeCloseTo(25.974026, 4);
  });
});

describe("calculateMarkup", () => {
  it("returns null (not 0) when true cost is 0/unset", () => {
    expect(calculateMarkup(500, 0)).toBeNull();
  });

  it("computes profit over cost, distinct from margin", () => {
    expect(calculateMarkup(4384.62, 2850)).toBeCloseTo(53.85, 1);
  });
});

describe("roundDisplayPrice", () => {
  it("rounds to whole dollars by default", () => {
    expect(roundDisplayPrice(4384.62)).toBe(4385);
  });
  it("rounds to cents when asked", () => {
    expect(roundDisplayPrice(4384.615384615, "cent")).toBe(4384.62);
  });
  it("clamps negative input to 0", () => {
    expect(roundDisplayPrice(-10)).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats whole dollars with no cents by default", () => {
    expect(formatCurrency(4385)).toBe("$4,385");
  });
  it("formats with cents when requested", () => {
    expect(formatCurrency(4384.62, { cents: true })).toBe("$4,384.62");
  });
});

describe("formatPercent", () => {
  it("renders an em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
  it("renders one decimal place by default", () => {
    expect(formatPercent(35)).toBe("35.0%");
  });
});
