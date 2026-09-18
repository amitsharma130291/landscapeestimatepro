# Content-quality fixes and remaining evidence

18 September 2026. Follow-up to the post-merge scorecard for PR #1.

## Implemented

- Replaced repeated “Run the numbers once. Reuse them forever” and “every future estimate calculates itself” copy with specific descriptions of saved inputs and the user's remaining work.
- Gave each existing tool a contextual Pro promotion. Shared product facts may still repeat; the goal is useful, accurate content rather than evading textual similarity checks.
- Removed the homepage's “natural path to Pro” funnel heading, softened broad storage/automation claims, shortened abstract sales-page headlines, and labelled the financial demonstrations as illustrative rather than customer proof.
- Added `/calculation-methodology/`: formulas by tool, unit conversion, rounding policy, sample inputs, a reproducible budget-versus-actual review, document-builder behavior, and a correction/contact path. Example outputs come from the actual calculator implementation and are independently checked by tests.
- Linked methodology from the tools, resource hub, homepage, sales page, contact page, and footer. The site now builds 29 routes: 21 public pages and eight noindex app routes.
- Added quote-only reference and validity-date fields that print on the customer document. Invalid date order prevents printing. The estimate builder retains the provisional-quantity workflow; quote presentation and metadata now provide more than a different heading.
- Fixed premature true-cost rounding in the multi-service worksheet: a $0.01 direct cost, 25% overhead, and 40% margin now correctly produces a $0.03 required price. Added a regression test.
- Added publication standards requiring a distinct task and recorded demand evidence for further acquisition-page expansion. Missing keyword evidence is explicitly recorded rather than retroactively invented.
- Extended the rendered SEO audit to flag the removed unsupported phrases and missing methodology links on the new calculator family.

## Validation

- Production build: 29 routes.
- Rendered-site SEO audit: zero issues in the implemented checks.
- Unit tests: 763 passing across 44 files.
- Selected Chromium browser tests: 76 passing, including copy, links, mobile overflow, accessibility, document printing, and the rounding regression.
- Astro check: zero errors or warnings; six pre-existing deprecation hints.

These results validate specific behavior. They do not validate a universal content-quality score.

## Reassessment using the prior rubric

Higher is better. Scores remain subjective editorial self-assessments, not Google scores, an AI detector, or measured probabilities. The dimensions and missing-evidence deductions are retained rather than redefining success as 100.

| Category | Before | After | Basis |
|---|---:|---:|---|
| Thin-content resilience | 88 | 90 | Coverage and practical completion improve with the methodology and quote workflow. Firsthand evidence remains limited. |
| Duplicate-content control | 90 | 93 | Contextual promotions and quote-only output provide clearer differentiation. Shared calculators/document structure are still present where useful; query overlap remains unmeasured. |
| Writing quality / freedom from AI slop | 82 | 94 | Repeated slogans, funnel copy, broad automation claims, and unsupported screenshot wording are removed. Writing quality remains a judgment, not a binary fact. |
| Scaled-content resilience | 92 | 94 | Added an evidence-based expansion standard and clearer provenance. Historical demand evidence and independent user validation remain unavailable. |

Unweighted mean: 92.75, rounded to **93/100**.

Five dimensions, each scored out of 20, using the same rubric as before:

- Thin content: task completion 19, examples/calculations 19, assumptions/limitations 19, appropriate coverage 18, firsthand evidence/attribution 15 = 90.
- Duplication: metadata 20, editorial differentiation 19, intent separation 17, output differentiation 19, URL/indexation consolidation 18 = 93.
- Writing: clarity 19, concrete detail 19, restrained repetition 19, precise claims 19, natural reader-focused language 18 = 94.
- Scaled content: standalone utility 20, distinct purposes 19, coherent scope 20, disclosed assumptions 19, user-need/field-validation evidence 16 = 94.

## Why this is not 100/100

No real completed-job records or named expert-review details were supplied during this work. The site therefore publishes a clearly labelled calculation example and a truthful publisher/methodology statement, not an invented customer case study or professional endorsement.

Search Console query overlap, Google's selected canonicals, indexing outcomes, and keyword-volume/user-demand evidence also remain unverified. They require external records or observation, not rewriting paragraphs. A publication standard prevents unsupported future expansion but does not create historical demand evidence.

To close those gaps, provide a publishable anonymized estimate/actual job record and a reviewer name with accurate relevant experience, then inspect search data after the deployed pages have been crawled. No numeric score can guarantee rankings or freedom from future quality issues.
