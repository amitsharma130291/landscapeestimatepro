# Landscape Estimate Pro — calculator expansion and SEO audit

Audit date: 18 September 2026. Baseline: `506bd32a94acbe787816bcfc011237fe9fbaf9b5`.

## Scope and outcome

Built five free calculators and reviewed all 28 built page routes: 20 indexable public pages and eight intentionally noindex Pro workspace pages. Reviewed page intent, editorial content, repeated content, internal links, product claims, rendered metadata, canonicals, JSON-LD, image references, sitemap inclusion, robots directives, and mobile usability. The audit includes the rendered production build, not just source filenames.

All checks in `npm run audit:seo` pass. This is an implementation audit, not a guarantee of rankings, indexation, or a Google quality score. The work is prepared on a separate branch for review; production changes require deployment.

## Five new pages

| Route | Distinct task | Editorial words* | Incoming main-content pages** | Paid-product connection |
|---|---|---:|---:|---|
| `/landscape-job-cost-calculator/` | Budget vs. actual cost by category; fixed-revenue profit and variance | 648 | 10 | Saved actuals, profitability reporting, historical variance |
| `/landscape-profit-margin-calculator/` | Profit, margin, markup, and target-price solver | 627 | 11 | Rate Health and saved service costs |
| `/mulch-cost-calculator/` | Area/depth volume; rounded bag count vs. bulk delivery; installation price | 659 | 10 | Reusable mulch service assemblies and production rates |
| `/topsoil-cost-calculator/` | Volume vs. supplier-density weight quotes; delivery and spreading | 676 | 10 | Soil assemblies, equipment rates, multi-service estimates |
| `/landscape-labor-cost-calculator/` | Loaded person-hour and crew-hour costs including paid travel | 652 | 10 | Saved labor assumptions and actual-labor comparison |

*Editorial counts exclude global navigation/footer, calculator interfaces, shared promotion, and related-tool grids. Word count is recorded for review, not treated as a ranking requirement.

**Unique referring public pages with a main-content link; excludes global header/footer links but includes related-tool cards and the resources hub. Counts can be regenerated from the report.

Each page has a unique title, description, H1, self-referencing canonical, social metadata, breadcrumb trail, free WebApplication offer, visible FAQs with matching FAQ data, an interactive tool, explicit units, a worked example, assumptions, contextual links, and a tailored Pro banner. Prices come from the existing central configuration ($79 lifetime launch price at audit time). No trial or free access to the paid workspace is promised.

## Findings and fixes

| Finding | Fix |
|---|---|
| Cost and estimate calculator pages offered the same calculator with almost the same purpose | The estimate page now builds service quantities × direct unit costs, plus shared project expenses. The cost page retains category-total entry. Updated instructions, example, FAQs, and tests match each workflow. |
| Estimate and quote pages had little unique guidance and misleading internal-costing descriptions | Retained both useful document modes; explained provisional quantities on estimates and detailed/summary quote presentation, with distinct scope, notes, review, and handoff guidance. Corrected claims: both create customer documents and require internal costing elsewhere. |
| Invoice and price-list pages had little guidance beyond their form | Added task-specific preparation, limitations, calculations, review steps, and relevant next-tool links. Did not add generic paragraphs solely to inflate length. |
| Price-list metadata claimed profitability functionality it did not itself provide | Changed description and resource card to accurately describe organizing and printing rates; linked to the margin tool for a separate profit check and Pro for automatic Rate Health. |
| Shared banners/footer/site schema claimed “Try Pro free,” “free today,” or a “planned” price despite paid licensing | Corrected shared text and homepage price strip. Calls to action use the central current price and preserve the existing licensed-user “Go to App” behavior. Conditional sales-disabled wording remains conditional. |
| Unsupported “#1” calculator claim and unsubstantiated ten-minute proof strip | Replaced with descriptive tool and pricing copy. |
| robots.txt blocked app crawling, preventing crawlers from reading noindex | Allowed crawling while retaining app noindex and sitemap exclusion. Client license gating is unchanged; robots rules are not access control. |
| Sitemap assigned a fresh lastmod to every page on every rebuild | Omitted lastmod until a reliable per-page content-modified date exists. |
| URL formatting could vary | Configured trailing slashes and normalized canonical paths. Existing internal links use canonical slash forms. Production slashless URLs currently also respond; the canonical consolidates the preferred form without redirecting payment API calls. |
| New pages needed discovery and meaningful linking | Added a categorized resources hub, homepage cards, footer discovery, three relevant related tools per tool page, Home → Free tools → tool breadcrumbs, and in-context links from the cost/estimate tools, guide, price list, templates, and software page. |

