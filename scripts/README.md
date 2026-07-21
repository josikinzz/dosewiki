# Scripts

Utility scripts for data processing, migrations, and batch operations.

Substance writes should go through `api.substanceIndex.saveSubstance` or
`api.substanceIndex.saveSubstances`. Those mutations adapt to the shared Convex
substance ingestion module and return `created`, `updated`, `skipped`, `errors`,
per-article `outcomes`, and `affectedPaths`; scripts should treat `errors` as
partial-success diagnostics instead of reconstructing ID/slug matching locally.

## Directory Structure

```
scripts/
├── batch/           # Batch AI generation and quote extraction
├── replications/    # Effect replication media management
├── migrate/         # Data migrations (Convex, schema changes)
├── prepopulate/     # Populate articles from parsed sources
├── citations/       # Claim-level citation drafts and evidence write workflows
├── seed/            # Seed initial Convex data (layouts, config)
├── analyze/         # Data analysis and gap detection
├── chemistry/       # Chemistry identifier provenance and map adapters
├── article-source-documents/ # Normalized article source document contract
├── convex/          # Convex import/export/sync utilities
├── build/           # Build-time scripts (compress, sitemap, prerender)
├── parsers/         # Source extraction parsers
├── data/            # Data utilities and exports
├── prompts/         # AI extraction prompt templates
├── util/            # Shared utilities
├── generate/        # Code generation
└── deprecated/      # Archived scripts; not part of active workflows
```

## Quick Reference

Prefer package commands for stable workflows. Pass script-specific arguments
after `--`; for example, `npm run batch:legality -- --dry-run`. The manifest at
`scripts/lib/workflow-command-surface.mjs` records each stable command's purpose,
required environment, script path, read/write targets, dry-run policy, Convex URL
policy, confirmation flag, and shared data-ops context requirement.
Direct `node scripts/...` invocations remain supported for low-level adapters and
existing operator shell history.

### Production write command boundary

Administrative and one-off production writers are harmless by default. A live
Convex write protected by the production write boundary requires all of:

```bash
--write
--confirm-write=<operation-name>
--expected-deployment=<deployment-fingerprint>
--target-url=https://<deployment-fingerprint>.convex.cloud
```

`TARGET_CONVEX_URL` may replace `--target-url`. Privileged writes intentionally
ignore `CONVEX_URL`, `VITE_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_URL` so a browser
or compatibility setting cannot silently select the write target. The deployment
fingerprint is the host prefix, such as `glad-minnow-656`.

Use an intent-specific `CONVEX_ADMIN_TOKEN_*` variable when one exists. The
legacy `CONVEX_ADMIN_KEY` remains a compatibility fallback until the scoped-token
migration is complete. Commands print target identity and arguments, never token
values. Always run the command once without `--write` and review its dry-run
output before repeating the exact operation with the full ceremony.

Loopback-only Convex development commands are a separate explicit branch. They
must opt into `allowLocalTarget` in code and still require both `--execute` and
`--write`; only `localhost`, `127.0.0.1`, and `::1` are accepted. Non-loopback
HTTP targets remain rejected, and production targets still require HTTPS plus
the deployment fingerprint ceremony.

This is the default for every active Convex writer, not only the examples below.
The machine-readable inventory is `scripts/lib/production-writer-inventory.mjs`:
it currently classifies 27 direct mutation files, 25 guarded indirect
entrypoints, and 21 fail-closed archived writers. An AST-backed workflow test
rescans active scripts for arbitrary-receiver or aliased `.mutation()` calls,
Convex CLI runs, and statically resolvable POST/PUT/PATCH/DELETE requests; a new
detected writer must be classified or carry a documented read-only exemption.
Runtime-generated commands or methods that cannot be resolved statically still
require manual inventory review. Commands
with an older operation-specific flag, such as `--confirm-citation-write`, keep
that flag and also require the common operation phrase and deployment fingerprint.

Prompt, contributor-profile, quote, article, citation, and replication writers
resolve their intent-specific `CONVEX_ADMIN_TOKEN_*` credential before falling
back to `CONVEX_ADMIN_KEY`. The fallback remains documented compatibility only;
tests verify that a configured scoped token always wins over the master key.

Workflow tooling has a separate fast test and lint surface from the app suite:

```bash
npm run test:workflow
npm run lint:scripts
```

