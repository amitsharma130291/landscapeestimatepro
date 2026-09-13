import { describe, expect, it } from "vitest";
import {
  actualLaborCostCents,
  actualMarginAfterJob,
  actualMaterialCostCents,
  costScenarios,
  costVarianceCents,
  costVariancePercent,
  equipmentScenario,
  estimatedLaborCostCents,
  estimatedMaterialCostCents,
  examplePricing,
  exampleMinimumPriceApplies,
  expectedMarginAtQuote,
  laborScenario,
  markupComparisonMargin,
  markupComparisonPriceCents,
  markupVsMarginDifferenceCents,
  marginComparisonMargin,
  marginComparisonPriceCents,
  materialScenario,
  quotedPriceCents,
  rateHealthRows,
} from "./salesPageExamples";

/**
 * Locks in the exact numbers the sales page displays. Every value here is
 * produced by salesPageExamples.ts calling this app's real pricing engine
 * (calc.ts / estimateMath.ts) against the app's own real default sample
 * data (src/lib/sampleData.ts) — these assertions are what "the
 * margin-vs-markup/Service Rate Health/estimate-vs-actual example reconciles
 * exactly" actually means: the page can't show a number these functions
 * wouldn't produce.
 */

describe("example project pricing (margin-vs-markup proof)", () => {
  it("computes the real cost chain: direct cost -> overhead -> true cost", () => {
    expect(examplePricing.directCostCents).toBe(250000); // $2,500.00
    expect(examplePricing.overheadAmountCents).toBe(35000); // $350.00 (14%)
    expect(examplePricing.trueCostCents).toBe(285000); // $2,850.00
  });

  it("the $1,500 minimum project price does not bind on this job", () => {
    expect(exampleMinimumPriceApplies).toBe(false);
  });
});

describe("margin-vs-markup proof — protected example, must stay exact", () => {
  it("a flat 35% markup on this project's true cost", () => {
    expect(markupComparisonPriceCents).toBe(384750); // $3,847.50
    expect(markupComparisonMargin).not.toBeNull();
    expect(markupComparisonMargin!).toBeCloseTo(25.9, 1);
  });

  it("the price required to actually hit a 35% MARGIN", () => {
    expect(marginComparisonPriceCents).toBe(438462); // $4,384.62
    expect(marginComparisonMargin).not.toBeNull();
    expect(marginComparisonMargin!).toBeCloseTo(35.0, 1);
  });

  it("the difference is exactly $537.12", () => {
    expect(markupVsMarginDifferenceCents).toBe(53712);
  });
});

describe("estimate vs. actual — captured from a real session in the live app", () => {
  it("quoted price and expected/actual margin match the real screenshot", () => {
    expect(quotedPriceCents).toBe(104200); // $1,042.00
    expect(expectedMarginAtQuote).toBeCloseTo(35.1, 1);
    expect(actualMarginAfterJob).toBeCloseTo(23.5, 1);
  });

  it("cost variance matches the real screenshot", () => {
    expect(costVarianceCents).toBe(12029); // +$120.29
    expect(costVariancePercent).toBeCloseTo(17.8, 1);
  });

  it("materials and labor variance match the real screenshot's category table", () => {
    expect(estimatedMaterialCostCents).toBe(33600); // $336.00
    expect(actualMaterialCostCents).toBe(39900); // $399.00
    expect(estimatedLaborCostCents).toBe(10240); // $102.40
    expect(actualLaborCostCents).toBe(14400); // $144.00
  });
});

describe("Service Rate Health — the app's own real default sample data", () => {
  it("Mulch Installation needs attention at a 33.7% current margin", () => {
    const row = rateHealthRows.find((r) => r.service === "Mulch Installation")!;
    expect(row.trueCostCents).toBe(6302); // $63.02
    expect(row.health.currentMargin).toBeCloseTo(33.7, 1);
    expect(row.health.status).toBe("attention");
  });

  it("Topsoil Installation needs attention at a 33.4% current margin", () => {
    const row = rateHealthRows.find((r) => r.service === "Topsoil Installation")!;
    expect(row.trueCostCents).toBe(5658); // $56.58
    expect(row.health.currentMargin).toBeCloseTo(33.4, 1);
    expect(row.health.status).toBe("attention");
  });

  it("Edging is healthy at a 38.7% current margin", () => {
    const row = rateHealthRows.find((r) => r.service === "Edging")!;
    expect(row.health.currentMargin).toBeCloseTo(38.7, 1);
    expect(row.health.status).toBe("healthy");
  });

  it("Shrub Installation needs the most attention: 27.8% current margin, $75.02 required", () => {
    const row = rateHealthRows.find((r) => r.service === "Shrub Installation")!;
    expect(row.health.currentMargin).toBeCloseTo(27.8, 1);
    expect(row.health.status).toBe("attention");
    expect(row.health.requiredRateCents).toBe(7502); // $75.02
  });

  it("exactly one of the four default services is healthy — three need attention", () => {
    const healthy = rateHealthRows.filter((r) => r.health.status === "healthy");
    const attention = rateHealthRows.filter((r) => r.health.status === "attention");
    expect(healthy).toHaveLength(1);
    expect(attention).toHaveLength(3);
  });
});

describe("cost-impact scenarios — starting rates tied to the app's real defaults", () => {
  it("material (mulch) scenario starts from the real sample material cost: 19.0% increase, $64 impact on an 8 yd³ job", () => {
    expect(materialScenario.fromCents).toBe(4200);
    expect(materialScenario.toCents).toBe(5000);
    const scenario = costScenarios.find((s) => s.label === "Mulch")!;
    expect(scenario.percentChange).toBeCloseTo(19.0, 1);
    expect(scenario.dollarImpactCents).toBe(6400); // $64.00
  });

  it("labor scenario starts from the real default loaded labor rate: 12.5% increase, $96 impact on 24 person-hours", () => {
    expect(laborScenario.fromCents).toBe(3200);
    expect(laborScenario.toCents).toBe(3600);
    const scenario = costScenarios.find((s) => s.label === "Loaded labor")!;
    expect(scenario.percentChange).toBeCloseTo(12.5, 1);
    expect(scenario.dollarImpactCents).toBe(9600); // $96.00
  });

  it("equipment scenario starts from the real sample Skid Steer rate: 22.2% increase, $40 impact on four hours", () => {
    expect(equipmentScenario.fromCents).toBe(4500);
    expect(equipmentScenario.toCents).toBe(5500);
    const scenario = costScenarios.find((s) => s.label === "Skid-steer")!;
    expect(scenario.percentChange).toBeCloseTo(22.2, 1);
    expect(scenario.dollarImpactCents).toBe(4000); // $40.00
  });
});
