# Central Improvement Task Tracker

Last updated: 2026-04-26

This tracker coordinates the architecture improvement tasks in this folder. Each task has a dedicated planning document. The parent agent should complete the queue by delegating exactly one task at a time to a subagent, waiting for that subagent to finish, reviewing the result, marking the task done here, and then starting the next task.

## Parent Agent Operating Instructions

1. Read `AGENTS.md` and `/Users/josie/.agents/skills/improve-codebase-architecture/SKILL.md` before beginning.
2. Pick the first unchecked task in the queue unless the user explicitly gives a different priority.
3. Spawn one subagent for that task only.
4. Give the subagent:
   - The repository path: `/Users/josie/Documents/Utilities/dose.wiki copy`
   - The skill file: `/Users/josie/.agents/skills/improve-codebase-architecture/SKILL.md`
   - The dedicated task file path from this tracker
   - A clear instruction to implement the task, update tests/docs as needed, and avoid unrelated changes
5. Wait for that subagent to complete before spawning the next one.
6. Review the subagent output and local diff. Run the relevant verification commands for the task.
7. If the work is acceptable, mark that task as done in this tracker with the completion date and a short note.
8. If the work is incomplete, either return the same task to a subagent with specific correction instructions or mark it blocked with the reason.
9. Continue until every task is done or blocked.

Do not run multiple implementation subagents in parallel for this tracker. The goal is to prevent context overload and conflicting edits. Keep the parent context small: rely on each task file, the subagent's final report, `git diff`, and this tracker. Do not reread the whole codebase for every task.

## Subagent Prompt Template

Use this shape for each delegated task:

```text
You are working in /Users/josie/Documents/Utilities/dose.wiki copy.

Read AGENTS.md.
Read /Users/josie/.agents/skills/improve-codebase-architecture/SKILL.md.
Read the task file: docs/improvement-tasks/<task-file>.md.

Implement this task only. Preserve user changes and avoid unrelated refactors. Use the task file's Files, Problem, Proposed deepening opportunity, Benefits, Test plan, and Risk/rollout notes as the source of truth. Update tests and docs when the implementation changes contracts or workflows. Run the narrowest relevant verification commands you can, and report:

- Files changed
- What changed
- Verification run and result
- Any residual risk or follow-up
```

## Status Legend

- `[ ]` Pending
- `[x]` Done
- `[!]` Blocked

## Task Queue

