/**
 * CSV export for a project's line items. Every field is quoted per RFC
 * 4180 whenever it contains a comma, quote, newline, or tab — a service name
 * like "Mulch, delivered" must not silently corrupt the column layout.
 *
 * User-controlled text fields (`item`, `unit` — catalog names the user
 * typed) are ALSO defused against spreadsheet-formula injection: a cell
 * whose content starts with `=`, `+`, `-`, `@`, a tab, or a carriage return
 * (optionally after leading whitespace) is a live formula to Excel/Sheets
 * the moment the file is opened — e.g. a material named `=CMD(...)` could
 * execute an OS command via a legacy DDE formula. Prefixing an apostrophe is
 * the standard spreadsheet-safe escape: it forces the cell to render as
 * literal text without changing what the user sees. Numeric fields
 * (`quantity`, `unitCost`, `total`) are generated internally by this app,
 * never typed by a user, so they're only ever RFC-4180-quoted, never
 * apostrophe-prefixed.
 */
export interface CsvRow {
  item: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

const RFC4180_NEEDS_QUOTING = /["\,\n\r\t]/;

function rfc4180Quote(str: string): string {
  return RFC4180_NEEDS_QUOTING.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** A leading formula-trigger character (=, +, -, @) or a leading tab/CR —
 * optionally after leading whitespace, since spreadsheet apps still treat
 * "   =SUM(1,1)" as a formula — gets an apostrophe prefix so it's read back
 * as inert text. */
const FORMULA_INJECTION_LEAD = /^[ \t]*[=+\-@\t\r]/;

function escapeUserCsvField(value: string): string {
  const neutralized = FORMULA_INJECTION_LEAD.test(value) ? `'${value}` : value;
  return rfc4180Quote(neutralized);
}

function escapeNumericCsvField(value: number): string {
  return rfc4180Quote(String(value));
}

export function buildCsv(rows: CsvRow[]): string {
  const header = ["item", "quantity", "unit", "unit_cost", "total"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeUserCsvField(row.item),
        escapeNumericCsvField(row.quantity),
        escapeUserCsvField(row.unit),
        escapeNumericCsvField(row.unitCost),
        escapeNumericCsvField(row.total),
      ].join(",")
    );
  }
  // CSV lines are joined with CRLF per RFC 4180.
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
