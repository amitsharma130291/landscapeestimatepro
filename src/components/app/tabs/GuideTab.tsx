import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, Card } from "../../ui/primitives";

/**
 * The comprehensive "how to use Pro" reference — linked last in the app's
 * own sidebar nav (see AppShell.tsx's NAV array), reachable from any tab
 * whenever a contractor wants the full walkthrough. Purely static/
 * instructional: it reads no workspace data
 * and writes nothing, so it's safe to link from anywhere without side
 * effects. Every worked example below uses one consistent running example —
 * a Smith Residence mulch/shrub/edging job — so a reader can follow the
 * SAME numbers from Settings all the way through to Estimate vs. Actual,
 * rather than re-orienting to a new example in every section.
 */

const SECTIONS = [
  { id: "workflow", label: "How it all fits together" },
  { id: "settings", label: "1. Settings — business assumptions" },
  { id: "catalog", label: "2. Catalog — materials & equipment" },
  { id: "assemblies", label: "3. Assemblies & Templates" },
  { id: "estimates", label: "4. Estimates" },
  { id: "rate-health", label: "5. Rate Health" },
  { id: "actuals", label: "6. Estimate vs. Actual" },
  { id: "backup", label: "7. Backup & restore" },
  { id: "checklist", label: "First-time checklist" },
];