- [x] [API/Auth Convex Write Capability Module](api-auth-convex-write-capability.md) - Introduce a deeper write-capability module so protected routes and Convex writes share one authorization interface instead of each carrying its own capability checks. Completed 2026-04-26.
- [x] [API/Auth GitHub File Write Module](api-auth-github-file-write-module.md) - Consolidate GitHub file write behavior behind a focused module with a smaller interface for validation, commit metadata, branch handling, and error modes. Completed 2026-04-26.
- [x] [API/Auth Rate Limit Policy Adapter](api-auth-rate-limit-policy-adapter.md) - Move route-specific rate limit decisions into policy adapters so callers do not need to know storage and throttling details. Completed 2026-04-26.
- [x] [API/Auth Role Policy Module](api-auth-role-policy-module.md) - Centralize role policy rules for editor/admin/self-profile operations so Auth.js, middleware, and route handlers do not duplicate role semantics. Completed 2026-04-26.
- [x] [API/Auth Route Operation Envelope](api-auth-route-operation-envelope.md) - Create a route-operation wrapper for common request parsing, auth, capability checks, errors, and response shape. Completed 2026-04-26.
- [x] [Batch Deepen Run Orchestration](batch-deepen-run-orchestration.md) - Replace scattered batch generation control flow with a deeper run-orchestration module covering inputs, retries, progress, and failure reporting. Completed 2026-04-26.
- [x] [Batch OpenRouter Adapter Seam](batch-openrouter-adapter-seam.md) - Put OpenRouter model calls behind an adapter seam so batch generators depend on a stable generation interface rather than SDK details. Completed 2026-04-26.
- [x] [Batch Persistence And Artifacts](batch-persistence-and-artifacts.md) - Define one persistence/artifact module for generated output, intermediate files, and Convex writes so batch scripts have clearer durability semantics. Completed 2026-04-26.
- [x] [Batch Source Material Resolution](batch-source-material-resolution.md) - Centralize source material lookup and fallback rules for batch generation instead of resolving evidence independently in each script. Completed 2026-04-26.
- [x] [Chemistry Editor Public Presentation Seam](chemistry-editor-public-presentation-seam.md) - Separate chemistry editor state from public presentation models so changes to editor workflows do not leak into article rendering. Completed 2026-04-26.
- [x] [Chemistry Identifier Map Provenance Module](chemistry-identifier-map-provenance-module.md) - Add a provenance-aware module for IUPAC, SMILES, title, and molecule identifier maps so maintainers can trust and update mappings safely. Completed 2026-04-26.
- [x] [Chemistry Molecule Asset Resolution Module](chemistry-molecule-asset-resolution-module.md) - Deepen molecule asset lookup behind a resolver that owns aliases, fallbacks, and missing-asset behavior. Completed 2026-04-26.
- [x] [Chemistry Reagent Testing Adapter Module](chemistry-reagent-testing-adapter-module.md) - Put reagent proxy and preview logic behind an adapter module with explicit request policy, response normalization, and test seams. Completed 2026-04-26.
- [x] [Article Source Document Contract](citations-article-source-document-contract.md) - Define a stable contract for article source documents so parsers, quote extraction, citations, and display code agree on source identity and fields. Completed 2026-04-26.
- [x] [Quote Section Contract](citations-quote-section-contract.md) - Deepen quote storage and display through a quote-section contract that owns quote grouping, attribution, and section placement. Completed 2026-04-26.
- [x] [Citation Role And Display Projection](citations-role-display-projection.md) - Create citation display projections so public UI does not need to interpret raw source roles or citation metadata. Completed 2026-04-26.
- [x] [Content Model Editorial Review Visibility Policy](content-model-editorial-review-visibility-policy.md) - Enforce editor-only `editorial_review` visibility through a policy module spanning schema, public projections, and editor surfaces. Completed 2026-04-26.
- [x] [Content Model Generated Section Update Contract](content-model-generated-section-update-contract.md) - Define a contract for generated section updates so generators, editors, and persistence agree on replacement, merge, and provenance behavior. Completed 2026-04-26.
- [x] [Content Model Section Presence Manifest](content-model-section-presence-manifest.md) - Add a section presence manifest to describe expected article sections, optionality, and empty-state rules across schema, editor, and public views. Completed 2026-04-26.
- [x] [Contributors Reports Author Attribution Operation](contributors-reports-author-attribution-operation.md) - Consolidate contributor/report attribution rules into one operation that resolves profile keys, aliases, ownership, and public labels. Completed 2026-04-26.
- [x] [Contributors Reports Trip Report Contract Module](contributors-reports-trip-report-contract-module.md) - Create a trip report contract module for report shape, author linkage, substances, routes, and public/detail projections. Completed 2026-04-26.
- [x] [Convex Authz Write Intents](convex-authz-write-intents.md) - Centralize Convex write authorization by explicit write intents rather than relying on scattered route and mutation role checks. Completed 2026-04-26.
- [x] [Convex Contributor Profile Identity Module](convex-contributor-profile-identity-module.md) - Consolidate contributor profile identity, aliases, keys, ownership, and materialization rules into one Convex-facing module. Completed 2026-04-26.
- [x] [Convex Schema Contract Depth](convex-schema-contract-depth.md) - Tighten the Convex article contract at ingestion and projection seams while keeping storage flexible enough for migrations. Completed 2026-04-26.
- [x] [Convex Substance Ingestion Module](convex-substance-ingestion-module.md) - Deepen substance upsert/write semantics into one ingestion module that owns validation, normalization, and conflict behavior. Completed 2026-04-26.
- [x] [Convex Substance Read Projections](convex-substance-read-projections.md) - Replace broad full-document reads with purpose-specific Convex projections for public pages, indexes, search, and metadata. Completed 2026-04-26.
- [x] [Data Ops Artifact Lineage Manifest](data-ops-artifact-lineage-manifest.md) - Track generated, imported, migrated, and synced artifacts with a lineage manifest so operators know what produced each data file. Completed 2026-04-26.
- [x] [Data Ops Migration Transform Workspace](data-ops-migration-transform-workspace.md) - Create a migration transform workspace that separates planning, dry-run output, fixtures, and production writes. Completed 2026-04-26.
- [x] [Data Ops Run Context And Target Policy](data-ops-run-context-and-target-policy.md) - Define a run-context policy for local, preview, production, read-mirror, and write-target behavior in data ops scripts. Completed 2026-04-26.
- [x] [Dev Page Controller Facades](dev-page-controller-facades.md) - Split the dev page controller into deeper facades for navigation, data loading, save state, session credentials, and tab-specific behavior. Completed 2026-04-26.
- [x] [Dev Profile Editor Model](dev-profile-editor-model.md) - Add a profile editor model that owns form shape, ownership constraints, avatar/link normalization, and save payloads. Completed 2026-04-26.
- [x] [Dev Save Operation Contract](dev-save-operation-contract.md) - Define a save operation contract for dev actions so UI hooks, API calls, status notices, and tests share one operation surface. Completed 2026-04-26.
- [x] [Dev Schema Form Field Adapters](dev-schema-form-field-adapters.md) - Introduce field adapters that bridge generated schema fields to React Hook Form controls without each form re-encoding schema details. Completed 2026-04-26.
- [x] [Dev Tag Editor State Machine](dev-tag-editor-state-machine.md) - Model tag editing as a state machine that owns selection, draft changes, mutation status, and validation behavior. Completed 2026-04-26.
- [x] [Discovery Graph Data Projection Module](discovery-graph-data-projection-module.md) - Build a graph projection module so graph UI depends on graph-ready nodes/edges instead of raw substance/library data. Completed 2026-04-26.
- [x] [Discovery Library And Content Builder Projection Depth](discovery-library-content-builder-projection-depth.md) - Deepen library/content builders into explicit projection modules for public indexes, categories, and article cards. Completed 2026-04-27.
- [x] [Discovery Route And Category Taxonomy Module](discovery-route-category-taxonomy-module.md) - Centralize route/category taxonomy rules, aliases, display names, and lookup behavior. Completed 2026-04-27.
- [x] [Discovery Search Index Module](discovery-search-index-module.md) - Create a deeper search index module that owns indexed fields, ranking inputs, normalization, and suggestion behavior. Completed 2026-04-27.
- [x] [Gap Replication Media Operations Workspace](gap-replication-media-operations-workspace.md) - Add an operations workspace for effect replication media so ingestion, display, attribution, and moderation rules have one home. Completed 2026-04-27.
- [x] [Parsers Aggregation Policy Module](parsers-aggregation-policy-module.md) - Move parser aggregation precedence, conflict handling, and confidence rules into a policy module. Completed 2026-04-27.
- [x] [Parsers Contract Fixture Harness](parsers-contract-fixture-harness.md) - Build a fixture harness that tests parser contracts through stable inputs and expected normalized outputs. Completed 2026-04-27.
- [x] [Parsers Parse Run Module](parsers-parse-run-module.md) - Create a parse-run module that owns parser selection, source loading, diagnostics, and output writing. Completed 2026-04-27.
- [x] [Parsers Source Identity Contract](parsers-source-identity-contract.md) - Define source identity rules so parsers, aggregation, citations, and generated artifacts use the same source keys. Completed 2026-04-27.
- [x] [Prompts Drift Policy Module](prompts-drift-policy-module.md) - Add a drift policy module to compare Convex runtime prompts, local prompt files, and migration output. Completed 2026-04-27.
- [x] [Prompts Registry Key Contract](prompts-registry-key-contract.md) - Define prompt registry keys and section mappings so scripts, Convex functions, and editor UI share one prompt identity contract. Completed 2026-04-27.
- [x] [Prompts Runtime Source And Editor State](prompts-runtime-source-and-editor-state.md) - Separate runtime prompt source resolution from dev editor state so editing, previewing, and saving prompts have clear locality. Completed 2026-04-27.
- [x] [Public Data Read Interface Depth](public-data-read-interface-depth.md) - Deepen public data reads behind a smaller interface that hides Convex client, fallback, cache, and projection details. Completed 2026-04-27.
- [x] [Public Data Report Profile Projection](public-data-report-profile-projection.md) - Create report/profile projections so public report pages do not assemble contributor profile data ad hoc. Completed 2026-04-27.
- [x] [Public Data Route Planning Module](public-data-route-planning-module.md) - Centralize public route planning for slugs, static params, route metadata, and fallback behavior. Completed 2026-04-27.
- [x] [Public Data Site Metadata URL Seam](public-data-site-metadata-url-seam.md) - Add a URL/metadata seam so sitemap, metadata, canonical links, and public routes share URL construction. Completed 2026-04-27.
- [x] [Public Routes Effect Article Section Model](public-routes-effect-article-section-model.md) - Deepen effect article section modeling so effect pages render structured sections instead of page-local content decisions. Completed 2026-04-27.
- [x] [Public Routes Taxonomy Detail Route Module](public-routes-taxonomy-detail-route-module.md) - Create a taxonomy detail route module that owns category/effect/mechanism detail lookup and route-specific states. Completed 2026-04-27.
- [x] [Public Routes Trip Report Index Module](public-routes-trip-report-index-module.md) - Deepen trip report index rules for filtering, sorting, card data, and empty states. Completed 2026-04-27.
- [x] [Public Routes View Model Adapters](public-routes-view-model-adapters.md) - Introduce view model adapters between public data reads and page components to localize rendering-oriented transformations. Completed 2026-04-27.
- [x] [Runtime Config Auth Runtime Policy](runtime-config-auth-runtime-policy.md) - Define an auth runtime policy for required secrets, local fallback credentials, preview behavior, and production validation. Completed 2026-04-27.
- [x] [Runtime Config Convex Target Capability](runtime-config-convex-target-capability.md) - Model Convex read/write target selection as an explicit capability instead of scattered env variable checks. Completed 2026-04-27.
- [x] [Runtime Config Env Contract Module](runtime-config-env-contract-module.md) - Create an environment contract module for runtime/public/server env validation and diagnostics. Completed 2026-04-27.
- [x] [Schema Article Projection Builders](schema-article-projection-builders.md) - Build article projection builders from schema metadata so public/dev/batch consumers do not duplicate article shape logic. Completed 2026-04-27.
- [x] [Schema Field Path Contract](schema-field-path-contract.md) - Define a typed field-path contract for generated schema paths, overrides, form fields, and update payloads. Completed 2026-04-27.
- [x] [Schema Generation Policy Module](schema-generation-policy-module.md) - Deepen schema generation policy so generated files, manual overrides, and regeneration commands follow one explicit rule set. Completed 2026-04-27.
- [x] [Schema Registry Composition Module](schema-registry-composition-module.md) - Consolidate field registry composition so generated registry, overrides, defaults, and section registry are assembled in one place. Completed 2026-04-27.
- [x] [Security Admin Key Intent Tokens](security-admin-key-intent-tokens.md) - Replace broad admin-key write access with intent-scoped tokens or capabilities for sensitive operations. Completed 2026-04-27.
- [x] [Security Diagnostics Disclosure Policy](security-diagnostics-disclosure-policy.md) - Centralize diagnostics disclosure policy so health/test/config endpoints do not expose sensitive runtime details. Completed 2026-04-27.
- [x] [Security Public Egress Proxy Policy](security-public-egress-proxy-policy.md) - Add a public egress proxy policy for reagent/external requests covering allowed hosts, timeout, cache, and response limits. Completed 2026-04-27.
- [x] [SEO/Nav Public Href Intent Module](seo-nav-public-href-intent-module.md) - Create a public href intent module so pages, cards, metadata, and redirects share route construction rules. Completed 2026-04-27.
- [x] [SEO/Nav Status and Redirect Policy Module](seo-nav-status-redirect-policy-module.md) - Centralize status, not-found, and redirect policy for legacy routes, missing data, and canonical destinations. Completed 2026-04-27.
- [x] [States Dev Notice Lifecycle Module](states-dev-notice-lifecycle-module.md) - Model dev save notices and errors with a lifecycle module that owns creation, replacement, dismissal, and persistence rules. Completed 2026-04-27.
- [x] [States Public Route Outcome Contract](states-public-route-outcome-contract.md) - Define route outcomes for public pages so missing data, redirects, not-found states, and partial data render consistently. Completed 2026-04-27.
- [x] [States Route Loading Skeleton Module](states-route-loading-skeleton-module.md) - Create a loading skeleton module for route families so loading UI follows stable layout contracts. Completed 2026-04-27.
- [x] [Test Types JS Declaration Contract](test-types-js-declaration-contract.md) - Improve JavaScript declaration contracts so JS modules and TypeScript tests share reliable types without hand-maintained drift. Completed 2026-04-27.
- [x] [Test Types Vitest Environment Adapters](test-types-vitest-environment-adapters.md) - Add test environment adapters that hide browser/server/mock setup details from individual Vitest suites. Completed 2026-04-27.
- [x] [UI System Route Chrome Module](ui-system-route-chrome-module.md) - Deepen route chrome into a module that owns header/footer/status layout contracts and public/dev chrome differences. Completed 2026-04-27.
- [x] [UI System Surface Primitives](ui-system-surface-primitives.md) - Create shared surface primitives for repeated panel/card/list styling so components do not hand-roll visual structure. Completed 2026-04-27.
- [x] [UI System Theme Token Interface](ui-system-theme-token-interface.md) - Define a theme token interface connecting Tailwind config, CSS variables, and component usage. Completed 2026-04-27.
- [x] [Workflow Generated Data Provenance](workflow-generated-data-provenance.md) - Track generated data provenance across commands, generated files, and docs so maintainers know what can be regenerated. Completed 2026-04-27.
- [x] [Workflow Hygiene Policy Module](workflow-hygiene-policy-module.md) - Move hygiene checks and cleanup rules into a policy module with a clearer interface for scripts and CI. Completed 2026-04-27.
- [x] [Workflow Package Script Command Surface](workflow-package-script-command-surface.md) - Rationalize package scripts into a command surface with clear categories, names, and expected side effects. Completed 2026-04-27.
- [x] [Workflow Script Docs Consistency](workflow-script-docs-consistency.md) - Keep script documentation synchronized with actual scripts, options, and runtime requirements. Completed 2026-04-27.
- [x] [Workflow Tooling Test Coverage](workflow-tooling-test-coverage.md) - Improve tooling and workflow test coverage around scripts, generated data, and command behavior. Completed 2026-04-27.