`test:workflow` runs the command-surface `node:test` checks plus active
Vitest-backed script module tests under `scripts/**`, excluding
`scripts/deprecated/**`. `lint:scripts` covers active script libraries and
workflow adapters without adding those files to the default app lint command.

Stable package commands not shown in the examples below: `npm run merge:articles`,
`npm run generate:manifest`, `npm run generate:schema`,
`npm run parse:sources:verbose`, `npm run cleanup:metrics`,
`npm run features:reachability`, `npm run hygiene:check`,
`npm run hygiene:clean`, `npm run openchemlib:verify`, `npm run prompts:compare`, and `npm run scry:query`.

### Batch Generation

```bash
# Quote extraction (run first)
npm run batch:extract -- --category=legality --resume

# Section generation
npm run batch:summary -- --all --concurrency=2
npm run batch:legality -- --dry-run
npm run batch:harm-potential -- --substance=lsd
npm run batch:history-culture -- --all --concurrency=5
npm run batch:dosage-duration -- --limit=5

# Review-only single-section proposals (local immutable artifacts only)
npm run batch:proposal -- \
  --slug=2c-b \
  --section=summary \
  --source-url=https://source-deployment.convex.cloud \
  --target-url=https://target-deployment.convex.cloud
npm run batch:proposal -- \
  --slug=2c-b \
  --section=pharmacology \
  --source-url=https://source-deployment.convex.cloud \
  --target-url=https://target-deployment.convex.cloud

# Convex is the live write target. Refresh src/data/SubstanceIndex.json only as
# a separate derived export after reviewing the write target.
npm run convex:export

# Monitor progress
npm run batch:watch

# Fail if live public article prose contains extraction/process artifact language
npm run audit:public-prose-artifacts

# Fail if live public article prose uses named source attribution such as
# "TripSit notes" or "DrugBank lists"
npm run audit:public-prose-named-sources

# Fail proposed/generated rewrite files before applying them
node scripts/analyze/audit-public-prose-artifact-language.mjs --fail docs/audits/generated-section-plagiarism-proposals.json

# Fail proposed/generated rewrite files for named-source attribution only
node scripts/analyze/audit-public-prose-artifact-language.mjs --fail --named-sources docs/audits/generated-section-plagiarism-proposals.json

# Export OpenRouter-ready rewrite jobs from the dosage/duration note queue
npm run batch:dosage-duration:export
npm run batch:dosage-duration:export -- --article=2c-b

# Run the exported jobs through OpenRouter and write reviewable JSON results
export OPENROUTER_API_KEY="sk-or-..."
npm run batch:dosage-duration:run
npm run batch:dosage-duration:run -- --article=2c-b --verbose

# Review, then apply reviewed results to the local export and explicit Convex target
export TARGET_CONVEX_URL="https://glad-minnow-656.convex.cloud"
export CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE="<scoped-token>"
npm run batch:dosage-duration:apply -- --dry-run --article=2c-b
npm run batch:dosage-duration:apply -- \
  --article=2c-b \
  --write \
  --confirm-write=apply-dosage-duration-rewrites \
  --expected-deployment=glad-minnow-656
```

#### Review-only section proposal and later publication

`batch:proposal` is a deliberately separate lifecycle from the existing batch
writers. It requires exactly one slug, a supported adapter (`summary` or
`pharmacology`), an explicitly identified readable source deployment selected by
`--source-url`, `SOURCE_CONVEX_URL`, or `CONVEX_PUBLIC_READ_URL`, and an
**explicit** target baseline selected only by `--target-url` or
`TARGET_CONVEX_URL`. It reads the source article, complete live prompt record,
and source material; reads the target article as the before value; then writes
review artifacts locally. Summary keeps its quote-first/generic-source fallback.
Pharmacology requires the standard pharmacology source-excerpt record and reuses
the existing pharmacology prompt, message builder, parser, and OpenRouter adapter.
It rejects `--write`, has no confirmation flag, and gives adapters only a frozen
query facade plus an allowlisted read API (no mutation method or mutation
references). It never falls back to `CONVEX_URL`, `VITE_CONVEX_URL`, or
`NEXT_PUBLIC_CONVEX_URL` for proposal source or target identity.

Artifacts are immutable/digest-linked under:

```text
notes-and-plans/exports/batch-proposals/
  <slug>/<summary|pharmacology>/<timestamp>-<manifest-digest>/
    target-manifest.json
    openrouter-response.txt
    proposal.json
    proposal.md
```

