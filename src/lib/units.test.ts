import { describe, expect, it } from "vitest";
import { classifyUnitDimension, describeUnitRelationship, findKnownConversion } from "./units";

describe("classifyUnitDimension", () => {
  it("classifies area, volume, and length units", () => {
    expect(classifyUnitDimension("sqft")).toBe("area");
    expect(classifyUnitDimension("yd3")).toBe("volume");
    expect(classifyUnitDimension("ft3")).toBe("volume");
    expect(classifyUnitDimension("linear-ft")).toBe("length");
  });

  it("gives ton, bag, and pallet each their own dimension", () => {
    expect(classifyUnitDimension("ton")).toBe("discrete-packaging:ton");
    expect(classifyUnitDimension("bag")).toBe("discrete-packaging:bag");
    expect(classifyUnitDimension("pallet")).toBe("discrete-packaging:pallet");
    expect(classifyUnitDimension("ton")).not.toBe(classifyUnitDimension("bag"));
    expect(classifyUnitDimension("bag")).not.toBe(classifyUnitDimension("pallet"));
  });
});

describe("findKnownConversion", () => {
  it("knows yd3 <-> ft3 is a factor of 27, in both directions", () => {
    const forward = findKnownConversion("yd3", "ft3");
    expect(forward).not.toBeNull();
    expect(forward?.factor).toBe(27);

    const backward = findKnownConversion("ft3", "yd3");
    expect(backward).not.toBeNull();
    expect(backward?.factor).toBeCloseTo(1 / 27);
  });

  it("never fabricates a factor for a dimension pair it doesn't have one for", () => {
    // sqft (area) vs yd3 (volume) — no universal conversion is possible.
    expect(findKnownConversion("sqft", "yd3")).toBeNull();
    expect(findKnownConversion("yd3", "sqft")).toBeNull();
  });

  it("returns null for identical units", () => {
    expect(findKnownConversion("sqft", "sqft")).toBeNull();
  });
});

describe("describeUnitRelationship", () => {
  it("reports same-unit for identical units", () => {
    expect(describeUnitRelationship("sqft", "sqft")).toEqual({ kind: "same-unit" });
    expect(describeUnitRelationship("each", "each")).toEqual({ kind: "same-unit" });
  });

  it("reports known-conversion for yd3 <-> ft3, both directions", () => {
    const forward = describeUnitRelationship("yd3", "ft3");
    expect(forward.kind).toBe("known-conversion");
    if (forward.kind === "known-conversion") {
      expect(forward.conversion.factor).toBe(27);
    }

    const backward = describeUnitRelationship("ft3", "yd3");
    expect(backward.kind).toBe("known-conversion");
    if (backward.kind === "known-conversion") {
      expect(backward.conversion.factor).toBeCloseTo(1 / 27);
    }
  });

  it("reports incompatible for sq ft vs linear ft (area vs length)", () => {
    const result = describeUnitRelationship("sqft", "linear-ft");
    expect(result).toEqual({ kind: "incompatible", resourceDimension: "area", assemblyDimension: "length" });
  });

  it("reports incompatible for sq ft vs yd3 (area vs volume), and never invents a factor", () => {
    const result = describeUnitRelationship("sqft", "yd3");
    expect(result).toEqual({ kind: "incompatible", resourceDimension: "area", assemblyDimension: "volume" });
    // Guard against a future regression where someone adds a "conversion"
    // for a pair that has no universal physical factor.
    expect(findKnownConversion("sqft", "yd3")).toBeNull();
  });

  it("reports incompatible for each vs anything else", () => {
    expect(describeUnitRelationship("each", "sqft")).toEqual({ kind: "incompatible", resourceDimension: "count", assemblyDimension: "area" });
    expect(describeUnitRelationship("each", "ton")).toEqual({ kind: "incompatible", resourceDimension: "count", assemblyDimension: "discrete-packaging:ton" });
  });

  it("reports ambiguous for equipment hour vs day (same time dimension, no safe factor)", () => {
    const result = describeUnitRelationship("hour", "day");
    expect(result.kind).toBe("ambiguous");
  });

  it("reports ambiguous whenever either side is custom", () => {
    expect(describeUnitRelationship("custom", "sqft").kind).toBe("ambiguous");
    expect(describeUnitRelationship("sqft", "custom").kind).toBe("ambiguous");
    expect(describeUnitRelationship("custom", "custom").kind).toBe("same-unit");
  });

  it("reports incompatible for ton vs bag (two different discrete-packaging dimensions)", () => {
    const result = describeUnitRelationship("ton", "bag");
    expect(result).toEqual({
      kind: "incompatible",
      resourceDimension: "discrete-packaging:ton",
      assemblyDimension: "discrete-packaging:bag",
    });
  });
});