## Completion Notes

Record task completion notes here as the parent agent works through the queue.

```text
YYYY-MM-DD - <task file> - Done/Blocked - <short note>
2026-04-26 - api-auth-convex-write-capability.md - Done - Added a server Convex write capability module shared by protected routes, health diagnostics, server client helpers, and Auth membership URL resolution; focused Vitest tests and typecheck pass.
2026-04-26 - api-auth-github-file-write-module.md - Done - Added a GitHub file change module for commit assembly, repository adapter policy, branch updates, and error mapping; focused GitHub Vitest tests and typecheck pass.
2026-04-26 - api-auth-rate-limit-policy-adapter.md - Done - Added named rate-limit policies and storage adapters, migrated API routes to policy intents, documented runtime behavior, and verified focused route/policy tests plus typecheck.
2026-04-26 - api-auth-role-policy-module.md - Done - Centralized role intent decisions for Auth.js, middleware, `/dev` routing, editor guards, and self-profile access; focused auth/middleware tests and typecheck pass.
2026-04-26 - api-auth-route-operation-envelope.md - Done - Added a protected route operation module and migrated prompt, quote, and profile write routes through the shared envelope; focused module/route tests and typecheck pass.
2026-04-26 - batch-deepen-run-orchestration.md - Done - Added shared batch lifecycle orchestration and migrated the summary workflow through it; focused batch runner and section tests pass.
2026-04-26 - batch-openrouter-adapter-seam.md - Done - Added a batch OpenRouter adapter for retry, reasoning, empty-content debug hooks, and normalized results; migrated section wrappers and verified adapter tests/imports.
2026-04-26 - batch-persistence-and-artifacts.md - Done - Added shared batch persistence/artifact helpers, explicit section update adapters, sanitized Convex writes, and opt-in local JSON export; syntax checks and focused batch tests pass.
2026-04-26 - batch-source-material-resolution.md - Done - Added shared source material resolution for quote, generic, local-file, truncation, and dry-run parity paths; focused batch source/generator tests pass.
2026-04-26 - chemistry-editor-public-presentation-seam.md - Done - Added an article chemistry presentation model consumed by content builder, public hero/reagent sections, and editor preview labels; focused chemistry/public tests and typecheck pass.
2026-04-26 - chemistry-identifier-map-provenance-module.md - Done - Added chemistry identifier provenance and OPSIN map adapter modules, fixed SMILES map artifact path, and routed high-confidence prepopulation through merge policy; targeted tests and syntax checks pass.
2026-04-26 - chemistry-molecule-asset-resolution-module.md - Done - Added molecule asset catalog resolution, shared manifest config, content-builder population, and hero/page consumption of resolved assets; focused tests and typecheck pass.
2026-04-26 - chemistry-reagent-testing-adapter-module.md - Done - Added reagent testing adapter for lookup candidates, ProtestKit validation, normalized data, static/display conversion, route validation, and shared UI consumption; focused tests and typecheck pass.
2026-04-26 - citations-article-source-document-contract.md - Done - Added normalized article source document contract, tightened Convex contents validation, and routed source import/extraction/summary paths through it; focused tests and typecheck pass.
2026-04-26 - citations-quote-section-contract.md - Done - Added quote section descriptors for canonical IDs, aliases, prompt/category metadata, local artifacts, and availability; routed Convex writes, save-quote, extraction, migration, sync, and editor availability through the contract; focused tests pass.
2026-04-26 - citations-role-display-projection.md - Done - Added citation display projection and migration role policy modules, routed substance/effect/VCode/editor citation paths through them, and verified focused tests plus typecheck.
2026-04-26 - content-model-editorial-review-visibility-policy.md - Done - Added editorial review visibility policy, stripped public projections, defaulted editor reads, and rejected generated updates to editor-only metadata; focused tests and typecheck pass.
2026-04-26 - content-model-generated-section-update-contract.md - Done - Added generated section update contract for editor apply flows across dosage/duration, harm, legality, tolerance, interactions, and pharmacology; focused tests and typecheck pass.
2026-04-26 - content-model-section-presence-manifest.md - Done - Added substance section manifest with editor/public/generator metadata and migrated table-of-contents presence checks through it; focused tests and typecheck pass.
2026-04-26 - contributors-reports-author-attribution-operation.md - Done - Added Convex author attribution operations, profile-key report targeting, contributor-aware report reads, and profile-save routing through attribution; focused tests and typecheck pass.
2026-04-26 - contributors-reports-trip-report-contract-module.md - Done - Added trip report validators, preview/detail/card adapters, and migrated reports/contributor card surfaces to explicit report card models; focused tests and typecheck pass.
2026-04-26 - convex-authz-write-intents.md - Done - Added Convex write-intent auth helpers, enforced editor writes on substance mutations, derived profile actor roles in Convex, and stopped trusting route-supplied roles; focused tests and typecheck pass.
2026-04-26 - convex-contributor-profile-identity-module.md - Done - Added shared contributor identity rules for key/email/alias normalization, materialization, public lookup, and Convex-side owned profile key resolution; focused tests and typecheck pass.
2026-04-26 - convex-schema-contract-depth.md - Done - Added shared substance article contract validation for Convex ingestion, kept storage permissive, documented the contract boundary, and fixed TypeScript narrowing in the focused contract test; focused tests and typecheck pass.
2026-04-26 - convex-substance-ingestion-module.md - Done - Added Convex-side substance ingestion for validation, ID/slug upsert resolution, slug collision skips, partial-success outcomes, affected paths, save-to-convex verification, and script logging; focused tests, typecheck, ESLint, and script syntax checks pass.
2026-04-26 - convex-substance-read-projections.md - Done - Added Convex substance read projections for lookup, preview, library/search input, public article, random preview, and editor article reads; public callers now avoid broad full-document reads where projections exist; focused tests and typecheck pass.
2026-04-26 - data-ops-artifact-lineage-manifest.md - Done - Added checked-in artifact lineage manifest, ignored sidecar run metadata, lineage helper/tests, hygiene warnings, and producer script sidecar emission; focused tests, hygiene check, and script syntax checks pass.
2026-04-26 - data-ops-migration-transform-workspace.md - Done - Added article migration transform workspace with source adapters, validation failures, skipped/changed/unchanged buckets, structured diffs, representative transforms, and routed citation-source migration through it; focused tests and dry-run planner check pass.
2026-04-26 - data-ops-run-context-and-target-policy.md - Done - Added shared data ops run context for repo root/env loading, Convex source-target precedence, dry-run/write mode, local artifact scope, destructive confirmations, and migrated Convex/migration/prepopulate scripts; focused tests, syntax checks, and confirmation smoke checks pass.
2026-04-26 - dev-page-controller-facades.md - Done - Split dev page orchestration into route access, changelog feed, chrome environment, and support-tab controller facades while preserving the page-facing controller interface; focused tests, typecheck, and targeted lint pass.
2026-04-26 - dev-profile-editor-model.md - Done - Added profile form, avatar upload, save adapter, and hook model layers so ProfileEditorTab renders against a deeper editor model; focused tests, typecheck, and targeted lint pass.
2026-04-26 - dev-save-operation-contract.md - Done - Added dev save draft/command contract and Convex/GitHub adapters, with save operation hook now mapping command lifecycle to notices, changelog entries, and mark-saved behavior; focused tests, typecheck, and targeted lint pass.
2026-04-26 - dev-schema-form-field-adapters.md - Done - Replaced SchemaField switch with a field adapter registry for schema/form conversions, object JSON draft validation, fallback behavior, and textarea error accessibility; focused tests, typecheck, and targeted lint pass.
2026-04-26 - dev-tag-editor-state-machine.md - Done - Added reducer-style tag editor state machine for selection repair, drafts, validation, mutation effects, registry snapshots, and diff copy/download effects; low-worker focused test, typecheck, and targeted lint pass.
2026-04-26 - discovery-graph-data-projection-module.md - Done - Added pure graph projection module for hierarchy, visible nodes/edges, stats, search targets, and substance expansion paths; graph hook now owns only React expansion state; focused tests, typecheck, and targeted lint pass.
2026-04-27 - discovery-library-content-builder-projection-depth.md - Done - Split buildLibrary into article normalization, taxonomy, manual index, and public facade projection modules while preserving LibraryData compatibility; focused tests, typecheck, and targeted lint pass.
2026-04-27 - discovery-route-category-taxonomy-module.md - Done - Added shared taxonomy module for route aliases, canonical route resolution, taxonomy key normalization, mechanism/effect qualifiers, manual category aliases, and public taxonomy route detail/path lookup; focused tests, typecheck, and targeted lint pass.
2026-04-27 - discovery-search-index-module.md - Done - Added explicit immutable SearchIndex with stable input projection/hash, ranking/query policy, metadata counts, and public search index caching by input hash; focused tests, typecheck, and targeted lint pass.
2026-04-27 - gap-replication-media-operations-workspace.md - Done - Added replication media workspace for scanning, filename parsing, slug/effect reconciliation, gallery-order planning, media change planning, placeholder detection, and Convex write adapters; focused tests, import check, and typecheck pass.
2026-04-27 - parsers-aggregation-policy-module.md - Done - Added parser aggregation policy module for array merges, chemistry, pharmacology priority, harm reduction, tolerance, narrative content, source coverage, and immutable TripSit combo enrichment; focused tests, typecheck, and no-ignore lint pass.
2026-04-27 - parsers-contract-fixture-harness.md - Done - Added SourceParser contract fixture harness covering shared parser invariants, representative parser fixtures, malformed structured sections, and documented current TODO contract gaps; focused parser contract test and typecheck pass.
2026-04-27 - parsers-parse-run-module.md - Done - Added parseSourceCorpus run module with catalog, parser registry, enrichment, persistence, and reporter adapters; parse-sources CLI is now a thin wrapper; focused tests, typecheck, and no-ignore lint pass.
2026-04-27 - parsers-source-identity-contract.md - Done - Added canonical parser source identity descriptors with aliases, display metadata, parseability states, synthetic source constants, registry resolution, and parse-run coverage handling; focused parser identity/parse-run/contract tests and typecheck pass.
2026-04-27 - prompts-drift-policy-module.md - Done - Added shared prompt drift inventory/classification for generator and section prompts, named safe policy differences, compare/migration adapters, tests, and runtime-data docs; focused drift/compare tests, migration dry-run, and Convex compare pass.
2026-04-27 - prompts-registry-key-contract.md - Done - Added shared prompt registry descriptors for generator/section identities, migrated prompt drift/migration/UI/save/batch callers to registry keys, and added key validation; focused registry/drift/compare/save-prompt tests, typecheck, and Convex-facing tsc pass.
2026-04-27 - prompts-runtime-source-and-editor-state.md - Done - Added shared prompt workspace state for generator and section prompt documents, moved prompt modal/context consumers onto it, preserved legacy generator GitHub save flow, and verified focused workspace/context tests, typecheck, and targeted lint.
2026-04-27 - public-data-read-interface-depth.md - Done - Added a public data read adapter/catalog for DoseWiki public read concepts, moved existing public data exports behind it, localized effect preview projection, and verified focused public data tests, typecheck, and targeted lint.
2026-04-27 - public-data-report-profile-projection.md - Done - Added pure report/profile projection for contributor collapse, alias matching, avatar/profile fallback, detail enrichment, and report sort policy; report helpers now share the projection and focused tests plus typecheck pass.
2026-04-27 - public-data-route-planning-module.md - Done - Added public route plan inventory for route families, params, sitemap paths, contributor encoding, class slugs, effect categories, and mechanism qualifier filtering; static params/sitemap now consume it and focused tests, typecheck, and lint pass.
2026-04-27 - public-data-site-metadata-url-seam.md - Done - Added public site identity for canonical paths, absolute URLs, route path construction, metadata, and sitemap entries; route planning/metadata/sitemap callers use it and focused public site/route plan tests plus typecheck pass.
2026-04-27 - public-routes-effect-article-section-model.md - Done - Added pure effect article section model for overview/analysis/style/replications/audio/commentary/related/sources/contributors, moved page rendering to prepared sections while preserving Suspense, and verified focused model/page/VCode tests, typecheck, and lint.
2026-04-27 - public-routes-taxonomy-detail-route-module.md - Done - Added descriptor-driven taxonomy route lifecycle module for metadata, detail fetch, missing/not-found behavior, static params, and presentation adapters across category/mechanism/class/effect-category routes; focused tests, typecheck, and lint pass.
2026-04-27 - public-routes-trip-report-index-module.md - Done - Added trip report domain module for preview normalization, grouping/sorting, substance matching, article visibility groups, and back-target derivation; index/article/detail callers consume it and focused tests, typecheck, and lint pass.
2026-04-27 - public-routes-view-model-adapters.md - Done - Added public route view-model adapters for reports/effects indexes and substance/effect articles, hiding reads, defaults, href policy, metadata sources, not-found nullable decisions, and server-section policy; focused view-model tests and typecheck pass.
2026-04-27 - runtime-config-auth-runtime-policy.md - Done - Added centralized auth runtime policy for Auth.js secret aliases/fallbacks, GitHub aliases, local legacy credential availability, preview/production restrictions, and provider mode; auth, middleware, sign-in UI, docs, focused auth tests, typecheck, and lint pass.
2026-04-27 - runtime-config-convex-target-capability.md - Done - Added Convex runtime target capability module for public read, editor browser read, privileged write, and auth membership targets with diagnostics; public env, server clients, write health, membership sync, editor health/dev config, docs, focused tests, typecheck, and lint pass.
2026-04-27 - runtime-config-env-contract-module.md - Done - Added report-only runtime env contract with local/preview/production profiles, typed public/server/auth/diagnostics accessors, preflight diagnostics, Next/env health integration, docs consistency coverage, focused tests, typecheck, and lint.
2026-04-27 - schema-article-projection-builders.md - Done - Added article projection module for normalized identity/taxonomy/routes/pharmacology/interactions/harm/citation/section availability and editor projection, adapted contentBuilder through it, and verified projection/builder tests plus typecheck.
2026-04-27 - schema-field-path-contract.md - Done - Added field path contract for parsing/normalization/template/indexed paths, route template conversion, safe get/set, and registry/override/section diagnostics; pathUtils and route fields delegate to it and focused schema/form tests, typecheck, and diff check pass.
2026-04-27 - schema-generation-policy-module.md - Done - Extracted schema generation policy for defaults, compatibility defaults, field traversal, expandable arrays, compound fields, field types, sections, and shard order; generator is now a filesystem adapter and policy tests, generate:schema, targeted tsc, and typecheck pass.
2026-04-27 - schema-registry-composition-module.md - Done - Added composed article field catalog for generated metadata, overrides, sections, field groups, route-dependent fields/sections, known paths, and non-enforcing diagnostics while preserving public entrypoints; schema tests and typecheck pass.
2026-04-27 - security-admin-key-intent-tokens.md - Done - Added admin intent token module with scoped env vars and legacy CONVEX_ADMIN_KEY compatibility, routed Convex auth/mutations and server write capability/routes through named intents, and verified focused auth/route tests plus typecheck.
2026-04-27 - security-diagnostics-disclosure-policy.md - Done - Added diagnostics disclosure policy for audience-specific redacted views, issue severity, key count/name rules, timestamps, and production availability; editor health/test-env routes use it and focused redaction/route tests plus typecheck pass.
2026-04-27 - security-public-egress-proxy-policy.md - Done - Added ProtestKit public egress proxy policy for CORS, input limits, host/path allowlisting, timeout, response byte/content-type limits, status mapping, cache/negative cache, and redacted errors; reagent route uses it and focused policy/route/reagent tests, typecheck, and lint pass.
2026-04-27 - seo-nav-public-href-intent-module.md - Done - Added public href intent module for substances/effects/categories/mechanisms/classifications/reports/contributors/search, kept viewToPath as AppView adapter, migrated safe callers, and verified href/routing tests plus typecheck.
2026-04-27 - seo-nav-status-redirect-policy-module.md - Done - Added status/redirect policy for legacy redirects, protected route targets, no-index/robots rules, status recovery links, and loading labels; App Router adapters consume it and focused policy tests plus typecheck pass.
2026-04-27 - states-dev-notice-lifecycle-module.md - Done - Added shared dev notice lifecycle for channels, statuses, operation IDs, auto-clear, sticky errors, stale completion suppression, debug metadata, and render props; migrated save/changelog/profile/tag/index-layout notices and focused dev tests plus typecheck pass.
2026-04-27 - states-public-route-outcome-contract.md - Done - Added typed public route outcomes for found/not-found/empty/filtered-empty/unavailable states, routed public adapters/pages through explicit outcomes while preserving 404/empty/unavailable behavior, expanded outcome tests, and verified focused route/view-model tests plus typecheck.
2026-04-27 - states-route-loading-skeleton-module.md - Done - Added route-family loading view models, shared route/section skeleton renderer, loading route adapters, section fallback reuse, and StateCard loading semantics; focused loading/status tests and typecheck pass.
2026-04-27 - test-types-js-declaration-contract.md - Done - Added JS/TS declaration contract tests for article normalization and GitHub helpers, declared active GitHub/logger JS helper interfaces, checked runtime export shapes, and verified focused helper tests plus typecheck.
2026-04-27 - test-types-vitest-environment-adapters.md - Done - Added explicit asset/browser/render test adapters with smoke coverage, migrated representative builder/search tests to named adapters, preserved global setup during additive rollout, and verified focused tests plus typecheck.
2026-04-27 - ui-system-route-chrome-module.md - Done - Added shared route chrome model for page titles, nav groups, hrefs, logo/footer policy, updated Header/Footer/RouteChrome adapters to consume it, and verified focused chrome/layout/routing tests plus typecheck.
2026-04-27 - ui-system-surface-primitives.md - Done - Added semantic Surface/InteractiveSurface/EmptyStateSurface primitives, adapted existing card/state/index/section wrappers, migrated representative public surfaces, and verified focused surface tests, typecheck, and diff check.
2026-04-27 - ui-system-theme-token-interface.md - Done - Added named theme token manifest, runtime theme constants/bootstrap builder, Tailwind dose aliases, warn-mode token audit, and verified focused theme/context tests, typecheck, and Tailwind config import smoke check.
2026-04-27 - workflow-generated-data-provenance.md - Done - Extended artifact lineage manifest/helper with generated-data inputs, wildcard outputs, command/docs verification, added provenance report command and docs, and verified provenance check plus node Vitest lineage tests.
2026-04-27 - workflow-hygiene-policy-module.md - Done - Extracted local artifact hygiene policy with classification, cleanup behavior, protection rules, and rationale, refactored cleanup script as filesystem adapter, added fixture policy tests, and verified hygiene check.
2026-04-27 - workflow-package-script-command-surface.md - Done - Added stable workflow command manifest, fixed stale package script targets, added package/docs command smoke tests, updated workflow docs toward npm scripts, and verified test:workflow plus batch extract dry-run.
2026-04-27 - workflow-script-docs-consistency.md - Done - Added reusable workflow docs consistency validators for documented package/direct commands, stable command inventory, and env var coverage; updated docs and verified expanded test:workflow suite.
2026-04-27 - workflow-tooling-test-coverage.md - Done - Added workflow test orchestrator and node Vitest config for active script tests, expanded CLI option coverage, added scoped script lint surface, documented workflow test/lint commands, and verified test:workflow plus warning-tolerant lint:scripts.
```