The manifest is created exclusively and made read-only before OpenRouter runs.
It captures source/target deployment identity, exact source and target records,
prompt and excerpt bytes, messages and generation settings, and presence-aware
target hashes. The raw response, JSON proposal, and Markdown review are also
made read-only. `proposal.json` records the full target/proposed articles,
target deployment fingerprint, response hash, section and whole-article hashes,
atomic-array recursive JSON-pointer diff, and a reviewed-artifact digest binding
those publication inputs to the manifest and response. Only `[]` or the selected
single top-level section is accepted. In particular, pharmacology proposals may
change only `pharmacology`; carrying route data into `dosage` or `duration`, or
changing any unrelated field, produces a rejected proposal. Pharmacology's CAS
hash still binds `pharmacology`, `dosage`, and `duration` so later review cannot
silently cross a stale owned-field baseline. Contract validation rejects normalization
of every field being patched; unchanged CAS companion fields are never normalized or
written, even when legacy data would be normalized on a full-article save. Generated content is never allowed to
introduce, remove, or replace citation markers: model-produced markers are stripped,
and target markers are retained at their best-matching generated sentence. A structured
proposal fails closed if it drops, changes the type of, or changes the array cardinality
of a citation-bearing leaf; resolve such a change through the dedicated citation workflow.

Publication is intentionally separate from generation and accepts exactly one
immutable `proposal.json` at a time. The reviewed sequence is:

1. Generate the local proposal with `batch:proposal`; do not add `--write`.
2. Review `target-manifest.json`, `proposal.md`, the raw response, every diff,
   deployment fingerprints, and confirm the guard status is `ready_for_review`.
3. Run the publisher once without `--write`; it rechecks the immutable manifest,
   raw response, artifact digest, target identity, and current live article.
4. A registered editor explicitly approves the exact digest by supplying their
   identity, UTC review time, and `--approve-artifact=<artifactDigest>`. The
   command constructs the transient approval envelope; it never changes the
   immutable review artifact.
5. Re-run with `--write --confirm-reviewed-publication`, the standard
   `--confirm-write=publish-reviewed-section` and `--expected-deployment` pair,
   plus `CONVEX_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE`. The target Convex
   deployment must set `GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT` to its
   exact fingerprint. The legacy admin key is rejected.
6. The mutation verifies proposal/base/proposed slug identity, deployment
   binding, and the manifest/response/proposal artifact digest before
   recomputing the owned-section hash transactionally. Stale owned content
   returns `conflict` with no write; an unrelated section edit survives; a
   successful write patches only the proposal's approved section and records the
   idempotency/audit row. The CLI then re-reads the article and verifies every
   approved field before reporting success.

```bash
# Review-only target preflight
npm run batch:publish-reviewed-section -- \
  --proposal=notes-and-plans/exports/batch-proposals/2c-b/summary/<run>/proposal.json \
  --target-url=https://glad-minnow-656.convex.cloud \
  --dry-run

# Publish one explicitly approved artifact
npm run batch:publish-reviewed-section -- \
  --proposal=notes-and-plans/exports/batch-proposals/2c-b/summary/<run>/proposal.json \
  --target-url=https://glad-minnow-656.convex.cloud \
  --actor-email=<registered-editor-email> \
  --reviewed-by="<reviewer>" \
  --reviewed-at=<UTC-ISO-8601> \
  --approve-artifact=<artifact-digest> \
  --write --confirm-reviewed-publication \
  --confirm-write=publish-reviewed-section \
  --expected-deployment=glad-minnow-656
```

**2C-B summary canary procedure:** use the reviewed `2c-b` summary proposal
first. Confirm its before summary is the target value and its only changed
field is `summary`; dry-run, approve, and publish it once. Verify the operation
audit row, re-read `2c-b`, confirm its summary matches the approved proposal,
and confirm editorial/citation metadata and every unrelated section are
unchanged. Stop on a stale-hash conflict or any unexpected diff—never retry via
`saveSubstance` or full-article replacement. Only then publish the remaining
reviewed sections in small, individually verified batches.

### Formal citations

Stable citation command policy is owned by
`scripts/lib/citation-command-surface.mjs` and surfaced through
`scripts/lib/workflow-command-surface.mjs`. Keep citation command names,
environment requirements, Convex access policy, dry-run/write gates, and
confirmation flags there first; this section is the operator-facing catalog.

