/**
 * Regression suite for DEF-02: CSV export did not neutralize
 * spreadsheet-formula-injection characters. A material/service/equipment
 * name (all user-controlled catalog text) beginning with =, +, -, @, a tab,
 * or a carriage return is a live formula the instant the exported CSV is
 * opened in Excel/Sheets — e.g. a material named "=CMD(...)" could execute
 * an OS command via a legacy DDE formula. Every case below is exercised
 * against the real buildCsv()/CsvRow pipeline, not a reimplementation.
 */
import { describe, expect, it } from "vitest";
import { buildCsv, type CsvRow } from "./csv";

function rowWithItem(item: string): CsvRow {
  return { item, quantity: 1, unit: "each", unitCost: 10, total: 10 };
}

/** Parses a single (unquoted-comma-free-content) CSV data line back into its
 * raw cell strings, unwrapping RFC-4180 quoting — good enough for asserting
 * on the exact escaped content this module produces. */
function firstDataCell(csv: string): string {
  const dataLine = csv.split("\r\n")[1];
  const firstComma = dataLine.startsWith('"') ? dataLine.indexOf('",') + 1 : dataLine.indexOf(",");
  const raw = dataLine.slice(0, firstComma);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/""/g, '"');
  }
  return raw;
}

describe("DEF-02 — CSV formula-injection neutralization", () => {
  const payloads: [string, string][] = [
    ["=CMD(...)", '=CMD(...)'],
    ["+SUM(1,1)", "+SUM(1,1)"],
    ["-2+3", "-2+3"],
    ["@SUM(1,1)", "@SUM(1,1)"],
    ["leading whitespace followed by =", "   =CMD(calc)"],
  ];

  for (const [label, payload] of payloads) {
    it(`neutralizes "${label}" with a leading apostrophe so it reads back as inert text`, () => {
      const csv = buildCsv([rowWithItem(payload)]);
      const cell = firstDataCell(csv);
      expect(cell.startsWith("'")).toBe(true);
      expect(cell).toBe(`'${payload}`);
      // The neutralized cell must not itself parse as a formula trigger.
      expect(/^[=+@-]/.test(cell)).toBe(false);
    });
  }

  it("a tab character leading the field is neutralized and the field is quoted (tabs also need RFC-4180 quoting)", () => {
    const csv = buildCsv([rowWithItem("\tmalicious")]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.startsWith('"\'\t')).toBe(true);
  });

  it("commas and quotes combined with a formula prefix: both the injection guard and RFC-4180 quoting apply together", () => {
    const payload = '=CMD("a,b")';
    const csv = buildCsv([rowWithItem(payload)]);
    const dataLine = csv.split("\r\n")[1];
    // RFC-4180 quoting wraps the whole (apostrophe-prefixed) field and
    // doubles the embedded quotes.
    expect(dataLine.startsWith('"\'=CMD(""a,b"")"')).toBe(true);
  });

  it("newline-containing fields are still RFC-4180 quoted (unrelated to the injection guard, but must keep working)", () => {
    const csv = buildCsv([rowWithItem("Mulch\ninstall")]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.startsWith('"Mulch\ninstall"')).toBe(true);
  });

  it("a completely ordinary name is never apostrophe-prefixed or otherwise altered", () => {
    const csv = buildCsv([rowWithItem("Mulch Install")]);
    const cell = firstDataCell(csv);
    expect(cell).toBe("Mulch Install");
  });

  it("a name that merely CONTAINS a hyphen/equals sign later in the string (not leading) is left alone", () => {
    const csv = buildCsv([rowWithItem("Grade-A Topsoil = Premium")]);
    const cell = firstDataCell(csv);
    expect(cell).toBe("Grade-A Topsoil = Premium");
  });

  it("internally-generated numeric fields (quantity/unitCost/total) are never apostrophe-prefixed, even when negative", () => {
    // Numeric fields come from this app's own math, never user keystrokes —
    // the injection guard must not touch them, or a legitimate negative
    // variance/adjustment number would be corrupted into text.
    const row: CsvRow = { item: "Adjustment", quantity: -1, unit: "each", unitCost: -5, total: -5 };
    const csv = buildCsv([row]);
    const dataLine = csv.split("\r\n")[1];
    const cells = dataLine.split(",");
    expect(cells[1]).toBe("-1"); // quantity, untouched
    expect(cells[3]).toBe("-5"); // unit_cost, untouched
    expect(cells[4]).toBe("-5"); // total, untouched
  });

  it("the unit field (also user-controlled catalog text) gets the same injection guard as item", () => {
    const row: CsvRow = { item: "Mulch", quantity: 1, unit: "=HYPERLINK(\"http://evil\")", unitCost: 10, total: 10 };
    const csv = buildCsv([row]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain("'=HYPERLINK");
  });
});
