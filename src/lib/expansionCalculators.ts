import Decimal from "decimal.js";

export type CalculatorKind = "job" | "margin" | "mulch" | "topsoil" | "labor";
export interface CalculatorField { key: string; label: string; value: string; hint?: string; max?: number; positive?: boolean; integer?: boolean }
export interface CalculatorResult { label: string; value: string }
const field = (key: string, label: string, value: string, hint?: string): CalculatorField => ({ key, label, value, hint });
const overhead = field("overhead", "Overhead (%)", "15", "Percentage of direct costs; do not include these costs twice.");
const margin: CalculatorField = { ...field("margin", "Target margin (%)", "35", "Profit as a share of the pre-tax selling price."), max: 99.9 };
export const calculatorFields: Record<CalculatorKind, CalculatorField[]> = {
  job: [
    field("revenue", "Quoted revenue ($, before tax)", "5000"),
    ...["Materials", "Labor", "Equipment", "Delivery", "Other"].flatMap((label, i) => [
      field(`estimated${label}`, `Estimated ${label.toLowerCase()} ($)`, ["1200", "800", "200", "150", "50"][i]),
      field(`actual${label}`, `Actual ${label.toLowerCase()} ($)`, ["1350", "1100", "250", "150", "50"][i]),
    ]), overhead,
  ],
  margin: [field("cost", "Total job cost ($, including overhead)", "3000"), field("revenue", "Selling price ($, before tax)", "4500"), margin],
  mulch: [field("area", "Bed area (square feet)", "1000"), field("depth", "Mulch depth (inches)", "3"), field("allowance", "Waste allowance (%)", "10"), field("unitPrice", "Bulk mulch price ($ per cubic yard)", "42"), { ...field("bagSize", "Bag size (cubic feet)", "2"), positive: true }, field("bagPrice", "Price per bag ($)", "4"), field("delivery", "Bulk delivery ($)", "75"), field("labor", "Installation labor ($)", "240"), field("equipment", "Equipment and other direct costs ($)", "0"), overhead, margin],
  topsoil: [field("area", "Area to cover (square feet)", "1000"), field("depth", "Finished soil depth (inches)", "4"), field("allowance", "Extra volume allowance (%)", "15", "Ask your supplier about settlement; this is an input, not a recommended factor."), field("unitPrice", "Soil price ($ per cubic yard)", "38"), { ...field("density", "Supplier density (US short tons per cubic yard)", "1.2", "Illustrative only. Density varies with soil and moisture; confirm with your supplier."), positive: true }, field("tonPrice", "Alternative soil price ($ per US short ton)", "32"), field("delivery", "Delivery ($)", "120"), field("labor", "Spreading labor ($)", "320"), field("equipment", "Equipment and other direct costs ($)", "90"), overhead, margin],
  labor: [field("wage", "Base hourly wage per person ($)", "24"), field("burden", "Payroll burden (%)", "25", "Your payroll taxes, insurance, and percentage-based benefits; no statutory rate is assumed."), field("benefits", "Additional benefits per person-hour ($)", "2"), { ...field("crew", "Crew size (people)", "3"), positive: true, integer: true }, field("hours", "On-site hours per person", "8"), field("travel", "Paid travel and loading hours per person", "1"), overhead, margin],
};

export function validateCalculatorInput(f: CalculatorField, raw: string): string | undefined {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim())) return "Enter a number of zero or more.";
  const n = Number(raw);
  if (!Number.isFinite(n) || n > (f.max ?? 1_000_000)) return `Enter a value no greater than ${f.max ?? 1_000_000}.`;
  if (f.positive && n <= 0) return "Enter a number greater than zero.";
  if (f.integer && !Number.isInteger(n)) return "Enter a whole number of people.";
}

