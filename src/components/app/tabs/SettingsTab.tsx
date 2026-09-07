import { useId, useRef, useState } from "react";
import { Download, Upload, RotateCcw } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import { exportWorkspaceJson, parseWorkspaceJson } from "../../../lib/persistence";
import { createSampleWorkspace } from "../../../lib/sampleData";
import { Button, Card, Field, NumberInput } from "../../ui/primitives";

function n(value: number | ""): number {
  return value === "" ? 0 : value;
}

export default function SettingsTab() {
  const { workspace, updateBusiness, replaceWorkspace } = useWorkspace();
  const { business } = workspace;
  const idPrefix = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleExport() {
    const json = exportWorkspaceJson(workspace);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `landscape-estimate-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseWorkspaceJson(String(reader.result ?? ""));
      if (!result.ok || !result.workspace) {
        setImportMessage({ type: "error", text: result.error ?? "Import failed." });
        return;
      }
      replaceWorkspace(result.workspace);
      setImportMessage({ type: "success", text: "Workspace restored from backup." });
    };
    reader.readAsText(file);
  }

  function handleReset() {
    if (!window.confirm("Reset your workspace to the sample data? This replaces your current materials, equipment, assemblies, and estimates.")) {
      return;
    }
    replaceWorkspace(createSampleWorkspace());
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <h2 className="text-lg font-bold text-ink">Business assumptions</h2>
        <p className="mt-1 text-sm text-muted">
          Set these once — every estimate, assembly, and rate-health check in Pro uses these numbers by default.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Loaded labor rate" htmlFor={`${idPrefix}-labor`} hint="Wages + payroll tax + benefits, per person-hour">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-labor`}
                value={business.loadedLaborRate}
                onValueChange={(v) => updateBusiness({ loadedLaborRate: n(v) })}
                className="pl-7"
              />
            </div>
          </Field>
          <Field label="Overhead" htmlFor={`${idPrefix}-overhead`} hint="As % of direct job cost">
            <div className="relative">
              <NumberInput
                id={`${idPrefix}-overhead`}
                value={business.overheadPercent}
                onValueChange={(v) => updateBusiness({ overheadPercent: n(v) })}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
          <Field label="Target margin" htmlFor={`${idPrefix}-margin`} hint="Profit share of selling price">
            <div className="relative">
              <NumberInput
                id={`${idPrefix}-margin`}
                value={business.targetMarginPercent}
                onValueChange={(v) => updateBusiness({ targetMarginPercent: n(v) })}
                className="pr-9"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">%</span>
            </div>
          </Field>
          <Field label="Default delivery cost" htmlFor={`${idPrefix}-delivery`}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-delivery`}
                value={business.defaultDeliveryCost}
                onValueChange={(v) => updateBusiness({ defaultDeliveryCost: n(v) })}
                className="pl-7"
              />
            </div>
          </Field>
          <Field label="Minimum project price" htmlFor={`${idPrefix}-minimum`}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">$</span>
              <NumberInput
                id={`${idPrefix}-minimum`}
                value={business.minimumProjectPrice}
                onValueChange={(v) => updateBusiness({ minimumProjectPrice: n(v) })}
                className="pl-7"
              />
            </div>
          </Field>
          <Field label="Round prices to" htmlFor={`${idPrefix}-round`}>
            <select
              id={`${idPrefix}-round`}
              value={business.roundDisplayTo}
              onChange={(e) => updateBusiness({ roundDisplayTo: e.target.value as "dollar" | "cent" })}
              className="block w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-lime-surface"
            >
              <option value="dollar">Nearest dollar</option>
              <option value="cent">Nearest cent</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">Backup &amp; restore</h2>
        <p className="mt-1 text-sm text-muted">
          Your workspace lives only in this browser. Export a JSON backup regularly, and use it to move your data to
          another device.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={handleExport}>
            <Download size={18} aria-hidden="true" /> Export workspace (JSON)
          </Button>
          <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} aria-hidden="true" /> Import workspace
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {importMessage && (
          <p role="status" className={`mt-3 text-sm font-medium ${importMessage.type === "error" ? "text-red" : "text-mint-ink"}`}>
            {importMessage.text}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">Reset</h2>
        <p className="mt-1 text-sm text-muted">Replace your current workspace with the sample starting data.</p>
        <div className="mt-4">
          <Button type="button" variant="danger" onClick={handleReset}>
            <RotateCcw size={18} aria-hidden="true" /> Reset workspace
          </Button>
        </div>
      </Card>
    </div>
  );
}