```bash
npm run citations:formal -- --slug=2c-b --dry-run
npm run citations:formal -- --slug=2c-b --write --confirm-citation-write \
  --confirm-write=formal-claim-level-citations --expected-deployment=glad-minnow-656
npm run citations:archive-production-dataset -- --label=pre-2c-b-citation-rollout
npm run citations:campaign -- init --campaign notes-and-plans/citation-campaigns/pilot.json --target 2c-b:summary,pharmacology --model openai-codex/gpt-5.6-terra --tier terra-medium
npm run citations:campaign -- status --campaign notes-and-plans/citation-campaigns/pilot.json
npm run citations:run-local-campaign -- --slug=2c-b --source-url=https://glad-minnow-656.convex.cloud --dry-run
npm run citations:review-dossier -- --output=outputs/citation-draft-review.html
npm run citations:plan-second-pass -- --audit=tmp/subsection-citation-audit.json
npm run citations:audit-second-pass-campaign
npm run citations:export-workbench-task -- --slug=2c-b --dry-run
npm run citations:export-workbench-task -- --slug=2c-b --overwrite
npm run citations:rebase-workbench -- --slug=2c-b
npm run citations:audit-subsections
npm run citations:seed-subsection-tracker -- --dry-run
npm run citations:seed-subsection-tracker
npm run citations:update-subsection-status -- --slug=3-me-pcpy --section=pharmacology --status=researching --run-id=3-me-pcpy
node .pi/skills/pi-citation-workflow/scripts/prepare-local-proposal-run.mjs \
  --proposal notes-and-plans/exports/batch-proposals/<slug>/<section>/<artifact>/proposal.json
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=2c-b --dry-run \
  --expected-deployment=glad-minnow-656
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=2c-b --write --confirm-citation-write \
  --confirm-write=apply-citation-workbench-draft --expected-deployment=glad-minnow-656
```

The formal citation pilot reads the article, article source documents, and existing
citation evidence from Convex. Dry-run output shows proposed `[cite:stable-id]`
tokens, structured `reference_ids`, reference entries, evidence rows, and review
gaps. Writes use the shared data-ops target/confirmation flow and preserve
approved evidence unless `--refresh-approved` or `--replace-approved` is passed.
It requires `OPENROUTER_API_KEY`, a Convex source URL, and citation evidence
review credentials (`CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW` or
`CONVEX_ADMIN_KEY`); writes also require a Convex target URL and
`CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE` or `CONVEX_ADMIN_KEY`.

`citations:export-workbench-task` exports the current Convex article into the
external workbench's `inputs/<slug>-full.json` marker-only task shape. Use it
before reruns that need to apply back to Convex, so text-safety validation
compares against the exact live article surface. The export path can include a
local PsychonautWiki cache, and the workbench `fresh-run`/`new-run` paths attach
local discovery caches from `source-cache/wikipedia/` and
`source-cache/psychonautwiki/` when present. These caches are never public
support by themselves. Wikipedia cache excerpts are for section-worker discovery
only. The final `article-wide-input.json` should contain dose.wiki citable
sections plus prior references/evidence, not full Wikipedia articles or
Wikipedia article excerpts.

`citations:rebase-workbench` reads the current article from the configured
source Convex deployment and transplants only still-text-identical citation
markers from the local workbench draft into a new local rebased draft. It never
publishes content; changed fields are dropped and recorded in its rebase report.

`citations:audit-subsections` is a read-only live-production audit of the
public category-layout scope across all six canonical citable sections
(including `tolerance`). For every `slug + section` it records non-marker
character count, inline marker count, content hash, coverage form
(`inline` / `legacy_bibliography` / `uncited`), a 40-character viability flag,
citationEvidence status counts (when `CONVEX_ADMIN_KEY` is available), and the
slug-level workbench queue status. It tags the first subsection-rollout cohort
(the changed pharmacology slugs from the final regeneration audit artifact,
`--cohort-audit`). Output defaults to `tmp/subsection-citation-audit.json`.

`citations:seed-subsection-tracker` merges that ledger into the dedicated
subsection rollout tracker (default
`~/.codex/dosewiki-citation-workbench/trackers/subsection-rollout.json`), with
one row per viable uncited cohort `slug + section`. Rows carry frozen
`originalContentHash` values for drift detection; reseeds preserve row
statuses, flag live drift, and report rows that are no longer gaps without
rewriting them. The slug-level citation queue is never modified.

