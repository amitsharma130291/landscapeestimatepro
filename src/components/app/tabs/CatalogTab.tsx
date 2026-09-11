import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import { formatUnitLabel } from "../../../lib/calc";
import { findCatalogItemReferences, type CatalogItemReferences } from "../../../lib/estimateMath";
import { ZERO_CENTS, type MoneyCents } from "../../../lib/money";
import { getMaterialValidationErrors, getEquipmentValidationErrors } from "../../../lib/validation";
import { Button, Card, MoneyInput, Select, TextInput } from "../../ui/primitives";
import { CostImpactBanner, useCostImpactAlert } from "../CostImpactBanner";
import type { EquipmentRateType, MaterialUnit } from "../../../lib/types";

const MATERIAL_UNITS: MaterialUnit[] = ["each", "sqft", "linear-ft", "yd3", "ft3", "ton", "bag", "pallet", "hour", "job", "custom"];
const EQUIPMENT_RATE_TYPES: EquipmentRateType[] = ["hour", "day", "job", "custom"];

/** Builds the confirmation text for a blocked/confirmable delete — lists
 * exactly which assemblies, templates, and projects would be left with a
 * dangling reference, so the user can make an informed Cancel/proceed
 * decision rather than discovering a silently-undercounted quote later. */
function describeReferences(refs: CatalogItemReferences): string {
  const parts: string[] = [];
  if (refs.assemblies.length > 0) parts.push(`${refs.assemblies.length} service${refs.assemblies.length === 1 ? "" : "s"} (${refs.assemblies.map((a) => a.name).join(", ")})`);
  if (refs.templates.length > 0) parts.push(`${refs.templates.length} template${refs.templates.length === 1 ? "" : "s"} (${refs.templates.map((t) => t.name).join(", ")})`);
  if (refs.projects.length > 0) parts.push(`${refs.projects.length} project${refs.projects.length === 1 ? "" : "s"} (${refs.projects.map((p) => p.name).join(", ")})`);
  return parts.join("; ");
}