export default function GuideTab() {
  return (
    <div className="space-y-8">
      <Card>
        <p className="text-sm leading-relaxed text-ink">
          Landscape Estimate Pro turns your own materials, labor, and equipment costs into an accurate project cost —
          then tells you what to charge to hit your target margin, and whether your existing prices are actually
          profitable. Every number in this guide (the "Smith Residence" example) comes from data already saved in
          this workspace — open any tab below and you'll see the same figures.
        </p>
        <nav aria-label="Guide sections" className="mt-5 grid gap-1.5 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="tap-target flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-forest hover:bg-paper-dim"
            >
              <ArrowRight size={14} aria-hidden="true" /> {s.label}
            </a>
          ))}
        </nav>
      </Card>

      <GuideSection id="workflow" title="How it all fits together">
        <p>
          Every Pro feature is one step in a single pipeline. Quantities and your own catalog costs become a{" "}
          <strong className="text-ink">true cost</strong> for the job; true cost plus your target margin becomes a{" "}
          <strong className="text-ink">recommended price</strong>; what actually happened on the job becomes{" "}
          <strong className="text-ink">actual cost</strong>, which you compare back against the estimate.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-paper-dim p-4 text-xs font-bold uppercase tracking-wider text-muted">
          <span>Materials</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span>Labor</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span>Equipment</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span>Overhead</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span className="text-ink">True cost</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span className="text-ink">Target margin</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span className="text-ink">Customer estimate</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span>Actual job performance</span>
        </div>
        <p className="mt-4">
          You only ever supply your own real business assumptions — this app never invents a productivity rate, a
          material cost, or a "typical" markup for you. The order to set things up in is exactly the section order
          below: <strong className="text-ink">Settings → Catalog → Assemblies & Templates → Estimates</strong>, then
          <strong className="text-ink"> Rate Health</strong> and <strong className="text-ink">Estimate vs. Actual</strong>{" "}
          become useful once you have real saved data to check.
        </p>
      </GuideSection>

      <GuideSection id="settings" title="1. Settings — business assumptions" tabHref="/app/settings/" tabLabel="Open Settings">
        <WhyItExists>
          Every cost calculation in Pro — every assembly, every estimate, every rate-health check — reads from these
          numbers. Set them once here instead of re-entering your labor rate or overhead on every single job.
        </WhyItExists>
        <HowToUse
          steps={[
            <>
              Set <FieldName>Loaded labor rate</FieldName> — your fully-loaded cost per person-hour (wages + payroll
              tax + benefits), not just take-home pay.
            </>,
            <>
              Set <FieldName>Overhead</FieldName> (a % of direct job cost) and <FieldName>Target margin</FieldName>{" "}
              (the profit share of your selling price — not a markup on cost).
            </>,
            <>
              Set <FieldName>Default delivery cost</FieldName>, <FieldName>Minimum project price</FieldName>, and{" "}
              <FieldName>Typical small-job true cost</FieldName> (used only by the Minimum Job Audit on Rate Health).
            </>,
          ]}
        />
        <Example>
          <ExampleRow label="Loaded labor rate" value="$32.00 / person-hour" />
          <ExampleRow label="Overhead" value="15%" />
          <ExampleRow label="Target margin" value="35%" />
          <ExampleRow label="Default delivery cost" value="$150.00" />
          <ExampleRow label="Minimum project price" value="$500.00" />
          <ExampleRow label="Typical small-job true cost" value="$390.00" />
        </Example>
        <Screenshot src="/guide/settings.png" alt="Settings tab showing the Business assumptions card filled in with the example's loaded labor rate, overhead, target margin, delivery cost, minimum project price, and typical small-job true cost" />
        <Benefit>
          Change your labor rate or overhead ONE time here and every assembly, every open estimate, and Rate Health
          all recalculate from the new number — you're never stuck manually re-typing the same rate into a dozen
          places (or worse, forgetting one).
        </Benefit>
      </GuideSection>

      <GuideSection id="catalog" title="2. Catalog — materials & equipment" tabHref="/app/catalog/" tabLabel="Open Catalog">
        <WhyItExists>
          A reusable price book for the raw inputs every job is built from — enter a material or equipment cost once,
          then reference it from as many assemblies and estimates as you want.
        </WhyItExists>
        <HowToUse
          steps={[
            <>
              Click <FieldName>+ Add material</FieldName>, name it, set its unit cost and unit (each, sq ft, linear
              ft, yd³, ton, bag, pallet, hour, job, or a custom unit).
            </>,
            <>
              Click <FieldName>+ Add equipment</FieldName> the same way, priced per hour, day, job, or custom.
            </>,
            <>
              Edit an existing cost any time — a banner immediately tells you which assemblies, templates, and open
              estimates it affects (see the Rate Health section below for why this matters).
            </>,
          ]}
        />
        <Example>
          <ExampleRow label="Mulch" value="$42.00 / yd³" />
          <ExampleRow label="Topsoil" value="$38.00 / yd³" />
          <ExampleRow label="Shrub" value="$28.00 / each" />
          <ExampleRow label="Skid Steer" value="$45.00 / hour" />
        </Example>
        <Screenshot src="/guide/catalog.png" alt="Catalog tab showing the Materials table (Mulch, Topsoil, Gravel, Shrub, Paver) and Equipment table (Skid Steer, Dump Trailer, Mini Excavator, Plate Compactor) with real costs" />
        <Benefit>
          When your mulch supplier raises prices, you update ONE row here — not every estimate that has ever used
          mulch. Every assembly built on it recalculates automatically.
        </Benefit>
      </GuideSection>

      <GuideSection id="assemblies" title="3. Assemblies & Templates" tabHref="/app/templates/" tabLabel="Open Assemblies & Templates">
        <WhyItExists>
          An assembly bundles materials, labor, and equipment into ONE reusable, priced-per-unit service — "Mulch
          Installation" instead of re-adding mulch, labor, and a skid steer separately on every job that needs mulch.
          A template goes one level up: a whole saved PROJECT (several services at once) you can start a new estimate
          from instantly.
        </WhyItExists>
        <HowToUse
          steps={[
            <>
              Click <FieldName>Add assembly</FieldName>, name it (e.g. "Mulch Installation"), and pick its output unit
              (e.g. yd³).
            </>,
            <>
              Under <FieldName>Materials per unit</FieldName> and <FieldName>Equipment per unit</FieldName>, add each
              resource this service consumes and how much of it per unit of output.
            </>,
            <>
              Choose a <FieldName>Labor entry method</FieldName> — enter person-hours per unit directly, or a{" "}
              production rate (units per person-hour) if that's how you naturally estimate; the app converts between
              them for you.
            </>,
            <>
              Enter <FieldName>Current rate charged</FieldName> — what you actually charge customers for it today.
              This is what Rate Health compares against true cost.
            </>,
          ]}
        />
        <Example>
          <ExampleRow label="Mulch Installation" value="1 yd³ mulch + 0.4 labor-hr + 0.5 hr Skid Steer, per yd³" />
          <ExampleRow label="→ True cost" value="$88.90 / yd³ (materials $42.00 + labor $12.80 + equipment $22.50 + overhead $11.60)" />
          <ExampleRow label="Current rate charged" value="$140.00 / yd³" />
        </Example>
        <Screenshot src="/guide/assembly-mulch.png" alt="The Mulch Installation assembly card showing its materials, equipment, labor entry method, and the computed true cost per unit breakdown" />
        <Benefit>
          Build a service's real cost ONCE, with your own materials/labor/equipment assumptions, and it prices itself
          correctly on every future estimate — no more re-deriving "how much does mulch installation actually cost
          me" from scratch each time you quote a job.
        </Benefit>
      </GuideSection>

      <GuideSection id="estimates" title="4. Estimates" tabHref="/app/estimates/" tabLabel="Open Estimates">
        <WhyItExists>
          Where a real project comes together: pick your services and quantities, add any ad-hoc crew labor or extra
          costs, and Pro calculates the exact price required to hit your target margin — never a guess.
        </WhyItExists>
        <HowToUse
          steps={[
            <>
              Click <FieldName>New estimate</FieldName>, name the project, and set a customer name.
            </>,
            <>
              Click <FieldName>+ Add service</FieldName> for each assembly the job needs, and enter the real quantity
              (e.g. how many yd³ of mulch).
            </>,
            <>
              For work that isn't a clean per-unit service (site cleanup, a change-order day), click{" "}
              <FieldName>+ Add labor line</FieldName> and enter crew size × elapsed hours directly.
            </>,
            <>
              On any labor line, click <FieldName>Compare crew sizes</FieldName> to see the SAME scope of work costed
              at 2, 3, or 4 people — with an optional efficiency % per crew size, since doubling a crew rarely halves
              the time exactly.
            </>,
            <>
              Add <FieldName>Delivery</FieldName> and any other one-off costs, then check the dark{" "}
              <FieldName>Estimate summary</FieldName> panel for the true cost, recommended price, and expected margin.
            </>,
            <>
              Change <FieldName>Status</FieldName> to Quoted once you're ready to send it to the customer — this locks
              in a permanent quote revision, so the price the customer agreed to never silently drifts if your catalog
              costs change later.
            </>,
          ]}
        />
        <Screenshot src="/guide/estimates-list.png" alt="Estimates tab showing the saved Smith Residence project card with its quoted price and Completed status" />
        <Example>
          <ExampleRow label="Services" value="8 yd³ Mulch Installation · 18 each Shrub Installation · 220 linear ft Edging" />
          <ExampleRow label="Crew labor" value="3 people × 8 hrs @ $32/hr = 24.0 person-hours ($768.00)" />
          <ExampleRow label="Delivery + other" value="$180.00 + $100.00" />
          <ExampleRow label="True job cost" value="$3,097.64" />
          <ExampleRow label="Recommended quote" value="$4,766 (35.0% expected margin)" />
        </Example>
        <div className="mt-3 rounded-xl bg-paper-dim p-4 text-sm text-ink">
          <strong>Crew-size comparison, same job:</strong> at 100% efficiency, 2 people take 12.0 hrs, 3 people take
          8.0 hrs, 4 people take 6.0 hrs — and all three cost exactly the same, $768.00. The app never assumes a
          bigger crew is proportionally less efficient (or more) — you tell it, per crew size, if coordination speeds
          things up or slows them down.
        </div>
        <Screenshot src="/guide/crew-labor.png" alt="The Crew labor section of an estimate with the Compare crew sizes panel expanded, showing the 2/3/4-person cost comparison table" />
        <Benefit>
          You get a defensible, math-backed price in minutes instead of a gut-feel number — and "Compare crew sizes"
          answers "should I send a bigger crew?" with real dollars, not a hunch.
        </Benefit>
      </GuideSection>

      <GuideSection id="rate-health" title="5. Rate Health" tabHref="/app/rate-health/" tabLabel="Open Rate Health">
        <WhyItExists>
          The dashboard most contractors never build for themselves: every saved service, compared against the rate
          actually required to hit your target margin — so you find out you're underpriced from a report, not from a
          bad year.
        </WhyItExists>
        <HowToUse
          steps={[
            <>
              Every assembly with a <FieldName>Current rate charged</FieldName> set (see Assemblies & Templates)
              appears here automatically — there's nothing extra to configure.
            </>,
            <>
              Set a <FieldName>Typical small-job true cost</FieldName> on Settings to also unlock the{" "}
              <FieldName>Minimum job audit</FieldName>, which checks your minimum project price the same way.
            </>,
          ]}
        />
        <Example>
          <ExampleRow label="Mulch Installation" value="$140.00 charged, $88.90 true cost → 36.5% margin → Healthy" />
          <ExampleRow label="Topsoil Installation" value="$80.00 charged, $56.58 true cost → 29.3% margin → Needs attention" />
          <ExampleRow label="Edging" value="$2.25 charged, $1.38 true cost → 38.7% margin → Healthy" />
          <ExampleRow label="Shrub Installation" value="$45.00 charged, $48.76 true cost → −8.4% margin → Critical" />
          <ExampleRow label="Minimum job audit" value="$500 minimum is a 22.0% margin — below 35% target; ~$600 required" />
        </Example>
        <Screenshot src="/guide/rate-health.png" alt="Rate Health tab showing the Service Rate Health table with Healthy, Needs attention, and Critical statuses, plus the Minimum job audit result" />
        <div className="mt-3 rounded-xl bg-red-light/50 p-4 text-sm text-ink">
          <strong>Read this like a real business owner would:</strong> "Shrub Installation" is flagged{" "}
          <Badge tone="red">Critical</Badge> — at $45 each, it doesn't even cover the $48.76 it actually costs to
          install. Every shrub sold at that price loses money before overhead is even considered. The fix is
          immediate and specific: raise the rate to at least $75.02/each to hit the 35% target margin.
        </div>
        <Benefit>
          This is the single highest-value screen in Pro: it turns "I have a feeling some of my prices are too low"
          into an exact list of which services, by how much, and what to charge instead.
        </Benefit>
      </GuideSection>

      <GuideSection id="actuals" title="6. Estimate vs. Actual" tabHref="/app/actuals/" tabLabel="Open Estimate vs. Actual">
        <WhyItExists>
          An estimate is a prediction. This tab is where you find out if your predictions are any good — by recording
          what a job actually cost once it's done, and comparing it back to what you quoted.
        </WhyItExists>
        <HowToUse
          steps={[
            <>
              Once a project has been Quoted (see Estimates above), come here and enter the real{" "}
              <FieldName>Actual qty</FieldName> and <FieldName>Actual labor (hrs)</FieldName> for each service, plus
              actual materials/equipment/delivery/other cost.
            </>,
            <>
              Click <FieldName>Save actuals</FieldName> — this marks the job Accepted/Completed and unlocks the
              expected-vs-actual comparison for that job.
            </>,
            <>
              Check <FieldName>Profitability, across every completed job</FieldName> and{" "}
              <FieldName>Historical variance by service</FieldName> once you have several completed jobs — every
              number is clickable and jumps straight to the project(s) it's built from.
            </>,
          ]}
        />
        <Example>
          <ExampleRow label="Estimated vs. actual" value="Mulch 8 yd³ → 9.5 yd³ · Shrub 18 → 19 · Edging 220 → 225 ft · Labor 24 hrs → 31 hrs" />
          <ExampleRow label="Expected margin" value="35.0%" />
          <ExampleRow label="Actual margin" value="38.2%" />
          <ExampleRow label="Cost variance" value="−$151.34 (−4.9% — came in under budget)" />
          <ExampleRow label="Historical labor variance, Mulch Installation" value="+337.5% vs. estimated — worth a second look at that assumption" />
        </Example>
        <Screenshot src="/guide/actuals-entry.png" alt="Estimate vs. Actual card for Smith Residence showing entered actual quantities and costs, plus the expected-vs-actual margin, cost variance, and category comparison table" />
        <Benefit>
          This is how your estimating assumptions actually get better over time — not by guessing, but by watching
          the real gap between "what we thought" and "what happened," service by service. Nothing here auto-corrects
          your saved rates; you always decide whether a pattern is real before acting on it.
        </Benefit>
      </GuideSection>

      <GuideSection id="backup" title="7. Backup & restore" tabHref="/app/settings/" tabLabel="Open Settings">
        <WhyItExists>
          Everything in Pro lives only in this browser's local storage — there's no account and no server, which is
          what keeps this app free of subscriptions and privacy concerns. The tradeoff: nothing is backed up unless
          you export it yourself.
        </WhyItExists>
        <HowToUse
          steps={[
            <>
              On Settings, click <FieldName>Export workspace (JSON)</FieldName> — this saves every material,
              piece of equipment, assembly, template, estimate, and completed-job record to one file.
            </>,
            <>
              Use <FieldName>Import workspace</FieldName> on a new device or browser to restore everything exactly as
              it was.
            </>,
          ]}
        />
        <Benefit>
          Do this before clearing browser data, switching computers, or moving to a new browser — it's the only way
          your saved pricing data survives any of those.
        </Benefit>
      </GuideSection>

      <GuideSection id="checklist" title="First-time checklist">
        <p>If you're setting this up for the first time, do it in this order:</p>
        <ol className="mt-3 space-y-2 pl-5 text-sm text-ink" style={{ listStyleType: "decimal" }}>
          <li>Set your real labor rate, overhead, and target margin on Settings.</li>
          <li>Add the materials and equipment you actually use, at your real costs.</li>
          <li>Build 2–3 assemblies for your most common services, with a current rate charged on each.</li>
          <li>Check Rate Health immediately — this alone is often worth the whole setup.</li>
          <li>Build your next real estimate on the Estimates tab instead of a spreadsheet.</li>
          <li>Once a job finishes, record its actuals — this is what makes next year's estimates sharper than this year's.</li>
        </ol>
      </GuideSection>
    </div>
  );
}

