import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("matches the brief's reference CSV shape", () => {
    const csv = buildCsv([
      { item: "mulch", quantity: 8, unit: "yd3", unitCost: 42, total: 336 },
      { item: "shrubs", quantity: 18, unit: "each", unitCost: 28, total: 504 },
      { item: "labor", quantity: 24, unit: "person-hour", unitCost: 32, total: 768 },
      { item: "skid steer", quantity: 4, unit: "hour", unitCost: 45, total: 180 },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("item,quantity,unit,unit_cost,total");
    expect(lines[1]).toBe("mulch,8,yd3,42,336");
    expect(lines).toHaveLength(5);
  });

  it("quotes a field containing a comma so it doesn't corrupt columns", () => {
    const csv = buildCsv([{ item: "Mulch, delivered", quantity: 1, unit: "job", unitCost: 100, total: 100 }]);
    expect(csv).toContain('"Mulch, delivered"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = buildCsv([{ item: 'The "good" mulch', quantity: 1, unit: "job", unitCost: 1, total: 1 }]);
    expect(csv).toContain('"The ""good"" mulch"');
  });

  it("produces just the header row for an empty list", () => {
    const csv = buildCsv([]);
    expect(csv).toBe("item,quantity,unit,unit_cost,total");
  });
});
