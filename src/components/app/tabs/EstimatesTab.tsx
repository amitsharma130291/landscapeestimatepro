import { useEffect, useMemo, useState } from "react";
import { Copy, Download, FileStack, Plus, Printer, Trash2 } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import { buildProjectCsvRows, evaluateProject } from "../../../lib/estimateMath";
import { buildCsv, downloadCsv } from "../../../lib/csv";
import { formatCurrency, formatPercent } from "../../../lib/calc";
import { Badge, Button, Card, EmptyState, NumberInput, Select, TextInput } from "../../ui/primitives";
import CustomerEstimateView from "../CustomerEstimateView";
import type { Project, ProjectExtraCost, ProjectServiceLine } from "../../../lib/types";

const STATUS_TONE: Record<Project["status"], "neutral" | "mint" | "amber" | "red"> = {
  draft: "neutral",
  sent: "amber",
  won: "mint",
  lost: "red",
  archived: "neutral",
};

export default function EstimatesTab() {
  const { workspace, addProject, removeProject, duplicateProject } = useWorkspace();
  const { projects, assemblies, materials, equipment, business, templates } = workspace;
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");

  const openProject = projects.find((p) => p.id === openProjectId) ?? null;

  if (openProject) {
    return <ProjectEditor project={openProject} onClose={() => setOpenProjectId(null)} />;
  }

  function createProject(fromTemplateId?: string) {
    const template = fromTemplateId ? templates.find((t) => t.id === fromTemplateId) : undefined;
    const created = addProject({
      name: template ? template.name : "New Project",
      status: "draft",
      serviceLines: template
        ? template.serviceLines.map((l) => ({ id: crypto.randomUUID(), assemblyId: l.assemblyId, quantity: l.quantity }))
        : [],
      equipmentLines: template ? template.equipmentLines : [],
      deliveryCost: template ? template.deliveryCost : business.defaultDeliveryCost,
      extraCosts: template ? template.extraCosts : [],
      overheadPercent: business.overheadPercent,
      targetMarginPercent: business.targetMarginPercent,
    });
    setOpenProjectId(created.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{projects.length} saved project{projects.length === 1 ? "" : "s"}</p>
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 && (
            <div className="flex items-center gap-2">
              <Select
                aria-label="Start from a saved template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-48"
              >
                <option value="">Start from template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <Button type="button" variant="ghost" disabled={!templateId} onClick={() => createProject(templateId)}>
                Use
              </Button>
            </div>
          )}
          <Button type="button" onClick={() => createProject()}>
            <Plus size={18} aria-hidden="true" /> New estimate
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No estimates yet" description="Create your first project estimate to see its true cost and required price." />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const result = evaluateProject(project, assemblies, materials, equipment, business.loadedLaborRate);
            return (
              <li key={project.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-ink">{project.name}</h3>
                      {project.customerName && <p className="text-xs text-muted">{project.customerName}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[project.status]}>{project.status}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold tabular-nums text-ink">
                    {formatCurrency(project.quotedPrice ?? result.displayPrice)}
                  </p>
                  <p className="text-xs text-muted">
                    {project.quotedPrice !== undefined ? "quoted price" : `${formatPercent(result.expectedMargin)} expected margin`}
                  </p>
                  <div className="mt-4 flex flex-1 items-end justify-between gap-2">
                    <Button type="button" size="sm" onClick={() => setOpenProjectId(project.id)}>
                      Open
                    </Button>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-paper-dim"
                        onClick={() => duplicateProject(project.id)}
                        aria-label={`Duplicate ${project.name}`}
                      >
                        <Copy size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
                        onClick={() => {
                          if (window.confirm(`Delete "${project.name}"? This can't be undone.`)) removeProject(project.id);
                        }}
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProjectEditor({ project, onClose }: { project: Project; onClose: () => void }) {
  const { workspace, updateProject, addTemplate } = useWorkspace();
  const { assemblies, materials, equipment, business } = workspace;
  const [printingCustomer, setPrintingCustomer] = useState(false);

  const result = useMemo(
    () => evaluateProject(project, assemblies, materials, equipment, business.loadedLaborRate),
    [project, assemblies, materials, equipment, business.loadedLaborRate]
  );

  useEffect(() => {
    if (!printingCustomer) return;
    document.body.classList.add("printing-customer-estimate");
    const timer = setTimeout(() => window.print(), 50);
    const cleanup = () => {
      document.body.classList.remove("printing-customer-estimate");
      setPrintingCustomer(false);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", cleanup);
    };
  }, [printingCustomer]);

  function patch(p: Partial<Project>) {
    updateProject(project.id, p);
  }

  function handleSaveAsTemplate() {
    const name = window.prompt("Name this template (e.g. \"Mulch refresh\"):", project.name);
    if (!name) return;
    addTemplate({
      name,
      serviceLines: project.serviceLines.map((l) => ({ assemblyId: l.assemblyId, quantity: l.quantity })),
      equipmentLines: project.equipmentLines,
      deliveryCost: project.deliveryCost,
      extraCosts: project.extraCosts,
    });
    window.alert(`Saved "${name}" to Assemblies & Templates.`);
  }

  function updateServiceLine(id: string, next: Partial<ProjectServiceLine>) {
    patch({ serviceLines: project.serviceLines.map((l) => (l.id === id ? { ...l, ...next } : l)) });
  }
  function removeServiceLine(id: string) {
    patch({ serviceLines: project.serviceLines.filter((l) => l.id !== id) });
  }
  function updateExtra(id: string, next: Partial<ProjectExtraCost>) {
    patch({ extraCosts: project.extraCosts.map((e) => (e.id === id ? { ...e, ...next } : e)) });
  }
  function removeExtra(id: string) {
    patch({ extraCosts: project.extraCosts.filter((e) => e.id !== id) });
  }

  function handleExportCsv() {
    const rows = buildProjectCsvRows(project, assemblies, materials, equipment, business.loadedLaborRate);
    downloadCsv(`${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`, buildCsv(rows));
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="text-sm font-semibold text-forest hover:underline">
          ← Back to estimates
        </button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleSaveAsTemplate}>
            <FileStack size={16} aria-hidden="true" /> Save as template
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleExportCsv}>
            <Download size={16} aria-hidden="true" /> Export CSV
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setPrintingCustomer(true)}>
            <Printer size={16} aria-hidden="true" /> Print customer estimate
          </Button>
        </div>
      </div>

      {printingCustomer && (
        <CustomerEstimateView business={business} project={project} assemblies={assemblies} displayPrice={result.displayPrice} />
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="project-name">Project name</label>
                <TextInput id="project-name" value={project.name} onChange={(e) => patch({ name: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="customer-name">Customer name</label>
                <TextInput id="customer-name" value={project.customerName ?? ""} onChange={(e) => patch({ customerName: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="project-status">Status</label>
                <Select
                  id="project-status"
                  value={project.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as Project["status"];
                    // Lock in the quoted price the first time a project leaves "draft" —
                    // from then on it's what the customer has in hand, not a number that
                    // silently drifts if catalog costs change later.
                    if (nextStatus !== "draft" && project.quotedPrice === undefined) {
                      patch({ status: nextStatus, quotedPrice: result.displayPrice });
                    } else {
                      patch({ status: nextStatus });
                    }
                  }}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>
            </div>
            {project.quotedPrice !== undefined && (
              <div className="mt-4 flex items-center justify-between rounded-lg bg-paper-dim px-3.5 py-2.5 text-sm">
                <span className="text-muted">
                  Quoted at <strong className="text-ink">{formatCurrency(project.quotedPrice, { cents: true })}</strong>
                  {project.quotedPrice !== result.displayPrice && (
                    <span className="ml-1.5 text-amber">— current cost now implies {formatCurrency(result.displayPrice)}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="font-semibold text-forest hover:underline"
                  onClick={() => {
                    if (window.confirm("Re-quote this project at today's calculated price?")) {
                      patch({ quotedPrice: result.displayPrice });
                    }
                  }}
                >
                  Re-quote
                </button>
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
              <h2 className="text-lg font-bold text-ink">Services</h2>
              <button
                type="button"
                className="text-sm font-semibold text-forest hover:underline disabled:text-muted"
                disabled={assemblies.length === 0}
                onClick={() =>
                  assemblies[0] &&
                  patch({
                    serviceLines: [...project.serviceLines, { id: crypto.randomUUID(), assemblyId: assemblies[0].id, quantity: 1 }],
                  })
                }
              >
                + Add service
              </button>
            </div>
            <div className="mt-4 space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
              {project.serviceLines.length === 0 && <p className="text-sm text-muted">No services added yet.</p>}
              {project.serviceLines.map((line) => (
                <div key={line.id} className="flex items-center gap-2">
                  <Select value={line.assemblyId} onChange={(e) => updateServiceLine(line.id, { assemblyId: e.target.value })} className="flex-1">
                    {assemblies.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                  <NumberInput value={line.quantity} onValueChange={(v) => updateServiceLine(line.id, { quantity: v === "" ? 0 : v })} className="w-24" aria-label="Quantity" />
                  <button type="button" onClick={() => removeServiceLine(line.id)} className="no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label="Remove service">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
              <h2 className="text-lg font-bold text-ink">Other costs</h2>
              <button
                type="button"
                className="text-sm font-semibold text-forest hover:underline"
                onClick={() => patch({ extraCosts: [...project.extraCosts, { id: crypto.randomUUID(), label: "Other", amount: 0 }] })}
              >
                + Add cost
              </button>
            </div>
            <div className="mt-4 space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-2">
                <label className="w-40 shrink-0 text-sm text-ink" htmlFor="delivery-cost">Delivery</label>
                <NumberInput id="delivery-cost" value={project.deliveryCost} onValueChange={(v) => patch({ deliveryCost: v === "" ? 0 : v })} className="w-32" />
              </div>
              {project.extraCosts.map((extra) => (
                <div key={extra.id} className="flex items-center gap-2">
                  <TextInput value={extra.label} onChange={(e) => updateExtra(extra.id, { label: e.target.value })} className="flex-1" />
                  <NumberInput value={extra.amount} onValueChange={(v) => updateExtra(extra.id, { amount: v === "" ? 0 : v })} className="w-32" />
                  <button type="button" onClick={() => removeExtra(extra.id)} className="no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label="Remove cost">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="proj-overhead">Overhead %</label>
                <NumberInput id="proj-overhead" value={project.overheadPercent} onValueChange={(v) => patch({ overheadPercent: v === "" ? 0 : v })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="proj-margin">Target margin %</label>
                <NumberInput id="proj-margin" value={project.targetMarginPercent} onValueChange={(v) => patch({ targetMarginPercent: v === "" ? 0 : v })} />
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card tone="dark">
            <h2 className="text-sm font-bold uppercase tracking-wider text-lime">Estimate summary</h2>
            <dl aria-live="polite" className="mt-4 space-y-2.5 text-sm">
              <Row label="Materials" value={formatCurrency(result.materialsCost, { cents: true })} />
              <Row label="Labor" value={`${formatCurrency(result.laborCost, { cents: true })} (${result.laborPersonHours.toFixed(1)} hrs)`} />
              <Row label="Equipment" value={formatCurrency(result.equipmentCost, { cents: true })} />
              <Row label="Delivery" value={formatCurrency(result.deliveryCost, { cents: true })} />
              <Row label="Other" value={formatCurrency(result.otherCost, { cents: true })} />
              <Row label="Direct cost" value={formatCurrency(result.directCost, { cents: true })} strong />
              <Row label="Overhead" value={formatCurrency(result.overheadAmount, { cents: true })} />
              <Row label="True cost" value={formatCurrency(result.trueCost, { cents: true })} strong />
            </dl>
            <div className="mt-4 rounded-xl bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Required selling price</p>
              <p className="mt-1 text-2xl font-extrabold text-lime">{formatCurrency(result.requiredSellingPrice, { cents: true })}</p>
              <p className="mt-1 text-xs text-white/60">Display price {formatCurrency(result.displayPrice)} · {formatPercent(result.expectedMargin)} margin</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2 last:border-b-0">
      <dt className="text-white/70">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