## Duplicate, thin, and scaled-content review

- No duplicate public titles, meta descriptions, or exact editorial text in the final build.
- Five-word phrase overlap is a diagnostic, not a Google threshold. The highest pair is pricing/refund at 10.2%, reflecting common refund/product language. Guide/cost-calculator overlap is 7.7%; estimate/quote-template overlap is 2.6%. These do not warrant forced consolidation in the reviewed content.
- The five additions have different inputs, calculations, outputs, examples, and decision guidance. Mulch's bags-versus-bulk calculation differs from topsoil's volume-versus-weight comparison. Their common layout and volume formula are reusable implementation, not the sole content of the pages.
- No city-name variants, automatically multiplied keyword pages, copied third-party articles, fabricated local prices, or fabricated reviews were added. Sample prices and assumptions are explicitly examples, not market statistics.
- Contact, resources, pricing, refund, and other legal pages were evaluated by purpose. A short contact form or clear refund policy does not need filler to meet an arbitrary word count. The resource hub's main value is its categorized tools.
- The homepage introduces the product and tools; the software page explains paid workflows; pricing handles purchasing, activation, and recovery. Shared product facts are expected, with separate page purposes.
- The eight app routes remain noindex and out of the sitemap. Their client-rendered interfaces are not being used as thin search landing pages.

## Technical audit evidence

The repeatable audit checks all built routes for public metadata, canonical URLs, one public H1, image alt attributes, referenced assets, duplicate IDs, internal paths and fragments, nonempty link text, parseable JSON-LD, duplicate editorial pages, sitemap inclusion/exclusion, and crawlable app noindex. It also records incoming main-content links and editorial similarity. Results: zero reported issues.

Public HTTP checks on the existing production deployment found:

- HTTPS homepage: 200.
- HTTP homepage: 308 to HTTPS.
- `www` homepage: 308 to the non-www canonical host.
- Invented page path: 404 (no soft-404 fallback to the homepage).
- robots.txt and sitemap index: 200.
- Slashless cost-calculator route: 200. Canonical normalization is present in this branch; no broad redirect rule was added that could disturb checkout/contact API calls.
- The old live robots.txt still blocks `/app/`; deploying this branch publishes the correction.

## Verification

- Production build succeeds: 28 pages.
- Full unit suite: 763 tests pass across 44 files.
- New calculator arithmetic covers independent worked examples, losses, zero denominators, invalid margins, fractional crews, bag rounding, weight-vs-volume independence, and whitespace in pasted inputs.
- All 86 selected Chromium browser tests pass: all five new tools, validation and reset, service worksheet editing, structured data, internal links, licensed-user links, and existing free-tool workflows.
- All five new pages and the changed service worksheet pass automated serious/critical WCAG 2 A/AA checks and 375px overflow checks. Desktop and mobile screenshots are retained with the audit artifacts.
- Type checking reports no errors; remaining hints concern pre-existing deprecated APIs.

## Deployment and external-data limits

After merge/deployment, rerun the route, sitemap, canonical, and robots checks against production. Use Search Console to inspect the new URLs and confirm indexing and Google's selected canonical. Search Console coverage, manual actions, historical traffic, backlinks, real-user Core Web Vitals, and exact keyword volume/KD were not available in this audit. No claim is made that those external checks passed. The user authorized building these pages without waiting for a keyword-volume study.

Do not interpret this report as a promised “10/10 SEO” or guaranteed absence of future search-policy issues. Internal linking was verified with concrete crawlability and relevance checks, and content was reviewed for independent utility.

## Reference guidance

- [Google: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies#scaled-content)
- [Google: consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: crawlable links and descriptive anchor text](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)

To rerun: `npm ci`, `npm run build`, `npm run audit:seo`, `npm test`, and the relevant Playwright suites. The machine-readable audit is written to `reports/seo-audit.json`.