`citations:update-subsection-status` transitions one tracker row
(`--slug`/`--section`/`--status`, optional `--run-id`) through the rollout
state machine (`ready` → `researching` → `needs_source`/`needs_review` →
`applied` → `verified`) with an auditable timestamp. Use `--all-slugs` instead
of `--slug` for a section-wide policy transition. The `excluded` status requires
`--reason` and keeps intentionally out-of-scope rows out of tracker-scoped
exports. It is local tracker bookkeeping only and supports `--dry-run`.

`citations:campaign` is a compact, read-only campaign dashboard around existing
Pi run artifacts. Its create-once campaign manifest locks the approved slug/section
scope plus requested model and tier. `status` derives deterministic
`pending`/`running`/`needs_review`/`blocked`/`superseded` state, attempt IDs,
linked-rerun guidance, and marker/gap coverage from immutable `pi-run-manifest.json`
and `citation-draft.json` files. It never starts workers, calls OpenRouter,
modifies artifacts, applies a draft, writes Convex, or publishes content. Run
manifests record resolved worker models but not requested tiers, so model-pin
mismatches block a report while tier fidelity remains an explicit operator check.

`citations:run-local-campaign` is the official sequential execution driver for an
approved local-only subsection scope. It requires an explicit read-only
`--source-url`, strips `TARGET_CONVEX_URL` and `VITE_CONVEX_URL` from child
processes, rejects apply/write/confirmation arguments, and never imports the
promotion adapter. It considers a run successful only when its immutable Pi
manifest is finalized at `needs_review`; process exit code alone is never success.
Existing partial runs are inspected stage-by-stage, accepted hash-matching section
artifacts are preserved, and only the first incomplete reconciliation,
article-wide, downstream, or finalization stage is resumed. `--dry-run` records a
plan without launching Pi or changing tracker state. Pass
`--second-pass-plan=outputs/citation-second-pass-research-plan.json` to seed and
use the independent `second-pass-rollout.json` tracker, protected
`<slug>-second-pass-1` run IDs, and immutable task research briefs. Blocked runs
remain `researching` so process failure can never masquerade as review readiness.

`citations:review-dossier` deterministically rebuilds the standalone offline HTML
review surface from the subsection tracker plus tracker-bound finalized run
artifacts. It fails closed when an actionable row lacks a finalized manifest or
draft, scopes prose/evidence/gaps/references/sources by subsection, and embeds all
data into one network-independent file. The tracked HTML template lives at
`scripts/citations/citation-review-dossier.template.html`; generated dossiers
belong under `outputs/` and are review artifacts, not application runtime source.

`citations:plan-second-pass` converts a refreshed public subsection audit into an
immutable, scored second-pass research plan. It excludes tolerance and
Deschloroketamine by policy, separates obvious/strong/exploratory/sparse targets,
and writes ordered section-specific research lanes plus fail-closed completion
criteria. It does not research or publish. To prepare one planned run, export with
`--second-pass-plan=<plan.json> [--second-pass-max-wave=1|2|3]`; the task freezes
`researchPass: "second"` and `researchBrief`, which workers must follow and log
lane by lane. Use a protected successor run ID such as `<slug>-second-pass-1`.

`citations:audit-second-pass-campaign` is the fail-closed completion gate for the
local second pass. It matches the plan to the independent tracker, requires every
actionable slug to bind to one finalized second-pass manifest and draft, checks
scope and terminal gates, distinguishes marker-bearing `needs_review` rows from
confirmed `needs_source` rows, preserves sparse deferrals, and requires campaign
state to record `productionWrites: false`. It writes the final machine audit and
Markdown summary under `outputs/`.

The local-proposal preparation command creates a unique, permanently local run
from exactly one immutable `proposal.json`. Only `proposal.after.value` is
citable; the other five citable sections are `null`. Preparation revalidates all
proposal/manifest/raw-response bindings, copies those inputs read-only, rejects
write/confirmation/queue/apply flags, and never calls `fresh-run`, OpenRouter,
Convex, or tracker scripts. The resulting draft remains `needs_review` with
promotion forbidden and `articlePatches: []`.

