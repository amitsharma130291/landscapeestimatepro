import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import { calculateAssemblyCost } from "../../../lib/estimateMath";
import { formatCurrency, formatUnitLabel, resolvePersonHoursPerUnit } from "../../../lib/calc";
import { ZERO_CENTS } from "../../../lib/money";
import { getAssemblyValidationErrors, validatePersonHoursPerUnit, validateProductionRate, validateQuantity } from "../../../lib/validation";
import { describeUnitRelationship } from "../../../lib/units";
import { Button, Card, DraftNumberInput, EmptyState, MoneyInput, Select, TextInput } from "../../ui/primitives";
import { HelpTooltip } from "../../ui/HelpTooltip";
import type { Assembly, AssemblyLaborInputMode, MaterialUnit } from "../../../lib/types";

const UNITS: MaterialUnit[] = ["each", "sqft", "linear-ft", "yd3", "ft3", "ton", "bag", "pallet", "hour", "job", "custom"];

/**
 * Always-shown "X unit per unit" caption plus, where the resource's unit and
 * the assembly's output unit have something worth saying about their
 * relationship, an informational or warning hint below it. Never blocks or
 * corrects `quantityPerUnit` — purely descriptive (DEF-08).
 */
function UnitRelationshipHint({
  quantityPerUnit,
  resourceUnit,
  resourceCustomLabel,
  assembly,
}: {
  quantityPerUnit: number;
  resourceUnit: string;
  resourceCustomLabel?: string;
  assembly: Assembly;
}) {
  const relationship = describeUnitRelationship(resourceUnit, assembly.unit);
  const resourceLabel = formatUnitLabel(resourceUnit, resourceCustomLabel);
  const assemblyLabel = formatUnitLabel(assembly.unit);

  return (
    <div className="pl-1">
      <p className="text-xs text-muted">
        {quantityPerUnit} {resourceLabel} per {assemblyLabel}
      </p>
      {relationship.kind === "known-conversion" && (
        <p className="text-xs text-muted">
          {relationship.conversion.description} — you're mixing units; double check your quantity.
        </p>
      )}
      {relationship.kind === "ambiguous" && (
        <p className="text-xs text-amber">
          ⚠ Different unit types ({resourceLabel} vs {assemblyLabel}) — this app can't verify the conversion; make sure your quantity accounts for it.
        </p>
      )}
      {relationship.kind === "incompatible" && (
        <p className="text-xs text-amber">
          ⚠ Different unit types ({resourceLabel} vs {assemblyLabel}) — this app never guesses a conversion; make sure your quantity already accounts for it.
        </p>
      )}
    </div>
  );
}

/** A blank rate input must NOT silently resolve to a fake production rate —
 * `DraftNumberInput` keeps the typed text in local draft state until blur/
 * Enter, so `resolvePersonHoursPerUnit` never sees (and never has to reject)
 * a bogus 0 from a mid-edit keystroke, and an invalid rate never reaches
 * the assembly's persisted `laborProductionRate`. */
