/**
 * CSV export for a project's line items. Every field is quoted per RFC
 * 4180 whenever it contains a comma, quote, or newline — a service name
 * like "Mulch, delivered" must not silently corrupt the column layout.
 */
export interface CsvRow {
  item: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(rows: CsvRow[]): string {
  const header = ["item", "quantity", "unit", "unit_cost", "total"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.item),
        escapeCsvField(row.quantity),
        escapeCsvField(row.unit),
        escapeCsvField(row.unitCost),
        escapeCsvField(row.total),
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
