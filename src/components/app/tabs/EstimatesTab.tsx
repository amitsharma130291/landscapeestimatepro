import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Copy, Download, FileStack, History, Plus, Printer, TriangleAlert, Trash2 } from "lucide-react";
import { useWorkspace } from "../../../lib/workspaceContext";
import {
  buildAcceptancePatch,
  buildProjectCsvRows,
  buildQuoteRevision,
  deriveLifecycleStage,
  deriveNextAction,
  describeStatusTransition,
  evaluateProject,
  evaluateQuoteAgainstTarget,
  getActiveRevision,
  getQuoteBlockingErrors,
  LIFECYCLE_STAGE_LABELS,
  QuoteBlockedError,
  type LifecycleStage,
} from "../../../lib/estimateMath";
import { buildCsv, downloadCsv } from "../../../lib/csv";
import { buildCustomerDocumentFromDraft, buildCustomerDocumentFromRevision } from "../../../lib/customerDocument";
import { formatCurrency, formatPercent } from "../../../lib/calc";
import { centsToDecimal, fromDollarInputToCents, ZERO_CENTS, type MoneyCents } from "../../../lib/money";
import { Badge, Button, Card, DraftNumberInput, EmptyState, MoneyInput, Select, TextInput } from "../../ui/primitives";
import { HelpTooltip } from "../../ui/HelpTooltip";
import CrewSizeScenarioPanel from "../CrewSizeScenarioPanel";
import CustomerEstimateView from "../CustomerEstimateView";
import WorkflowStatusBar from "../WorkflowStatusBar";
import {
  getProjectLaborLineValidationErrors,
  validateCrewSize,
  validateDollarInput,
  validateElapsedHours,
  validateOverheadPercent,
  validateQuantity,
  validateTargetMarginPercent,
} from "../../../lib/validation";
import type { Project, ProjectExtraCost, ProjectLaborLine, ProjectServiceLine, QuoteRevision } from "../../../lib/types";

