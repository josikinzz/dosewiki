# dose.wiki documentation

Contributor documentation for the dose.wiki repository. The root documents
are the entry points: [README](../README.md), [ARCHITECTURE](../ARCHITECTURE.md),
[CONTRIBUTING](../CONTRIBUTING.md), and [AGENTS](../AGENTS.md). When prose and
source disagree, the source is right.

Start every task with AGENTS.md, the ARCHITECTURE.md map, and the row below
that matches the task. Open the other documents on this page only when the
task reaches them.

## Find the document for a task

| Task | Read first |
| --- | --- |
| Place a new module or helper | [ARCHITECTURE.md](../ARCHITECTURE.md#where-new-code-goes) |
| Add or change an API route | [CONTRIBUTING.md](../CONTRIBUTING.md#add-an-api-route), then [auth](architecture/auth.md) |
| Run the checks for a change | [CONTRIBUTING.md](../CONTRIBUTING.md#verify) |
| Find or run a package command | [scripts/README.md](../scripts/README.md#command-catalog) |
| Change article shape or a generated file | [ARCHITECTURE.md](../ARCHITECTURE.md#generated-code) and [data/README.md](../data/README.md) |
| Write production data or run a migration | [data credentials](operations/data-credentials.md) |
| Release a build or change a host | [deployment](operations/deployment.md) |
| Build or change shared UI | [UI kit](design/ui-kit.md) |
| Run a citation, legality, translation, or replication workflow | The matching row under [Workflows](#workflows) |

## Reference

| Document | Purpose |
| --- | --- |
| [api.md](api.md) | Public read-only API contract and the canonical replication embed protocol |
| [glossary.md](glossary.md) | Canonical vocabulary for citations, legality research, article review, replications, and public hosts |

## Architecture

| Document | Purpose |
| --- | --- |
| [architecture/runtime-and-data.md](architecture/runtime-and-data.md) | Postgres document model, public and editor data flows, rendering and revalidation, auth, and integrations |
| [architecture/auth.md](architecture/auth.md) | Auth.js, accounts, membership roles, and route protection |
| [architecture/openchemlib-fork.md](architecture/openchemlib-fork.md) | Ownership, provenance, rebuild, and update contract for the vendored OpenChemLib fork |

## Decisions

| Document | Purpose |
| --- | --- |
| [adr/0001-citation-only-marker-workflow.md](adr/0001-citation-only-marker-workflow.md) | Citations are marker-only edits on real article text |
| [adr/0002-canonical-legal-status-vocabulary.md](adr/0002-canonical-legal-status-vocabulary.md) | Fixed legal status values for country entries |
| [adr/0003-advisory-review-flags.md](adr/0003-advisory-review-flags.md) | Review flags advise; they never gate approval |
| [adr/0004-replications-top-level-section.md](adr/0004-replications-top-level-section.md) | Replications are a top-level public section |

## Design

| Document | Purpose |
| --- | --- |
| [design/ui-kit.md](design/ui-kit.md) | Shared UI tiers, the `/dev/kit` catalog, and how the shared components behave |
| [design/visual-style-guide.md](design/visual-style-guide.md) | Color, type, geometry, and motion tokens and where they live |
| [design/font-swap-howto.md](design/font-swap-howto.md) | How to change the site fonts |
| [design/category-tag-icons.md](design/category-tag-icons.md) | Category tag icon set and how to add one |
| [design/molecule-editor.md](design/molecule-editor.md) | Molecule depiction editor design notes: OpenChemLib canvas, stereo guards, and override rows |

## Operations

| Document | Purpose |
| --- | --- |
| [operations/deployment.md](operations/deployment.md) | Vercel project routing, build separation, release preconditions, and recovery |
| [operations/data-credentials.md](operations/data-credentials.md) | Production targets, credential tiers, the literal write ceremony, migrations, and freeze |
| [operations/locale-mirrors.md](operations/locale-mirrors.md) | Machine-translated locale mirrors: storage, refresh cron, and operator work |
| [operations/replication-media-delivery.md](operations/replication-media-delivery.md) | R2 and Worker media delivery, image renditions, and urgent withdrawal |
| [operations/social-cards.md](operations/social-cards.md) | Social-card generation, R2 publication phases, verification, and manifest install |
| [operations/security-ci.md](operations/security-ci.md) | Secret scanning, the remote build workflow, dependency audit reporting, overrides, and accepted advisories |
| [operations/browser-security-policy.md](operations/browser-security-policy.md) | Enforced browser security headers and their review contract |

## Workflows

| Document | Purpose |
| --- | --- |
| [workflows/citations.md](workflows/citations.md) | Marker-only citation runs: invariants, run directory, gate sequence, and the guarded apply path |
| [workflows/legality.md](workflows/legality.md) | Legality drafts, the reader-register rule, validator gates, and live-row sweeps |
| [workflows/replication-intake.md](workflows/replication-intake.md) | Runbook for reviewing and importing Reddit replication discoveries |
| [workflows/replication-classification-guide.html](workflows/replication-classification-guide.html) | Field guide for replication admission, viewing mode, and taxonomy |
| [workflows/trip-report-timeline.md](workflows/trip-report-timeline.md) | Lossless reshaping of flat trip reports onto the phase rail |
| [workflows/article-source-quote-extraction.md](workflows/article-source-quote-extraction.md) | Shared contract for verbatim quote extraction from article sources |
| [workflows/public-search.md](workflows/public-search.md) | Public search identity, localized matching, exact CAS lookup, and navigation freshness |
| [workflows/translation-workbench.md](workflows/translation-workbench.md) | The `/dev/glossary` translation workbench: terms, interface text, articles, and publication evidence |
| [workflows/public-language-glossaries.md](workflows/public-language-glossaries.md) | Public `/glossary` pages, locale mirrors, and reader suggestions |

## Source corpora kept under content

| Document | Purpose |
| --- | --- |
| [../content/sources/psychonautwiki-2015/README.md](../content/sources/psychonautwiki-2015/README.md) | Recovered 2015 to 2016 PsychonautWiki subjective-effects corpus: scope, collection rules, and import status |
| [../content/sources/psychonautwiki-2015/subjective-effects-integration-tracker.md](../content/sources/psychonautwiki-2015/subjective-effects-integration-tracker.md) | Per-substance conversion and import status read by `scripts/data-ops/apply-subjective-effects-import.ts` |
| [../content/sources/psychonautwiki-2015/LICENSE.md](../content/sources/psychonautwiki-2015/LICENSE.md) | Reuse terms for the recovered corpus |
| [../content/sources/psychonautwiki-2015/not-found-2015.md](../content/sources/psychonautwiki-2015/not-found-2015.md) | Substances with no archived 2015 subjective-effects section |