function GuideSection({
  id,
  title,
  tabHref,
  tabLabel,
  children,
}: {
  id: string;
  title: string;
  tabHref?: string;
  tabLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {tabHref && (
          <a
            href={tabHref}
            className="tap-target inline-flex items-center gap-1.5 rounded-lg bg-paper-dim px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-forest hover:bg-lime-surface/30"
          >
            {tabLabel} <ArrowRight size={14} aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink">{children}</div>
    </Card>
  );
}

function WhyItExists({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">Why this exists</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function HowToUse({ steps }: { steps: ReactNode[] }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">How to use it</p>
      <ol className="mt-2 space-y-1.5 pl-5" style={{ listStyleType: "decimal" }}>
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

/** A real screenshot of this exact workspace's data — captured directly
 * from the running app, not a mockup. Capped well below the card's full
 * width: at native size these dwarf the surrounding text (some are 1800px+
 * wide since a couple were captured at 2x for text sharpness), and nothing
 * here needs to be read at full resolution — it's illustrating the text
 * next to it, not replacing it. */
function Screenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border" style={{ maxWidth: "26rem" }}>
      <img src={src} alt={alt} className="block w-full" loading="lazy" />
    </div>
  );
}

function Example({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">Real example from this workspace — "Smith Residence"</p>
      <div className="mt-2 space-y-1.5 rounded-xl bg-paper-dim p-4">{children}</div>
    </div>
  );
}

function ExampleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 pb-1.5 last:border-b-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="text-right text-sm font-semibold tabular-nums text-ink sm:text-left">{value}</span>
    </div>
  );
}

function Benefit({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-mint/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-mint-ink">Why it's worth it</p>
      <p className="mt-1 text-ink">{children}</p>
    </div>
  );
}

function FieldName({ children }: { children: ReactNode }) {
  return <span className="rounded bg-paper-dim px-1.5 py-0.5 font-mono text-[0.8125em] font-semibold text-ink">{children}</span>;
}
