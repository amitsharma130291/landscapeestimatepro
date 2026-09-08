import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import { calculateAssemblyCost } from "../../../lib/estimateMath";
import { formatCurrency, formatUnitLabel } from "../../../lib/calc";
import { Button, Card, EmptyState, NumberInput, Select, TextInput } from "../../ui/primitives";
import type { MaterialUnit } from "../../../lib/types";

const UNITS: MaterialUnit[] = ["each", "sqft", "linear-ft", "yd3", "ton", "bag", "pallet", "hour", "job", "custom"];

export default function TemplatesTab() {
  const {
    workspace,
    addAssembly,
    updateAssembly,
    removeAssembly,
    removeTemplate,
  } = useWorkspace();
  const idPrefix = useId();
  const { materials, equipment, assemblies, business, templates } = workspace;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">Service assemblies</h2>
            <p className="mt-1 text-sm text-muted">Bundle materials, labor, and equipment into one reusable service — priced per unit.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              addAssembly({ name: "New service", unit: "each", materials: [], laborPersonHoursPerUnit: 0, equipment: [], otherCostPerUnit: 0 })
            }
          >
            <Plus size={16} aria-hidden="true" /> Add assembly
          </Button>
        </div>

        {assemblies.length === 0 && (
          <div className="mt-4">
            <EmptyState title="No assemblies yet" description="Add a service assembly to start reusing materials, labor, and equipment across projects." />
          </div>
        )}

        <div className="mt-4 space-y-4">
          {assemblies.map((assembly, index) => {
            const cost = calculateAssemblyCost(assembly, materials, equipment, business.loadedLaborRate);
            return (
              <Card key={assembly.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid flex-1 gap-3 sm:grid-cols-[2fr_1fr_1fr] sm:items-end">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-name-${index}`}>Service name</label>
                      <TextInput id={`${idPrefix}-name-${index}`} value={assembly.name} onChange={(e) => updateAssembly(assembly.id, { name: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-unit-${index}`}>Unit</label>
                      <Select id={`${idPrefix}-unit-${index}`} value={assembly.unit} onChange={(e) => updateAssembly(assembly.id, { unit: e.target.value as MaterialUnit })}>
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>{formatUnitLabel(unit)}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-rate-${index}`}>Current rate charged</label>
                      <NumberInput
                        id={`${idPrefix}-rate-${index}`}
                        value={assembly.currentRate ?? ""}
                        onValueChange={(v) => updateAssembly(assembly.id, { currentRate: v === "" ? undefined : v })}
                      />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeAssembly(assembly.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${assembly.name}`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Materials per unit</h3>
                      <button
                        type="button"
                        className="text-xs font-semibold text-forest hover:underline"
                        onClick={() =>
                          materials[0] &&
                          updateAssembly(assembly.id, {
                            materials: [...assembly.materials, { materialId: materials[0].id, quantityPerUnit: 1 }],
                          })
                        }
                        disabled={materials.length === 0}
                      >
                        + Add material
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {assembly.materials.map((line, lineIndex) => (
                        <div key={lineIndex} className="flex items-center gap-2">
                          <Select
                            value={line.materialId}
                            onChange={(e) => {
                              const next = [...assembly.materials];
                              next[lineIndex] = { ...next[lineIndex], materialId: e.target.value };
                              updateAssembly(assembly.id, { materials: next });
                            }}
                            className="flex-1"
                          >
                            {materials.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </Select>
                          <NumberInput
                            value={line.quantityPerUnit}
                            onValueChange={(v) => {
                              const next = [...assembly.materials];
                              next[lineIndex] = { ...next[lineIndex], quantityPerUnit: v === "" ? 0 : v };
                              updateAssembly(assembly.id, { materials: next });
                            }}
                            className="w-20"
                            aria-label="Quantity per unit"
                          />
                          <button
                            type="button"
                            onClick={() => updateAssembly(assembly.id, { materials: assembly.materials.filter((_, i) => i !== lineIndex) })}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
                            aria-label="Remove material line"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      {assembly.materials.length === 0 && <p className="text-sm text-muted">No materials in this service.</p>}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Equipment per unit</h3>
                      <button
                        type="button"
                        className="text-xs font-semibold text-forest hover:underline"
                        onClick={() =>
                          equipment[0] &&
                          updateAssembly(assembly.id, {
                            equipment: [...assembly.equipment, { equipmentId: equipment[0].id, quantityPerUnit: 0 }],
                          })
                        }
                        disabled={equipment.length === 0}
                      >
                        + Add equipment
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {assembly.equipment.map((line, lineIndex) => (
                        <div key={lineIndex} className="flex items-center gap-2">
                          <Select
                            value={line.equipmentId}
                            onChange={(e) => {
                              const next = [...assembly.equipment];
                              next[lineIndex] = { ...next[lineIndex], equipmentId: e.target.value };
                              updateAssembly(assembly.id, { equipment: next });
                            }}
                            className="flex-1"
                          >
                            {equipment.map((eq) => (
                              <option key={eq.id} value={eq.id}>{eq.name}</option>
                            ))}
                          </Select>
                          <NumberInput
                            value={line.quantityPerUnit}
                            onValueChange={(v) => {
                              const next = [...assembly.equipment];
                              next[lineIndex] = { ...next[lineIndex], quantityPerUnit: v === "" ? 0 : v };
                              updateAssembly(assembly.id, { equipment: next });
                            }}
                            className="w-20"
                            aria-label="Quantity per unit"
                          />
                          <button
                            type="button"
                            onClick={() => updateAssembly(assembly.id, { equipment: assembly.equipment.filter((_, i) => i !== lineIndex) })}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
                            aria-label="Remove equipment line"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      {assembly.equipment.length === 0 && <p className="text-sm text-muted">No equipment in this service.</p>}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-labor-${index}`}>
                      Labor (person-hours per unit)
                    </label>
                    <NumberInput
                      id={`${idPrefix}-labor-${index}`}
                      value={assembly.laborPersonHoursPerUnit}
                      onValueChange={(v) => updateAssembly(assembly.id, { laborPersonHoursPerUnit: v === "" ? 0 : v })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-other-${index}`}>
                      Other cost per unit
                    </label>
                    <NumberInput
                      id={`${idPrefix}-other-${index}`}
                      value={assembly.otherCostPerUnit}
                      onValueChange={(v) => updateAssembly(assembly.id, { otherCostPerUnit: v === "" ? 0 : v })}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-xl bg-paper-dim p-4 text-sm">
                  <span className="font-semibold text-ink">True cost per {formatUnitLabel(assembly.unit)}: {formatCurrency(cost.trueCostPerUnit, { cents: true })}</span>
                  <span className="ml-2 text-muted">
                    (materials {formatCurrency(cost.materialCostPerUnit, { cents: true })} + labor {formatCurrency(cost.laborCostPerUnit, { cents: true })} + equipment {formatCurrency(cost.equipmentCostPerUnit, { cents: true })} + other {formatCurrency(cost.otherCostPerUnit, { cents: true })})
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div>
          <h2 className="text-lg font-bold text-ink">Project templates</h2>
          <p className="mt-1 text-sm text-muted">
            Save a common job type as a starting point for new estimates — open a project on the Estimates tab and
            use "Save as template," then start a new estimate from it any time.
          </p>
        </div>
        {templates.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No project templates yet" description="Build an estimate you'll reuse often, then save it as a template from the estimate editor." />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center justify-between rounded-xl border border-border bg-white p-4">
                <div>
                  <span className="font-semibold text-ink">{template.name}</span>
                  <p className="text-xs text-muted">
                    {template.serviceLines.length} service{template.serviceLines.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button type="button" onClick={() => removeTemplate(template.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${template.name}`}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