`citations:apply-workbench` adapts a completed external citation workbench
`citation-draft.json` to the current site article schema, then writes through
the same Convex `citationEvidence.applyDraft` mutation. It is intentionally
narrow: use it for reviewed workbench output, not for generating new citations.
It supports dry-run review. Both dry-run and write mode require an explicit
`TARGET_CONVEX_URL` plus matching `--expected-deployment`; browser/default URL
fallbacks are rejected. Write mode additionally requires
`--write --confirm-citation-write`, the shared `--confirm-write` phrase, and the
citation evidence write token. It rejects local-proposal, non-apply-bound, and explicitly non-promotable drafts
before resolving a Convex target, creating a client, or reading a live article.
The queue itself lives outside this repo at
`/Users/josie/.codex/dosewiki-citation-workbench`; Codex should run that queue
with `/cite <drug-slug>` in the workbench browser terminal, then bring only
reviewed drafts back through this apply script.
Before a workbench run is considered reviewed, confirm the six citable section
status table covers `summary`, `pharmacology`, `tolerance`, `harm_potential`,
`history_culture`, and `legality`; Claude should have launched section workers
in batches of at most 3 and verified worker labels against that section set.
Existing outputs should pass worker-output checks; missing outputs are warnings
only when the original section is preserved exactly and no public markers are
added there. Before `article-wide:packet`, run
`node /Users/josie/.codex/dosewiki-citation-workbench/scripts/remap-section-reference-ids.mjs --run runs/<slug>`
and, when it reports remaps, rerun with `--write`; then run
`node /Users/josie/.codex/dosewiki-citation-workbench/scripts/proactive-scan.mjs --run runs/<slug>`
and repair until clean.
Repair quote fidelity failures, ellipses, discovery-only support, public markers
without supported evidence, marker path mismatches, evidence rows missing
`status`, marker/evidence mismatches, duplicate generic source IDs, and shape
changes before final validation handoff. If accepted section work exists, a
156-byte stub, empty article-wide output, markers with zero references/evidence,
or marker/evidence mismatch is a failed pass, not a valid no-op. Same-site
source IDs should be page-specific enough to avoid merge collisions; DailyMed
labels need setid, label name, or a similar suffix.
The target Convex deployment must already include the structured `references`
article field and the `citationEvidence` functions; run `npx convex dev --once`
against that deployment before writing if those functions are missing.

For production rollout, first archive the current public dataset with
`citations:archive-production-dataset`, then apply reviewed workbench drafts one
slug at a time. The production canary and common-drug batch gates are documented
in `docs/citation-production-rollout.md`.

Legacy citation-array maintenance is no longer a supported migration path once an
article has structured `references` or route-level `reference_ids`. The following
scripts now fail closed with retirement notices:

- `scripts/data/syncArticleCitations.mjs`
- `scripts/migrate/migrate-citations-convex.mjs`
- `scripts/migrate/migrate-citations-to-sources.mjs`

`scripts/prepopulate/prepopulate-source-citations.mjs` remains compatibility-only:
it can refresh leftover `source_citations`, but it now fails closed if any
article already has structured `references` or route-level `reference_ids`.
It is not a replacement for the formal citations workflow and should not be
used to author structured references.

### Legality research

```bash
npm run legality:export -- --slug=<slug>
npm run legality:validate -- --run runs/legality/<slug>
npm run legality:apply -- --slug=<slug> --dry-run
npm run legality:apply -- --slug=<slug> --write --confirm-legality-write \
  --confirm-write=apply-legality-research-draft --expected-deployment=glad-minnow-656
```

`legality:export` creates a Convex-backed packet for one run; validate every
reviewed `legality-draft.json` before applying it. Apply defaults to a readable
dry-run, and its write path uses the editor article-write token plus the explicit
confirmation flag. Drafts may include `enrichments` for existing country entries;
these add or update only `canonicalStatus` and `instrument`, preserving the live
status and notes.

### Replications

```bash
# Scan and import workflow
node scripts/replications/scan-replications.mjs
node scripts/replications/assign-image-effects.mjs
node scripts/replications/enrich-rights-metadata.mjs
node scripts/replications/upload-replications.mjs --only-missing
node scripts/replications/backfill-rights-metadata.mjs --dry-run
node scripts/replications/backfill-rights-metadata.mjs \
  --write --confirm-write=backfill-replication-rights \
  --expected-deployment=glad-minnow-656
node scripts/replications/create-gallery-order.mjs --dry-run
node scripts/replications/create-gallery-order.mjs \
  --write --confirm-write=create-replication-gallery-order \
  --expected-deployment=glad-minnow-656
```