function LaborProductionRateField({
  idPrefix,
  index,
  assembly,
  onChange,
}: {
  idPrefix: string;
  index: number;
  assembly: Assembly;
  onChange: (rate: number | undefined) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-productionrate-${index}`}>
          Production rate ({formatUnitLabel(assembly.unit)}/person-hour)
        </label>
        <HelpTooltip label="Production rate">
          How many units one person-hour of labor can complete. This app converts it to person-hours per unit (1 ÷
          production rate) to calculate labor cost — use whichever of the two fields is easier for you to estimate.
        </HelpTooltip>
      </div>
      <DraftNumberInput
        id={`${idPrefix}-productionrate-${index}`}
        value={assembly.laborProductionRate ?? ""}
        onValueChange={(v) => onChange(v === "" ? undefined : v)}
        validate={validateProductionRate}
      />
    </div>
  );
}

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
              addAssembly({
                name: "New service",
                unit: "each",
                materials: [],
                laborInputMode: "person-hours-per-unit",
                laborPersonHoursPerUnit: 0,
                equipment: [],
                otherCostPerUnitCents: ZERO_CENTS,
              })
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
            const cost = calculateAssemblyCost(assembly, materials, equipment, business.loadedLaborRateCents, business.overheadPercent);
            const validationErrors = getAssemblyValidationErrors(assembly);
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
                      <MoneyInput
                        id={`${idPrefix}-rate-${index}`}
                        valueCents={assembly.currentRateCents ?? ""}
                        onValueCentsChange={(v) => updateAssembly(assembly.id, { currentRateCents: v === "" ? undefined : v })}
                      />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeAssembly(assembly.id)} className="tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${assembly.name}`}>
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
                      {assembly.materials.map((line, lineIndex) => {
                        const material = materials.find((m) => m.id === line.materialId);
                        return (
                          <div key={lineIndex} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Select
                                value={line.materialId}
                                onChange={(e) => {
                                  const next = [...assembly.materials];
                                  next[lineIndex] = { ...next[lineIndex], materialId: e.target.value };
                                  updateAssembly(assembly.id, { materials: next });
                                }}
                                className="flex-1"
                                aria-label="Material"
                              >
                                {materials.map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </Select>
                              <DraftNumberInput
                                value={line.quantityPerUnit}
                                onValueChange={(v) => {
                                  const next = [...assembly.materials];
                                  next[lineIndex] = { ...next[lineIndex], quantityPerUnit: v === "" ? 0 : v };
                                  updateAssembly(assembly.id, { materials: next });
                                }}
                                validate={validateQuantity}
                                className="w-20"
                                aria-label="Quantity per unit"
                              />
                              <button
                                type="button"
                                onClick={() => updateAssembly(assembly.id, { materials: assembly.materials.filter((_, i) => i !== lineIndex) })}
                                className="tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
                                aria-label="Remove material line"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                            {material && (
                              <UnitRelationshipHint
                                quantityPerUnit={line.quantityPerUnit}
                                resourceUnit={material.unit}
                                resourceCustomLabel={material.customUnitLabel}
                                assembly={assembly}
                              />
                            )}
                          </div>
                        );
                      })}
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
                      {assembly.equipment.map((line, lineIndex) => {
                        const equipmentItem = equipment.find((eq) => eq.id === line.equipmentId);
                        return (
                          <div key={lineIndex} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Select
                                value={line.equipmentId}
                                onChange={(e) => {
                                  const next = [...assembly.equipment];
                                  next[lineIndex] = { ...next[lineIndex], equipmentId: e.target.value };
                                  updateAssembly(assembly.id, { equipment: next });
                                }}
                                className="flex-1"
                                aria-label="Equipment"
                              >
                                {equipment.map((eq) => (
                                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                                ))}
                              </Select>
                              <DraftNumberInput
                                value={line.quantityPerUnit}
                                onValueChange={(v) => {
                                  const next = [...assembly.equipment];
                                  next[lineIndex] = { ...next[lineIndex], quantityPerUnit: v === "" ? 0 : v };
                                  updateAssembly(assembly.id, { equipment: next });
                                }}
                                validate={validateQuantity}
                                className="w-20"
                                aria-label="Quantity per unit"
                              />
                              <button
                                type="button"
                                onClick={() => updateAssembly(assembly.id, { equipment: assembly.equipment.filter((_, i) => i !== lineIndex) })}
                                className="tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
                                aria-label="Remove equipment line"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                            {equipmentItem && (
                              <UnitRelationshipHint
                                quantityPerUnit={line.quantityPerUnit}
                                resourceUnit={equipmentItem.rateType}
                                resourceCustomLabel={equipmentItem.customUnitLabel}
                                assembly={assembly}
                              />
                            )}
                          </div>
                        );
                      })}
                      {assembly.equipment.length === 0 && <p className="text-sm text-muted">No equipment in this service.</p>}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-labormode-${index}`}>
                      Labor entry method
                    </label>
                    <Select
                      id={`${idPrefix}-labormode-${index}`}
                      value={assembly.laborInputMode}
                      onChange={(e) => {
                        const mode = e.target.value as AssemblyLaborInputMode;
                        const resolved = resolvePersonHoursPerUnit(mode, assembly.laborProductionRate, assembly.laborPersonHoursPerUnit);
                        updateAssembly(assembly.id, {
                          laborInputMode: mode,
                          ...(resolved !== null ? { laborPersonHoursPerUnit: resolved } : {}),
                        });
                      }}
                    >
                      <option value="person-hours-per-unit">Person-hours per unit</option>
                      <option value="production-rate">Production rate (units per person-hour)</option>
                    </Select>
                  </div>
                  {assembly.laborInputMode === "production-rate" ? (
                    <LaborProductionRateField
                      idPrefix={idPrefix}
                      index={index}
                      assembly={assembly}
                      onChange={(rate) => {
                        const resolved = resolvePersonHoursPerUnit("production-rate", rate, undefined);
                        updateAssembly(assembly.id, {
                          laborProductionRate: rate,
                          ...(resolved !== null ? { laborPersonHoursPerUnit: resolved } : {}),
                        });
                      }}
                    />
                  ) : (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-labor-${index}`}>
                        Person-hours per unit
                      </label>
                      <DraftNumberInput
                        id={`${idPrefix}-labor-${index}`}
                        value={assembly.laborPersonHoursPerUnit}
                        onValueChange={(v) => updateAssembly(assembly.id, { laborPersonHoursPerUnit: v === "" ? 0 : v })}
                        validate={validatePersonHoursPerUnit}
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={`${idPrefix}-other-${index}`}>
                      Other cost per unit
                    </label>
                    <MoneyInput
                      id={`${idPrefix}-other-${index}`}
                      valueCents={assembly.otherCostPerUnitCents}
                      onValueCentsChange={(v) => updateAssembly(assembly.id, { otherCostPerUnitCents: v === "" ? ZERO_CENTS : v })}
                    />
                  </div>
                </div>
                {assembly.laborInputMode === "production-rate" && (
                  <p className="mt-1.5 text-xs text-muted">
                    = {assembly.laborPersonHoursPerUnit.toFixed(4)} person-hours per {formatUnitLabel(assembly.unit)} (derived, never entered directly)
                  </p>
                )}

                {validationErrors.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-red-light p-3 text-xs font-medium text-red">
                    {validationErrors.map((error, i) => (
                      <li key={i} role="alert">{error}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-5 rounded-xl bg-paper-dim p-4 text-sm">
                  <span className="font-semibold text-ink">True cost per {formatUnitLabel(assembly.unit)}: {formatCurrency(cost.trueCostPerUnitCents, { cents: true })}</span>
                  <span className="ml-2 text-muted">
                    (materials {formatCurrency(cost.materialCostPerUnitCents, { cents: true })} + labor {formatCurrency(cost.laborCostPerUnitCents, { cents: true })} + equipment {formatCurrency(cost.equipmentCostPerUnitCents, { cents: true })} + other {formatCurrency(cost.otherCostPerUnitCents, { cents: true })} + overhead {formatCurrency(cost.overheadPerUnitCents, { cents: true })})
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
                <button type="button" onClick={() => removeTemplate(template.id)} className="tap-target flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label={`Remove ${template.name}`}>
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