export default function CatalogTab() {
  const { workspace, addMaterial, updateMaterial, removeMaterial, addEquipment, updateEquipment, removeEquipment } = useWorkspace();
  const idPrefix = useId();
  const costImpact = useCostImpactAlert();

  function handleRemoveMaterial(id: string, name: string) {
    const refs = findCatalogItemReferences("material", id, workspace);
    const isReferenced = refs.assemblies.length > 0 || refs.templates.length > 0 || refs.projects.length > 0;
    if (isReferenced) {
      const proceed = window.confirm(
        `"${name}" is still used by ${describeReferences(refs)}. Deleting it will leave those referencing it unable to cost this material — their quotes would need to be corrected before they can be quoted again.\n\nDelete "${name}" anyway?`
      );
      if (!proceed) return;
    }
    removeMaterial(id);
  }

  function handleRemoveEquipment(id: string, name: string) {
    const refs = findCatalogItemReferences("equipment", id, workspace);
    const isReferenced = refs.assemblies.length > 0 || refs.templates.length > 0 || refs.projects.length > 0;
    if (isReferenced) {
      const proceed = window.confirm(
        `"${name}" is still used by ${describeReferences(refs)}. Deleting it will leave those referencing it unable to cost this equipment — their quotes would need to be corrected before they can be quoted again.\n\nDelete "${name}" anyway?`
      );
      if (!proceed) return;
    }
    removeEquipment(id);
  }

  return (
    <div className="space-y-8">
      <CostImpactBanner result={costImpact.result} onDismiss={costImpact.dismiss} />

      <Card padded={false}>
        <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
          <h2 className="text-lg font-bold text-ink">Materials</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => addMaterial({ name: "New material", unitCostCents: ZERO_CENTS, unit: "each" })}
          >
            <Plus size={16} aria-hidden="true" /> Add material
          </Button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3 sm:px-6">Name</th>
                <th scope="col" className="px-3 py-3">Unit cost</th>
                <th scope="col" className="px-3 py-3">Unit</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {workspace.materials.map((material, index) => {
                const errors = getMaterialValidationErrors(material);
                return (
                  <tr key={material.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-2.5 sm:px-6 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-mat-name-${index}`}>Material name</label>
                      <TextInput id={`${idPrefix}-mat-name-${index}`} value={material.name} onChange={(e) => updateMaterial(material.id, { name: e.target.value })} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-mat-cost-${index}`}>Unit cost</label>
                      <MoneyInput
                        id={`${idPrefix}-mat-cost-${index}`}
                        valueCents={material.unitCostCents}
                        onValueCentsChange={(v) => updateMaterial(material.id, { unitCostCents: v === "" ? ZERO_CENTS : v })}
                        onFocus={() => costImpact.startTracking("material", material.id, material.unitCostCents, workspace)}
                        onCommit={(v) => {
                          const committedCents = v === "" ? ZERO_CENTS : v;
                          // React hasn't re-rendered with the just-committed
                          // value yet at this point, so `workspace` here is
                          // still the PRE-commit snapshot — build the "after"
                          // picture by hand rather than trusting that closure.
                          const afterWorkspace = { ...workspace, materials: workspace.materials.map((m) => (m.id === material.id ? { ...m, unitCostCents: committedCents } : m)) };
                          costImpact.finishTracking(committedCents, afterWorkspace, material.name);
                        }}
                        invalid={errors.length > 0}
                        className="w-28"
                      />
                      {errors.length > 0 && <p role="alert" className="mt-1 text-xs font-medium text-red">{errors[0]}</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-mat-unit-${index}`}>Unit</label>
                      <Select
                        id={`${idPrefix}-mat-unit-${index}`}
                        value={material.unit}
                        onChange={(e) => updateMaterial(material.id, { unit: e.target.value as MaterialUnit })}
                        className="w-32"
                      >
                        {MATERIAL_UNITS.map((unit) => (
                          <option key={unit} value={unit}>{formatUnitLabel(unit, material.customUnitLabel)}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <button type="button" onClick={() => handleRemoveMaterial(material.id, material.name)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${material.name}`}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {workspace.materials.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted sm:px-6">No materials yet — add one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
          <h2 className="text-lg font-bold text-ink">Equipment</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => addEquipment({ name: "New equipment", rateCents: ZERO_CENTS, rateType: "hour" })}
          >
            <Plus size={16} aria-hidden="true" /> Add equipment
          </Button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-paper text-left text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3 sm:px-6">Name</th>
                <th scope="col" className="px-3 py-3">Rate</th>
                <th scope="col" className="px-3 py-3">Billed per</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {workspace.equipment.map((item, index) => {
                const errors = getEquipmentValidationErrors(item);
                return (
                  <tr key={item.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-2.5 sm:px-6 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-eq-name-${index}`}>Equipment name</label>
                      <TextInput id={`${idPrefix}-eq-name-${index}`} value={item.name} onChange={(e) => updateEquipment(item.id, { name: e.target.value })} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-eq-rate-${index}`}>Rate</label>
                      <MoneyInput
                        id={`${idPrefix}-eq-rate-${index}`}
                        valueCents={item.rateCents}
                        onValueCentsChange={(v: MoneyCents | "") => updateEquipment(item.id, { rateCents: v === "" ? ZERO_CENTS : v })}
                        onFocus={() => costImpact.startTracking("equipment", item.id, item.rateCents, workspace)}
                        onCommit={(v) => {
                          const committedCents = v === "" ? ZERO_CENTS : v;
                          const afterWorkspace = { ...workspace, equipment: workspace.equipment.map((e) => (e.id === item.id ? { ...e, rateCents: committedCents } : e)) };
                          costImpact.finishTracking(committedCents, afterWorkspace, item.name);
                        }}
                        invalid={errors.length > 0}
                        className="w-28"
                      />
                      {errors.length > 0 && <p role="alert" className="mt-1 text-xs font-medium text-red">{errors[0]}</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <label className="sr-only" htmlFor={`${idPrefix}-eq-type-${index}`}>Billed per</label>
                      <Select
                        id={`${idPrefix}-eq-type-${index}`}
                        value={item.rateType}
                        onChange={(e) => updateEquipment(item.id, { rateType: e.target.value as EquipmentRateType })}
                        className="w-28"
                      >
                        {EQUIPMENT_RATE_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <button type="button" onClick={() => handleRemoveEquipment(item.id, item.name)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${item.name}`}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {workspace.equipment.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted sm:px-6">No equipment yet — add one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