const STAGE_TONE: Record<LifecycleStage, "neutral" | "mint" | "amber" | "red"> = {
  draft: "neutral",
  quoted: "amber",
  accepted: "mint",
  completed: "mint",
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
      laborLines: [],
      deliveryCostCents: template ? template.deliveryCostCents : business.defaultDeliveryCostCents,
      extraCosts: template ? template.extraCosts : [],
      overheadPercent: business.overheadPercent,
      targetMarginPercent: business.targetMarginPercent,
      taxRatePercent: business.taxRatePercent,
      quoteRevisions: [],
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
            const result = evaluateProject(project, assemblies, materials, equipment, business);
            const activeRevision = getActiveRevision(project);
            const cardBlockingErrors = getQuoteBlockingErrors(project, assemblies, materials, equipment);
            const nextAction = deriveNextAction(project, cardBlockingErrors.length === 0, cardBlockingErrors);
            return (
              <li key={project.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-ink">{project.name}</h3>
                      {project.customerName && <p className="text-xs text-muted">{project.customerName}</p>}
                    </div>
                    <Badge tone={STAGE_TONE[deriveLifecycleStage(project)]}>{LIFECYCLE_STAGE_LABELS[deriveLifecycleStage(project)]}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold tabular-nums text-ink">
                    {formatCurrency(activeRevision?.actualQuotedPriceCents ?? result.displayPriceCents)}
                  </p>
                  <p className="text-xs text-muted">
                    {activeRevision !== null ? "quoted price" : `${formatPercent(result.expectedMargin)} expected margin`}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-forest">Next: {nextAction.label}</p>
                  <div className="mt-4 flex flex-1 items-end justify-between gap-2">
                    <Button type="button" size="sm" onClick={() => setOpenProjectId(project.id)}>
                      Open
                    </Button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="tap-target flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-paper-dim"
                        onClick={() => duplicateProject(project.id)}
                        aria-label={`Duplicate ${project.name}`}
                      >
                        <Copy size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="tap-target flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red"
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
  const { workspace, updateProject, addTemplate, lastSavedAt } = useWorkspace();
  const { assemblies, materials, equipment, business } = workspace;
  const [printingCustomer, setPrintingCustomer] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  // Deleting a row removes its own "Remove" button from the DOM — the
  // browser's default is to drop focus to <body> when that happens, which
  // is a real keyboard-navigation dead end (confirmed live via a
  // keyboard-only Playwright pass). Refocusing each section's own "+ Add"
  // button after a same-section removal keeps focus somewhere sane and
  // still on-screen, instead of silently vanishing.
  const addServiceButtonRef = useRef<HTMLButtonElement>(null);
  const addLaborButtonRef = useRef<HTMLButtonElement>(null);
  const addCostButtonRef = useRef<HTMLButtonElement>(null);

  const result = useMemo(
    () => evaluateProject(project, assemblies, materials, equipment, business),
    [project, assemblies, materials, equipment, business]
  );
  const blockingErrors = useMemo(
    () => getQuoteBlockingErrors(project, assemblies, materials, equipment),
    [project, assemblies, materials, equipment]
  );
  const canQuote = blockingErrors.length === 0;
  const activeRevision = getActiveRevision(project);

  // The primary summary always reflects what's actually being charged (a
  // locked/overridden revision) once one exists — never the live recommended
  // price, which can drift from what the customer agreed to if catalog costs
  // change later. Before any revision exists, the live recommendation IS the
  // only price there is, so it doubles as both "recommended" and "actual".
  const summary = {
    trueCostCents: activeRevision ? activeRevision.trueCostCents : result.trueCostCents,
    recommendedPriceCents: result.displayPriceCents,
    actualCustomerQuoteCents: activeRevision ? activeRevision.actualQuotedPriceCents : result.displayPriceCents,
    grossProfitCents: activeRevision ? activeRevision.grossProfitCents : (result.displayPriceCents !== null ? ((result.displayPriceCents - result.trueCostCents) as typeof result.trueCostCents) : null),
    achievedMargin: activeRevision ? activeRevision.achievedMargin : result.expectedMargin,
    customerTotalCents: activeRevision ? activeRevision.customerTotalCents : (result.customerTotalCents ?? result.displayPriceCents),
  };
  // LEP-115: "clearly indicate when the configured minimum has been
  // applied." A draft reads this straight off the live calculation; a
  // locked revision derives it from its own FROZEN configured minimum and
  // calculated required price, so it never drifts if the business minimum
  // changes later.
  const minimumAppliedCents = activeRevision
    ? (activeRevision.configuredMinimumProjectPriceCents ?? 0) > activeRevision.roundedRecommendedPriceCents &&
      activeRevision.actualQuotedPriceCents === (activeRevision.configuredMinimumProjectPriceCents ?? 0)
      ? activeRevision.configuredMinimumProjectPriceCents!
      : null
    : result.minimumPriceAppliedCents;
  const targetCheck =
    summary.actualCustomerQuoteCents !== null
      ? evaluateQuoteAgainstTarget(summary.actualCustomerQuoteCents, summary.trueCostCents, result.requiredSellingPriceCents, project.targetMarginPercent)
      : null;

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

  function appendRevision(options?: { reason?: string; actualQuotedPriceOverrideCents?: number }): QuoteRevision | null {
    try {
      const revision = buildQuoteRevision(project, assemblies, materials, equipment, business, options);
      updateProject(project.id, {
        quoteRevisions: [...project.quoteRevisions, revision],
        activeQuoteRevisionId: revision.id,
      });
      return revision;
    } catch (err) {
      if (err instanceof QuoteBlockedError) {
        window.alert(`Can't create a quote:\n\n${err.errors.map((e) => `• ${e}`).join("\n")}`);
      } else {
        throw err;
      }
      return null;
    }
  }

  function handleSaveAsTemplate() {
    const name = window.prompt("Name this template (e.g. \"Mulch refresh\"):", project.name);
    if (!name) return;
    addTemplate({
      name,
      serviceLines: project.serviceLines.map((l) => ({ assemblyId: l.assemblyId, quantity: l.quantity })),
      equipmentLines: project.equipmentLines,
      deliveryCostCents: project.deliveryCostCents,
      extraCosts: project.extraCosts,
    });
    window.alert(`Saved "${name}" to Assemblies & Templates.`);
  }

  function updateServiceLine(id: string, next: Partial<ProjectServiceLine>) {
    patch({ serviceLines: project.serviceLines.map((l) => (l.id === id ? { ...l, ...next } : l)) });
  }
  function removeServiceLine(id: string) {
    patch({ serviceLines: project.serviceLines.filter((l) => l.id !== id) });
    addServiceButtonRef.current?.focus();
  }
  function updateExtra(id: string, next: Partial<ProjectExtraCost>) {
    patch({ extraCosts: project.extraCosts.map((e) => (e.id === id ? { ...e, ...next } : e)) });
  }
  function removeExtra(id: string) {
    patch({ extraCosts: project.extraCosts.filter((e) => e.id !== id) });
    addCostButtonRef.current?.focus();
  }
  function updateLaborLine(id: string, next: Partial<ProjectLaborLine>) {
    patch({ laborLines: project.laborLines.map((l) => (l.id === id ? { ...l, ...next } : l)) });
  }
  function removeLaborLine(id: string) {
    patch({ laborLines: project.laborLines.filter((l) => l.id !== id) });
    addLaborButtonRef.current?.focus();
  }

  function handleExportCsv() {
    const rows = buildProjectCsvRows(project, assemblies, materials, equipment, business.loadedLaborRateCents);
    downloadCsv(`${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`, buildCsv(rows));
  }

  function handleRecordActualPrice() {
    if (!activeRevision) return;
    const raw = window.prompt("What did you actually charge the customer (pre-tax)?", centsToDecimal(activeRevision.actualQuotedPriceCents).toFixed(2));
    if (raw === null) return;
    const error = validateDollarInput(raw);
    if (error) {
      window.alert(error);
      return;
    }
    const enteredCents = fromDollarInputToCents(raw);
    // LEP-115: an explicitly recorded actual price is a historical fact and
    // is never silently clamped to the configured minimum — but recording
    // one below it should still require a deliberate confirmation, the same
    // way a below-target-margin price already does below.
    const configuredMinimumCents = business.minimumProjectPriceCents;
    if (enteredCents < configuredMinimumCents) {
      const proceed = window.confirm(
        `This is ${formatCurrency((configuredMinimumCents - enteredCents) as MoneyCents, { cents: true })} below your configured minimum project price of ${formatCurrency(configuredMinimumCents, { cents: true })}.\n\n` +
          `You can still record it — this only asks you to confirm before locking in a below-minimum price.`
      );
      if (!proceed) return;
    }
    const check = evaluateQuoteAgainstTarget(enteredCents, activeRevision.trueCostCents, result.requiredSellingPriceCents, project.targetMarginPercent);
    if (check.isBelowTarget && check.shortfallCents !== null && check.achievedMargin !== null) {
      const proceed = window.confirm(
        `This price is ${formatCurrency(check.shortfallCents, { cents: true })} short of your target margin.\n\n` +
          `Achieved margin: ${formatPercent(check.achievedMargin)}\nTarget margin: ${formatPercent(check.targetMarginPercent)}\n\n` +
          `You can still record it — this only asks you to confirm before locking in a below-target price.`
      );
      if (!proceed) return;
    }
    appendRevision({ actualQuotedPriceOverrideCents: enteredCents, reason: "Recorded actual price charged" });
  }

  const canPrintCustomerEstimate = canQuote && (activeRevision !== null || result.displayPriceCents !== null);

  // Single source of truth for a status change — the Select control below AND
  // the compact WorkflowStatusBar's quick actions both call this, so "Draft"
  // never has two different sets of rules for what it can become depending on
  // which button was clicked.
  function changeStatus(nextStatus: Project["status"]) {
    if (nextStatus === project.status) return;

    // Create the FIRST quote revision the moment a project leaves "draft" —
    // from then on the customer has this price in hand, and it must never
    // silently drift if catalog costs or business settings change later.
    // Re-quoting later APPENDS a new revision; it never replaces this one.
    let workingProject = project;
    if (nextStatus !== "draft" && project.quoteRevisions.length === 0) {
      if (!canQuote) {
        window.alert(`Can't quote this project yet:\n\n${blockingErrors.map((e) => `• ${e}`).join("\n")}`);
        return;
      }
      const revision = appendRevision();
      if (!revision) return; // appendRevision already surfaced the error
      workingProject = { ...project, quoteRevisions: [...project.quoteRevisions, revision], activeQuoteRevisionId: revision.id };
    }

    const check = describeStatusTransition(workingProject, nextStatus);
    if (!check.allowed) {
      window.alert(check.reason ?? "That status change isn't allowed right now.");
      return;
    }
    if (check.requiresConfirmation && !window.confirm(check.confirmationMessage ?? `Change status to "${nextStatus}"?`)) {
      return;
    }

    if (nextStatus === "won") {
      // Records WHICH revision was accepted and when — a later re-quote (a
      // new entry in quoteRevisions) never touches this, so "what the
      // customer accepted" can't silently drift to whatever revision happens
      // to be newest.
      const acceptancePatch = buildAcceptancePatch(workingProject);
      if (!acceptancePatch) {
        window.alert("Can't mark this accepted — no locked quote revision found.");
        return;
      }
      patch(acceptancePatch);
      return;
    }

    patch({ status: nextStatus });
  }

  function handleReQuote() {
    if (window.confirm("Re-quote this project at today's calculated price? This creates a NEW revision — the current one stays exactly as it is, in history.")) {
      appendRevision({ reason: "Re-quoted at current costs" });
    }
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="tap-target text-sm font-semibold text-forest hover:underline">
          ← Back to estimates
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="customer-detail-mode" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Customer document detail
          </label>
          <Select
            id="customer-detail-mode"
            aria-label="Customer document detail level"
            value={project.customerDetailMode ?? "detailed"}
            onChange={(e) => patch({ customerDetailMode: e.target.value as Project["customerDetailMode"] })}
            className="w-auto"
          >
            <option value="project-total">Project total only</option>
            <option value="service-totals">Service totals</option>
            <option value="detailed">Detailed quantities and rates</option>
          </Select>
          <Button type="button" variant="ghost" size="sm" onClick={handleSaveAsTemplate}>
            <FileStack size={16} aria-hidden="true" /> Save as template
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleExportCsv}>
            <Download size={16} aria-hidden="true" /> Export CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canPrintCustomerEstimate}
            title={canPrintCustomerEstimate ? undefined : "Fix the errors below before creating a customer estimate"}
            onClick={() => setPrintingCustomer(true)}
          >
            <Printer size={16} aria-hidden="true" /> Print customer estimate
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <WorkflowStatusBar
          project={project}
          activeRevision={activeRevision}
          canQuote={canQuote}
          blockingErrors={blockingErrors}
          lastSavedAt={lastSavedAt}
          onQuote={() => changeStatus("sent")}
          onMarkAccepted={() => changeStatus("won")}
          onCreateRevision={handleReQuote}
          onShowHistory={() => setShowHistory(true)}
        />
      </div>

      {!canQuote && (
        <div className="no-print mt-4 rounded-xl border border-red-light bg-red-light/40 p-4 text-sm text-ink">
          <p className="font-semibold text-red">This estimate can't be quoted or exported to a customer yet:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {blockingErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {printingCustomer && activeRevision !== null && (
        <CustomerEstimateView doc={buildCustomerDocumentFromRevision(project, activeRevision, business)} />
      )}
      {printingCustomer && activeRevision === null && result.displayPriceCents !== null && (
        <CustomerEstimateView
          doc={buildCustomerDocumentFromDraft(
            project,
            assemblies,
            materials,
            equipment,
            business,
            result.displayPriceCents,
            result.taxAmountCents ?? ZERO_CENTS,
            result.customerTotalCents ?? result.displayPriceCents
          )}
        />
      )}

      {/* min-w-0 on both grid items is load-bearing, not decoration: without
          it, a CSS grid item defaults to min-width:auto (content-based),
          which can leak a deeply-nested descendant's min-content size past
          this grid into the page's own scrollable width — confirmed live at
          a 320px viewport (a 16px phantom page-scroll, closed entirely once
          both items got min-w-0). Same underlying class of bug as
          `.table-scroll`'s `contain:layout` fix, different CSS mechanism
          (grid item sizing vs. table layout containment). */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
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
                  onChange={(e) => changeStatus(e.target.value as Project["status"])}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Quoted</option>
                  <option value="won">Accepted</option>
                  <option value="lost">Lost</option>
                  <option value="archived">Archived</option>
                </Select>
                {project.status === "won" && project.acceptedAt && (
                  <p className="mt-1.5 text-xs text-muted">
                    Accepted {new Date(project.acceptedAt).toLocaleDateString()}
                    {project.acceptedRevisionId && project.acceptedRevisionId !== activeRevision?.id && " — a newer revision now exists; the accepted one is preserved."}
                  </p>
                )}
              </div>
            </div>
            {activeRevision !== null && (
              <div className="mt-4 rounded-lg bg-paper-dim px-3.5 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">
                    Quoted at <strong className="text-ink">{formatCurrency(activeRevision.actualQuotedPriceCents, { cents: true })}</strong>
                    {" "}(revision {activeRevision.revisionNumber})
                    {activeRevision.isLegacyMigration && (
                      <span className="ml-1.5 text-muted">(migrated from an older version — approximate)</span>
                    )}
                    {result.displayPriceCents !== null && activeRevision.roundedRecommendedPriceCents !== result.displayPriceCents && (
                      <span className="ml-1.5 text-amber">— current cost now implies {formatCurrency(result.displayPriceCents)}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-4">
                    {project.quoteRevisions.length > 1 && (
                      <button type="button" className="tap-target inline-flex items-center gap-1 font-semibold text-forest hover:underline" onClick={() => setShowHistory((s) => !s)}>
                        <History size={14} aria-hidden="true" /> {project.quoteRevisions.length} revisions
                      </button>
                    )}
                    <button type="button" className="tap-target font-semibold text-forest hover:underline" onClick={handleRecordActualPrice}>
                      Record actual price
                    </button>
                    <button
                      type="button"
                      className="tap-target font-semibold text-forest hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                      disabled={!canQuote}
                      onClick={handleReQuote}
                    >
                      Re-quote
                    </button>
                    <HelpTooltip label="Quote revision / re-quote">
                      A quote revision is a frozen snapshot of the price you gave the customer — it never changes after the fact, even if your catalog costs do. "Re-quote" APPENDS a brand-new revision at today's costs; it never edits or replaces an earlier one, so you always have the full history of what was actually offered.
                    </HelpTooltip>
                  </div>
                </div>
                {showHistory && (
                  <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
                    {[...project.quoteRevisions].reverse().map((rev) => (
                      <li key={rev.id} className="flex items-center justify-between gap-2">
                        <span>
                          Revision {rev.revisionNumber} · {new Date(rev.createdAt).toLocaleDateString()}
                          {rev.reason ? ` — ${rev.reason}` : ""}
                          {rev.id === activeRevision.id ? " (active)" : ""}
                        </span>
                        <span className="tabular-nums text-ink">{formatCurrency(rev.actualQuotedPriceCents, { cents: true })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
              <h2 className="text-lg font-bold text-ink">Services</h2>
              <button
                ref={addServiceButtonRef}
                type="button"
                className="tap-target text-sm font-semibold text-forest hover:underline disabled:text-muted"
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
                  <Select value={line.assemblyId} onChange={(e) => updateServiceLine(line.id, { assemblyId: e.target.value })} className="flex-1" aria-label="Service assembly">
                    {assemblies.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                  <DraftNumberInput value={line.quantity} onValueChange={(v) => updateServiceLine(line.id, { quantity: v === "" ? 0 : v })} validate={validateQuantity} className="w-24" aria-label="Quantity" />
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" checked={line.taxable ?? true} onChange={(e) => updateServiceLine(line.id, { taxable: e.target.checked })} />
                    Taxable
                    <HelpTooltip label="Taxable">Whether this line's revenue counts toward the taxable subtotal, using your sales tax rate from Settings. Uncheck it for a line that's exempt (e.g. certain labor-only or resale items in your jurisdiction).</HelpTooltip>
                  </label>
                  <button type="button" onClick={() => removeServiceLine(line.id)} className="tap-target no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label="Remove service">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
              <div>
                <h2 className="text-lg font-bold text-ink">Crew labor</h2>
                <p className="mt-0.5 text-xs text-muted">
                  An ad-hoc "crew worked N hours" cost — for work that isn't cleanly a per-unit service (site cleanup, a change-order day). Cost = crew size × elapsed hours × loaded rate.
                </p>
              </div>
              <button
                ref={addLaborButtonRef}
                type="button"
                className="tap-target shrink-0 text-sm font-semibold text-forest hover:underline"
                onClick={() =>
                  patch({
                    laborLines: [
                      ...project.laborLines,
                      { id: crypto.randomUUID(), label: "Crew labor", mode: "crew-duration", crewSize: 1, elapsedHours: 0, loadedRateCents: business.loadedLaborRateCents, taxable: true },
                    ],
                  })
                }
              >
                + Add labor line
              </button>
            </div>
            <div className="mt-4 space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
              {project.laborLines.length === 0 && <p className="text-sm text-muted">No ad-hoc crew labor lines.</p>}
              {project.laborLines.map((line) => {
                const lineErrors = getProjectLaborLineValidationErrors(line);
                const personHours = (Number.isFinite(line.crewSize) ? line.crewSize : 0) * (Number.isFinite(line.elapsedHours) ? line.elapsedHours : 0);
                return (
                  <div key={line.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <TextInput value={line.label} onChange={(e) => updateLaborLine(line.id, { label: e.target.value })} className="min-w-[10rem] flex-1" aria-label="Labor line label" />
                      <DraftNumberInput
                        value={line.crewSize}
                        onValueChange={(v) => updateLaborLine(line.id, { crewSize: v === "" ? 0 : v })}
                        validate={validateCrewSize}
                        className="w-20"
                        aria-label="Crew size"
                        invalid={lineErrors.some((e) => e.includes("Crew size"))}
                      />
                      <span className="text-xs text-muted">people ×</span>
                      <DraftNumberInput
                        value={line.elapsedHours}
                        onValueChange={(v) => updateLaborLine(line.id, { elapsedHours: v === "" ? 0 : v })}
                        validate={validateElapsedHours}
                        className="w-20"
                        aria-label="Elapsed hours"
                        invalid={lineErrors.some((e) => e.includes("Elapsed hours"))}
                      />
                      <span className="text-xs text-muted">hrs ×</span>
                      <MoneyInput
                        valueCents={line.loadedRateCents}
                        onValueCentsChange={(v) => updateLaborLine(line.id, { loadedRateCents: v === "" ? ZERO_CENTS : v })}
                        className="w-28"
                        aria-label="Loaded rate"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        <input type="checkbox" checked={line.taxable ?? true} onChange={(e) => updateLaborLine(line.id, { taxable: e.target.checked })} />
                        Taxable
                      </label>
                      <button type="button" onClick={() => removeLaborLine(line.id)} className="tap-target no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label="Remove labor line">
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      = {personHours.toFixed(1)} person-hours
                    </p>
                    {personHours > 0 && (
                      <div className="no-print">
                        <CrewSizeScenarioPanel baselinePersonHours={personHours} loadedRateCents={line.loadedRateCents} label={line.label} />
                      </div>
                    )}
                    {lineErrors.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs font-medium text-red">
                        {lineErrors.map((error, i) => (
                          <li key={i} role="alert">{error}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
              <h2 className="text-lg font-bold text-ink">Other costs</h2>
              <button
                ref={addCostButtonRef}
                type="button"
                className="tap-target text-sm font-semibold text-forest hover:underline"
                onClick={() => patch({ extraCosts: [...project.extraCosts, { id: crypto.randomUUID(), label: "Other", amountCents: ZERO_CENTS }] })}
              >
                + Add cost
              </button>
            </div>
            <div className="mt-4 space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-2">
                <label className="w-40 shrink-0 text-sm text-ink" htmlFor="delivery-cost">Delivery</label>
                <MoneyInput id="delivery-cost" valueCents={project.deliveryCostCents} onValueCentsChange={(v) => patch({ deliveryCostCents: v === "" ? ZERO_CENTS : v })} className="w-32" />
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={project.deliveryTaxable ?? true} onChange={(e) => patch({ deliveryTaxable: e.target.checked })} />
                  Taxable
                </label>
              </div>
              {project.extraCosts.map((extra) => (
                <div key={extra.id} className="flex items-center gap-2">
                  <TextInput value={extra.label} onChange={(e) => updateExtra(extra.id, { label: e.target.value })} className="flex-1" />
                  <MoneyInput valueCents={extra.amountCents} onValueCentsChange={(v) => updateExtra(extra.id, { amountCents: v === "" ? ZERO_CENTS : v })} className="w-32" />
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" checked={extra.taxable ?? true} onChange={(e) => updateExtra(extra.id, { taxable: e.target.checked })} />
                    Taxable
                  </label>
                  <button type="button" onClick={() => removeExtra(extra.id)} className="tap-target no-print flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-light hover:text-red" aria-label="Remove cost">
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
                <DraftNumberInput id="proj-overhead" value={project.overheadPercent} onValueChange={(v) => patch({ overheadPercent: v === "" ? 0 : v })} validate={validateOverheadPercent} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="proj-margin">Target margin %</label>
                <DraftNumberInput
                  id="proj-margin"
                  value={project.targetMarginPercent}
                  onValueChange={(v) => patch({ targetMarginPercent: v === "" ? 0 : v })}
                  validate={validateTargetMarginPercent}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <Card tone="dark">
            <h2 className="text-sm font-bold uppercase tracking-wider text-lime">Estimate summary</h2>

            <dl aria-live="polite" className="mt-4 space-y-2.5 text-sm">
              <Row
                label={<>True job cost<HelpTooltip label="True job cost">Direct cost (materials, labor, equipment, delivery, other) plus overhead — what this job actually costs you to run, before any profit.</HelpTooltip></>}
                value={formatCurrency(summary.trueCostCents, { cents: true })}
                strong
              />
              <Row
                label={<>Recommended quote<HelpTooltip label="Recommended quote">The price that turns your true job cost into your target margin, rounded up to your rounding increment, floored to your configured minimum project price if that's higher. You're always free to charge more or less.</HelpTooltip></>}
                value={formatCurrency(summary.recommendedPriceCents)}
                strong
                hint={
                  minimumAppliedCents !== null
                    ? `Minimum price applied — calculated price was ${formatCurrency(
                        (activeRevision ? activeRevision.roundedRecommendedPriceCents : result.preMinimumPriceCents)!,
                        { cents: true }
                      )}`
                    : undefined
                }
              />
              <Row
                label="Actual customer quote"
                value={summary.actualCustomerQuoteCents !== null ? formatCurrency(summary.actualCustomerQuoteCents, { cents: true }) : "—"}
                strong
                hint={activeRevision === null ? "not locked yet — same as recommended" : undefined}
              />
              <Row
                label={<>Expected gross profit<HelpTooltip label="Expected gross profit">Actual customer quote minus true job cost — the dollars left over after every cost is covered, before you factor in your own time spent on non-billable work.</HelpTooltip></>}
                value={summary.grossProfitCents !== null ? formatCurrency(summary.grossProfitCents, { cents: true }) : "—"}
              />
              <Row
                label="Expected margin"
                value={summary.achievedMargin !== null ? formatPercent(summary.achievedMargin) : "—"}
              />
              <Row
                label="Customer total"
                value={summary.customerTotalCents !== null ? formatCurrency(summary.customerTotalCents, { cents: true }) : "—"}
                hint={(result.taxAmountCents ?? 0) > 0 ? "incl. tax" : undefined}
              />
            </dl>

            {targetCheck?.isBelowTarget && targetCheck.shortfallCents !== null && targetCheck.achievedMargin !== null && (
              <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber/15 p-3.5 text-xs text-amber-light">
                {/* text-amber-light (not text-amber) is load-bearing: this box
                    sits on the dark summary card, where amber-on-amber-tint
                    fails WCAG contrast (confirmed via axe-core — the darker
                    body text measured well under 4.5:1 here even though the
                    same amber passes fine on light surfaces elsewhere). The
                    icon can stay amber since it's aria-hidden (decorative). */}
                <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-amber" />
                <p>
                  This price is <strong>{formatCurrency(targetCheck.shortfallCents, { cents: true })}</strong> below your {formatPercent(project.targetMarginPercent)} target margin
                  — achieving <strong>{formatPercent(targetCheck.achievedMargin)}</strong> instead
                  ({formatPercent(targetCheck.marginPointsShort ?? 0)} short). You can still charge this — it's your call — but it's worth a second look before locking it in.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowBreakdown((s) => !s)}
              aria-expanded={showBreakdown}
              aria-controls="cost-breakdown-detail"
              className="tap-target mt-4 flex w-full items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs font-semibold uppercase tracking-wider text-white/60 hover:text-white"
            >
              Cost breakdown &amp; how this price was calculated
              {showBreakdown ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            </button>

            {showBreakdown && (
              <div id="cost-breakdown-detail">
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Materials" value={formatCurrency(result.materialsCostCents, { cents: true })} />
                  <Row label="Labor" value={`${formatCurrency(result.laborCostCents, { cents: true })} (${result.laborPersonHours.toFixed(1)} hrs)`} />
                  <Row label="Equipment" value={formatCurrency(result.equipmentCostCents, { cents: true })} />
                  <Row label="Delivery" value={formatCurrency(result.deliveryCostCents, { cents: true })} />
                  <Row label="Other" value={formatCurrency(result.otherCostCents, { cents: true })} />
                  <Row
                    label={<>Direct cost<HelpTooltip label="Direct cost">Materials, labor, equipment, delivery, and other costs added together — everything this job costs before overhead is applied.</HelpTooltip></>}
                    value={formatCurrency(result.directCostCents, { cents: true })}
                    strong
                  />
                  <Row label="Overhead" value={formatCurrency(result.overheadAmountCents, { cents: true })} />
                  <Row label="True job cost" value={formatCurrency(result.trueCostCents, { cents: true })} strong />
                  {(result.taxAmountCents ?? 0) > 0 && <Row label="Sales tax" value={formatCurrency(result.taxAmountCents, { cents: true })} />}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  Materials, labor, equipment, delivery, and other costs add up to your <strong className="text-white/80">direct cost</strong>. Overhead
                  ({formatPercent(project.overheadPercent)} of direct cost) is added to get your <strong className="text-white/80">true job cost</strong> — what this
                  job actually costs you to run, before any profit. The <strong className="text-white/80">recommended quote</strong> is the price that
                  turns that true cost into your {formatPercent(project.targetMarginPercent)} target margin, rounded up to a clean number.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, hint }: { label: ReactNode; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-b-0">
      <dt className="flex items-center gap-1.5 text-white/70">{label}</dt>
      <dd className="text-right">
        <span className={`tabular-nums ${strong ? "font-bold" : "font-semibold"}`}>{value}</span>
        {hint && <span className="block text-[0.6875rem] font-normal normal-case text-white/50">{hint}</span>}
      </dd>
    </div>
  );
}