Replication media scan, reconciliation, gallery-order planning, and Convex write adapters live in `scripts/replications/lib/workspace.mjs`. Keep script CLIs thin and move shared media rules there before adding new one-off replication operations.
Replication media rights metadata is creator-retained by default. Run
`enrich-rights-metadata.mjs` after scanning to fill creator, source, and credit
fields from the local Effect Index dump when available, then run
`backfill-rights-metadata.mjs --dry-run` before writing rights metadata to live
Convex records.

### Migrations

```bash
# Convex migrations
npm run migrate:trip-reports
npm run migrate:effects
npm run prompts:migrate
node scripts/migrate/migrate-substance-index-to-convex.mjs

# Pharmacology normalization: review first, then use the exact target ceremony
node scripts/migrate/migrate-pharmacology-schema.mjs \
  --source-url=https://glad-minnow-656.convex.cloud --dry-run
node scripts/migrate/migrate-pharmacology-schema.mjs \
  --target-url=https://glad-minnow-656.convex.cloud \
  --write \
  --confirm-write=migrate-pharmacology-schema \
  --expected-deployment=glad-minnow-656
```

Article-shaped migrations should put selection and field policy behind
`scripts/migrate/data-ops/transform-workspace.mjs` and keep filesystem, Convex,
and dry-run persistence in the calling script. Transform adapters live in
`scripts/migrate/data-ops/article-transforms.mjs`; they return a migration plan
with changed, unchanged, skipped, warning, validation failure, and structured diff
summary records before anything writes data.

Data operation scripts in `scripts/convex/`, `scripts/migrate/`, and
`scripts/prepopulate/` should resolve repo root, `.env.local`, Convex source and
target URLs, dry-run mode, local artifact scope, and destructive confirmation
through `scripts/lib/data-ops-run-context.mjs`. Production sync requires
`--confirm-production-sync`, cross-deployment trip report copy requires
`--confirm-cross-deployment-copy`, and replace-all SubstanceIndex import requires
`--confirm-replace`.

Production sync resolves credentials only for authenticated tables selected by
`--tables`. `substanceIndex` and `siteConfig` prefer the editor article-write
token, `prompts` prefers the prompt-migration token, and `quotes` prefers the
quote-migration token. Tables whose current Convex mutation still uses the
legacy-admin intent require the master key compatibility fallback. The aggregate
production-sync token is not substituted for a different backend intent.

### Prepopulate from Sources

```bash
npm run parse:sources  # Generate parsed-sources.json first
npm run prepopulate:high-confidence -- --dry-run
npm run prepopulate:dosage-duration -- --dry-run
npm run prepopulate:interactions-tripsit
npm run prepopulate:legality
```

Article source readers, migrations, and batch prompts should load documents through
`scripts/article-source-documents/contract.mjs` so source metadata ids and content
keys are validated before import or prompt construction.

### Data Artifact Lineage

Local data artifact roles, producers, consumers, edit policy, and refresh commands
are recorded in `src/data/artifactLineageManifest.json`. Scripts that rewrite
tracked artifacts should call `scripts/lib/data-artifact-lineage.mjs` after the
write; volatile command, timestamp, deployment label, schema, and hash metadata is
emitted to ignored sidecars under `src/data/.lineage/`.

Run `npm run provenance:check` for the non-blocking generated-data provenance
report. It checks manifest shape, producer commands, listed output paths, and
whether generated data artifacts named in `README.md`, `AGENTS.md`, or this file
are represented in the manifest. It also reports tracked files under
`notes-and-plans/exports/` and fails strict verification when a tracked generated
export lacks retention metadata.

### Chemistry Identifier Maps

```bash
npm run generate:smiles -- --dry-run
```

`generateSmilesMap.mjs` reads article IUPAC names from the local backup/export data and writes the OPSIN SMILES artifact through the chemistry identifier adapter at `src/data/mappings/iupacSmilesMap.json`.

### OpenChemLib fork maintenance

```bash
# Fast, deterministic check used by normal app verification.
npm run openchemlib:verify

# Maintainer-only rebuild; requires JDK 21 and GWT 2.13.0.
JAVA_HOME=/path/to/jdk-21 GWT_HOME=/path/to/gwt-2.13.0 npm run openchemlib:build
```

The verifier checks local dependency resolution, rejects nested Git metadata, and compares the fork's source and committed browser artifacts with its deterministic manifest. The build regenerates minified/debug bundles, types, resources, and the manifest. Normal application builds never invoke Java/GWT. See `docs/architecture/openchemlib-fork.md` before changing the fork; do not hand-edit its distribution files.

### Convex Operations