export function calculateExpansion(kind: CalculatorKind, values: Record<string, string>): CalculatorResult[] {
  for (const f of calculatorFields[kind]) {
    const error = validateCalculatorInput(f, values[f.key] ?? "");
    if (error) throw new Error(`${f.label}: ${error}`);
  }
  const d = (key: string) => new Decimal(values[key].trim());
  // Format the exact decimal string without converting large totals to binary floats.
  const money = (n: Decimal) => {
    const [whole, fraction] = n.abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2).split(".");
    return `${n.isNegative() && !n.isZero() ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
  };
  const qty = (n: Decimal, unit: string) => `${n.toDecimalPlaces(2).toNumber().toLocaleString("en-US")} ${unit}`;
  const percentage = (num: Decimal, den: Decimal) => den.isZero() ? "Not defined (zero denominator)" : `${num.div(den).times(100).toFixed(2)}%`;
  const result = (label: string, value: string) => ({ label, value });
  const withOverhead = (direct: Decimal) => direct.times(d("overhead").div(100).plus(1));
  const required = (cost: Decimal) => cost.div(new Decimal(1).minus(d("margin").div(100))).toDecimalPlaces(2, Decimal.ROUND_CEIL);
  const pricing = (direct: Decimal) => [result("Direct cost", money(direct)), result("True cost including overhead", money(withOverhead(direct))), result("Required pre-tax price", money(required(withOverhead(direct))))];
  if (kind === "job") {
    const categories = ["Materials", "Labor", "Equipment", "Delivery", "Other"];
    const estimated = withOverhead(categories.reduce((s, c) => s.plus(d(`estimated${c}`)), new Decimal(0)));
    const actual = withOverhead(categories.reduce((s, c) => s.plus(d(`actual${c}`)), new Decimal(0)));
    return [result("Estimated true cost", money(estimated)), result("Actual true cost", money(actual)), result("Cost variance (positive = over budget)", money(actual.minus(estimated))), result("Cost variance (%)", percentage(actual.minus(estimated), estimated)), result("Expected job profit", money(d("revenue").minus(estimated))), result("Actual job profit", money(d("revenue").minus(actual))), result("Actual margin", percentage(d("revenue").minus(actual), d("revenue"))), ...categories.map(c => result(`${c} variance`, money(d(`actual${c}`).minus(d(`estimated${c}`)))))];
  }
  if (kind === "margin") {
    const profit = d("revenue").minus(d("cost"));
    return [result("Job profit", money(profit)), result("Profit margin", percentage(profit, d("revenue"))), result("Markup on cost", percentage(profit, d("cost"))), result("Required pre-tax price", money(required(d("cost")))), result("Price change to reach target", money(required(d("cost")).minus(d("revenue"))))];
  }
  if (kind === "labor") {
    const rate = d("wage").times(d("burden").div(100).plus(1)).plus(d("benefits"));
    const hours = d("hours").plus(d("travel")).times(d("crew"));
    return [result("Loaded cost per person-hour", money(rate)), result("Loaded cost per crew-hour", money(rate.times(d("crew")))), result("Total paid person-hours", qty(hours, "hours")), ...pricing(rate.times(hours))];
  }
  const base = d("area").times(d("depth")).div(324);
  const volume = base.times(d("allowance").div(100).plus(1));
  const material = volume.times(d("unitPrice"));
  const direct = material.plus(d("delivery")).plus(d("labor")).plus(d("equipment"));
  const common = [result("Volume before allowance", qty(base, "cubic yards")), result("Volume including allowance", qty(volume, "cubic yards")), result("Bulk material cost", money(material))];
  if (kind === "mulch") {
    const bags = volume.times(27).div(d("bagSize")).ceil();
    return [...common, result("Whole bags needed", qty(bags, "bags")), result("Bagged material cost (pickup)", money(bags.times(d("bagPrice")))), result("Bulk material plus delivery", money(material.plus(d("delivery")))), ...pricing(direct)];
  }
  const tons = volume.times(d("density"));
  return [...common, result("Estimated weight", qty(tons, "US short tons")), result("Alternative material cost by weight", money(tons.times(d("tonPrice")))), ...pricing(direct)];
}
