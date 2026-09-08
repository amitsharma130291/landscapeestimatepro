import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import { formatUnitLabel } from "../../../lib/calc";
import { Button, Card, NumberInput, Select, TextInput } from "../../ui/primitives";
import { CostImpactBanner, useCostImpactAlert } from "../CostImpactBanner";
import type { EquipmentRateType, MaterialUnit } from "../../../lib/types";

const MATERIAL_UNITS: MaterialUnit[] = ["each", "sqft", "linear-ft", "yd3", "ton", "bag", "pallet", "hour", "job", "custom"];
const EQUIPMENT_RATE_TYPES: EquipmentRateType[] = ["hour", "day", "job", "custom"];

export default function CatalogTab() {
  const { workspace, addMaterial, updateMaterial, removeMaterial, addEquipment, updateEquipment, removeEquipment } = useWorkspace();
  const idPrefix = useId();
  const costImpact = useCostImpactAlert();

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
            onClick={() => addMaterial({ name: "New material", unitCost: 0, unit: "each" })}
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
              {workspace.materials.map((material, index) => (
                <tr key={material.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-2.5 sm:px-6">
                    <label className="sr-only" htmlFor={`${idPrefix}-mat-name-${index}`}>Material name</label>
                    <TextInput id={`${idPrefix}-mat-name-${index}`} value={material.name} onChange={(e) => updateMaterial(material.id, { name: e.target.value })} />
                  </td>
                  <td className="px-3 py-2.5">
                    <label className="sr-only" htmlFor={`${idPrefix}-mat-cost-${index}`}>Unit cost</label>
                    <NumberInput
                      id={`${idPrefix}-mat-cost-${index}`}
                      value={material.unitCost}
                      onValueChange={(v) => updateMaterial(material.id, { unitCost: v === "" ? 0 : v })}
                      onFocus={() => costImpact.startTracking("material", material.id, material.unitCost, workspace)}
                      onBlur={() => costImpact.finishTracking(material.unitCost, workspace, material.name)}
                      className="w-28"
                    />
                  </td>
                  <td className="px-3 py-2.5">
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
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => removeMaterial(material.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${material.name}`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
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
            onClick={() => addEquipment({ name: "New equipment", rate: 0, rateType: "hour" })}
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
              {workspace.equipment.map((item, index) => (
                <tr key={item.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-2.5 sm:px-6">
                    <label className="sr-only" htmlFor={`${idPrefix}-eq-name-${index}`}>Equipment name</label>
                    <TextInput id={`${idPrefix}-eq-name-${index}`} value={item.name} onChange={(e) => updateEquipment(item.id, { name: e.target.value })} />
                  </td>
                  <td className="px-3 py-2.5">
                    <label className="sr-only" htmlFor={`${idPrefix}-eq-rate-${index}`}>Rate</label>
                    <NumberInput
                      id={`${idPrefix}-eq-rate-${index}`}
                      value={item.rate}
                      onValueChange={(v) => updateEquipment(item.id, { rate: v === "" ? 0 : v })}
                      onFocus={() => costImpact.startTracking("equipment", item.id, item.rate, workspace)}
                      onBlur={() => costImpact.finishTracking(item.rate, workspace, item.name)}
                      className="w-28"
                    />
                  </td>
                  <td className="px-3 py-2.5">
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
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => removeEquipment(item.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${item.name}`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
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