```bash
npm run convex:export
npm run convex:migrate-user-profiles -- --dry-run
npm run convex:migrate-user-profiles -- --email-map=tmp/profile-email-map.json
export SOURCE_CONVEX_URL="https://<source-deployment>.convex.cloud"
export TARGET_CONVEX_URL="https://glad-minnow-656.convex.cloud"
npm run convex:sync-production -- \
  --tables=prompts,quotes \
  --write \
  --confirm-production-sync \
  --confirm-write=sync-convex-data-to-production \
  --expected-deployment=glad-minnow-656
```

### Analysis

```bash
node scripts/analyze/analyze-source-coverage.ts
node scripts/analyze/check-priority-substances.mjs
node scripts/analyze/find-missing-routes.mjs
```

### Scry source research

```bash
export SCRY_API_KEY="..."
npm run scry:query -- --sql="SELECT title, source, score FROM scry.entities ORDER BY score DESC LIMIT 5"
npm run scry:query -- --file=query.sql --budget=0.05
```

`scry:query` sends read-only SQL to `https://api.scry.io/v1/scry/query` with
`Authorization: Bearer $SCRY_API_KEY`. Use `--budget` to send Scry's optional
`X-Scry-Budget` cap.

## Environment Variables

Most scripts require:

```bash
export VITE_CONVEX_URL="https://..."           # Default Convex deployment URL
export TARGET_CONVEX_URL="https://..."         # Explicit write/sync target
export CONVEX_PUBLIC_READ_URL="https://..."    # Public App Router server-read mirror
export CONVEX_ADMIN_KEY="..."                  # Protected Convex writes
export CONVEX_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE="..." # Reviewed section CAS publication
export GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT="target-deployment" # Server-side replay boundary
export OPENROUTER_API_KEY="sk-or-..."          # OpenRouter-backed batch generation
export SCRY_API_KEY="..."                      # Scry read-only public corpus queries
```

Batch generation and quote extraction scripts use the shared OpenRouter SDK helper at `scripts/lib/openrouter-sdk.mjs`.
Quote section identity, aliases, extraction categories, local quote paths, and Convex section IDs are owned by `lib/quoteSections.mjs`; update that contract before adding or renaming quote-backed sections.

## Output Locations

Generated artifacts are written to `notes-and-plans/exports/`. New run output is
ignored by default; retained tracked exports require role, owner, freshness,
retention, and review-date metadata in
`scripts/lib/local-artifact-hygiene-policy.mjs`.

- `batch/` - Cost tracking and progress files
- `openrouter/` - Prompt payloads and NDJSON rewrite jobs
- `openrouter/results/` - Reviewable rewrite responses, progress, and summaries
- `replications/` - Replication metadata and gallery mappings

## Root-Level Scripts

A few utility scripts remain at the scripts root:

- `parse-sources.ts` - Main source parsing entrypoint
- `set-priority.mjs` - Set article priority levels
- `remove-contributor.mjs` - Remove contributor from articles

## Convex Admin CLI

The generic admin adapter no longer contains hard-coded deployment URLs and does
not accept credentials in JSON arguments. Queries require `--source-url` (or
`SOURCE_CONVEX_URL`). Mutations default to a plan-only dry run and use a
function-specific operation phrase:

```bash
node scripts/admin/convex-admin.mjs tripReports:deleteById '{"id":"example"}' \
  --target-url=https://glad-minnow-656.convex.cloud

node scripts/admin/convex-admin.mjs tripReports:deleteById '{"id":"example"}' \
  --target-url=https://glad-minnow-656.convex.cloud \
  --write \
  --confirm-write=convex-admin-tripreports-deletebyid \
  --expected-deployment=glad-minnow-656
```

Known function namespaces automatically select the narrowest available scoped
credential intent. Use `--intent=<intent>` only when a new function namespace
has a reviewed scoped intent that the adapter does not yet recognize.

## Archived Scripts

The `scripts/deprecated/` directory is an archive boundary for retired one-off utilities and superseded migration helpers.

- Deprecated scripts are fail-closed wrappers only; they must not contain direct writes, Convex clients, network writes, or local artifact mutation code.
- Do not use these scripts for current workflows without first restoring the historical body from git history and re-validating it in an active scripts directory.
- Active maintenance and cleanup work should prioritize the directories above, not `scripts/deprecated/`.
- See [`scripts/deprecated/README.md`](./deprecated/README.md) for the archive inventory and rationale.
