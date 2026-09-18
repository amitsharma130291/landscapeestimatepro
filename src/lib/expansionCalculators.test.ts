import { describe, expect, it } from "vitest";
import { calculateExpansion, calculatorFields, validateCalculatorInput, type CalculatorKind } from "./expansionCalculators";
const defaults = (kind: CalculatorKind) => Object.fromEntries(calculatorFields[kind].map(f => [f.key, f.value]));
const run = (kind: CalculatorKind, patch = {}) => Object.fromEntries(calculateExpansion(kind, { ...defaults(kind), ...patch }).map(r => [r.label, r.value]));
describe("free calculator independent worked examples", () => {
  it("keeps quoted revenue fixed when actual costs overrun", () => {
    const r = run("job");
    expect(r["Estimated true cost"]).toBe("$2,760.00");
    expect(r["Actual true cost"]).toBe("$3,335.00");
    expect(r["Cost variance (positive = over budget)"]).toBe("$575.00");
    expect(r["Actual job profit"]).toBe("$1,665.00");
    expect(r["Actual margin"]).toBe("33.30%");
  });
  it("distinguishes margin from markup and rounds target price upward", () => {
    expect(run("margin")).toMatchObject({ "Job profit": "$1,500.00", "Profit margin": "33.33%", "Markup on cost": "50.00%", "Required pre-tax price": "$4,615.39" });
    expect(run("margin", { cost: "3000", revenue: "4050" })["Profit margin"]).toBe("25.93%");
  });
  it("shows losses and undefined denominators honestly", () => {
    expect(run("margin", { cost: "100", revenue: "80" })["Profit margin"]).toBe("-25.00%");
    expect(run("margin", { revenue: "0" })["Profit margin"]).toContain("Not defined");
    expect(run("margin", { cost: "0" })["Markup on cost"]).toContain("Not defined");
  });
  it("converts inches to yards and rounds the total number of bags up", () => {
    expect(run("mulch")).toMatchObject({ "Volume including allowance": "10.19 cubic yards", "Whole bags needed": "138 bags", "Bagged material cost (pickup)": "$552.00", "Bulk material plus delivery": "$502.78", "Required pre-tax price": "$1,314.15" });
    expect(run("mulch", { area: "324", depth: "1", allowance: "0" })["Volume before allowance"]).toBe("1 cubic yards");
  });
  it("uses supplied density and never adds volume and weight quotes together", () => {
    expect(run("topsoil")).toMatchObject({ "Estimated weight": "17.04 US short tons", "Alternative material cost by weight": "$545.19", "Required pre-tax price": "$1,892.21" });
    expect(run("topsoil", { tonPrice: "900" })["Required pre-tax price"]).toBe(run("topsoil")["Required pre-tax price"]);
  });
  it("accounts for paid travel per crew member", () => {
    expect(run("labor")).toMatchObject({ "Loaded cost per person-hour": "$32.00", "Total paid person-hours": "27 hours", "Direct cost": "$864.00", "Required pre-tax price": "$1,528.62" });
    expect(run("labor", { travel: "0" })["Direct cost"]).toBe("$768.00");
  });
  it.each(["", "-1", "NaN", "Infinity", "1e999", "1000001"])("rejects invalid input %s instead of retaining stale results", value => {
    expect(() => run("margin", { cost: value })).toThrow();
  });
  it("rejects 100% margins, fractional crews, and zero bag sizes", () => {
    expect(() => run("margin", { margin: "100" })).toThrow();
    expect(() => run("labor", { crew: "2.5" })).toThrow();
    expect(() => run("mulch", { bagSize: "0" })).toThrow();
    expect(validateCalculatorInput(calculatorFields.margin[2], "0")).toBeUndefined();
  });
  it("accepts surrounding whitespace in pasted values", () => {
    expect(run("margin", { cost: " 3000 " })["Required pre-tax price"]).toBe("$4,615.39");
  });
});
