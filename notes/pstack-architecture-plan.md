# Agent-friendly architecture plan

Status: proposed for Josie's review. Plan only. Owner: Josie, with implementation ownership assigned per slice below.

Baseline: `8c8950b8ce385e88d33927b319530623b3987a02` on `pstack/architecture-plan`, inspected on 2026-10-15. No application changes, production access, merge, push, or deployment are part of this work.

## Recommendation

Deepen the existing owners in place. Start by closing the revision and retry gap in admin batch article publication. Then make exit actions explicit, separate pure contracts from framework adapters, and narrow read and UI entry points. A repository-wide package migration has more moving parts than the evidence warrants.

For readers, the intended benefit is that an older editor session cannot overwrite newer published article content. For editors, refusal and uncertain-save states preserve their work. For agents, the intended benefit is one supported entry point for each operation, with fewer conventions that must be remembered across files.

These are proposed benefits. No implementation, agent-efficiency evaluation, production performance measurement, or deployed acceptance was performed.

## Evidence and counting method

The baseline has 1,942 reachable commits and 4,944 tracked files. The investigation screened the latest 250 non-merge commit subjects, from `eb21979f0` through the baseline, dated 2026-09-23 through 2026-10-14. It selected 74 corrective or consolidation commits for patch inspection. Appendix A names every counted commit.

The selection includes repairs to existing behavior and consolidation of repeated recipes. It excludes merges, feature-only additions, standalone decision logs, bulk catalog regeneration after the privacy scrub, and size-budget bookkeeping. Mixed commits receive one primary class. Follow-up commits count separately. Counts therefore measure corrective work in this reviewed sample, not distinct bugs, incidents, affected files, or all failures in the repository. The other 176 commits are outside the counted sample, not proven defect-free.

This is a purposive sample, strongly influenced by the recent editor redesign. The rankings below are the five recurring classes in that sample. They are not an exhaustive historical frequency ranking. AI coauthor trailers occur in 224 of 250 window commits (89.6%) and 63 of 74 sample commits (85.1%). They provide no evidence that agents disproportionately introduced these failures. Seventeen of the 25 UI-class commits belong to one Dev tools redesign campaign. The sample records no stale batch overwrite incident; that priority comes from the source and follow-up handler experiment, not incident frequency.

| Frequency rank | Pitfall class | Corrective commits | Representative evidence | Existing prevention to preserve |
| --- | --- | ---: | --- | --- |
| 1 | UI recipes and vocabulary drift | 25 | `71dbd43c5`, `38d09e0ff`, `7cf73d64f` | Semantic tokens, shared editor primitives, `devTabRegistry` |
| 2 | Draft and decision state leaks | 14 | `535619fd3`, `f979d0e9b`, `59d7a123b` | Unsaved-work guard, article lifecycle, recovery copies, three-way merge |
| 3 | Content integrity and authority | 13 | `386aa2185`, `4fa54a309`, `f9c39a2d4` | Stored-content review revisions, actor checks, guarded commands, reference identity |
| 4 | Artifact and execution boundary drift | 12 | `76076eb3a`, `aa2d0d60a`, `15b25e235` | Compiled public/editor isolation, artifact owner, release audit |
| 5 | Read contracts, freshness, and excess work | 10 | `458037547`, `91a6838af`, `de808467a` | Compact projections, bounded pagination, target-scoped cache, explicit read failures |

The latest policy is a design constraint. `20293c8f7` removes broad UI, wiring, and source-text tests. `6b706b4a8` removes whole-site cleanup metrics, knip, and duplicate API lint from CI because they blocked small changes. This plan does not restore those gates or file-size budgets.

## Current architecture and why it exists

Public routes call `lib/next/` loaders, then `lib/data/` projections and the `publicData.readCatalog.ts` adapter. Registered `server/` handlers execute in-process through `lib/postgres/runtime/`. Queries run read-only transactions. Mutations run serializable transactions with bounded transient retries. Generic document queries can still filter in JavaScript, while selected public readers use compact SQL.

`publicData.cache.ts` already owns target identity digests, cache bounds, and selected `awaitRefresh` barriers. `publicLibrary.ts` adds derived library and search caching. Publication invalidation belongs to the existing outbox and signed cross-project delivery. Source changes, accepted invalidation, and observed served revisions are different facts. A second cache framework or retry queue would split ownership again.

Editor writes pass the origin, rate, session-role, and capability checks in `protectedRouteOperation.ts`, then database-backed role checks in handlers. Article lifecycle changes and proposal approval carry revision information. Recovery copies belong to an account, tool, record, and baseline. They are recovery aids, never runtime truth. `threeWayMerge.ts` produces a draft and leaves the final revision check to the save.

The important exception is admin batch article publication. `src/features/dev/pages/devSaveCommand.ts` attaches `expected` and `expectedRevision` to layouts, but not to articles. `/api/save-article` calls `server/saveArticleBatch.ts`, which passes article documents to `saveSubstancesHandler` and `ingestSubstanceArticles`. That path has no client article-baseline parameter or article operation identity. Ingestion patches the current row with the supplied fields after validation and identity resolution. It does not append an `articleRevisions` row. The batch does have a transaction and can add a changelog entry. Those controls do not detect a draft loaded before a separately committed change.

The follow-up reproduces the stale overwrite through real ingestion handlers and the unchanged `PostgresClient` SERIALIZABLE executor against in-memory PGlite after applying all 28 SQL migrations. Two separately loaded drafts both report an update, and the later stale draft restores the old summary. The real lifecycle rejects that stale baseline. The pool adapter replaces transport only. This establishes a sequential stale-draft defect, not multi-connection race behavior or production state.

History explains why the distinction matters. `386aa2185` changed review staleness to hash stored content because several writers bypassed the article revision journal. Keep that content-derived review revision even after consolidating writes. The journal is not a complete substitute for stored-content identity.

Build identity already has one owner in `scripts/build/build-surface.mjs`. Public, editor, and Effect Index remain separate compiled artifacts. `public-editor-boundary.mjs` rejects editorial browser imports, and `editor-artifact-audit.mjs` inspects emitted artifacts. `76076eb3a` nevertheless shows that a pure classifier imported from a hook module can break a server build. `aa2d0d60a` shows that a broad upload exclusion can remove maintained source.

## Prototype results

Follow-up experiments ran only on synthetic data and throwaway code in this worktree. All four new delegates used Codex GPT-6.1-Sol. The selected design is now in-place article publication and explicit resource intents, pure tag extraction, one compact SQL reader, and heading-only UI consolidation. No application implementation or live-data acceptance is claimed.

| Prototype family | Executed result | Decision |
| --- | --- | --- |
| Article transactions | 16/16 scratch experiments passed. Real batch overwrite reproduced after 28 migrations. Exact replay, five changed-request refusals, four injected rollbacks, unchanged-article/layout compatibility, create collisions and receipt-key uniqueness exercised. | Load stored `baseHash`; use actor-scoped semantic batch receipts and existing layout identities. Preserve no-op and history behavior. |
| Exit and HTTP | 40/40 scratch Vitest cases passed. Combined route patch answers freeze 503; wrapper-only still answers 500. A 26-command model has 19 refusals with zero effects. | Mandatory resource intent in the owning handler, plus a strict batch success parser. |
| Exit types | Positive TypeScript compile exits 0; four illegal inputs produce five diagnostics, expected exit 2. A legally typed mislabeled callback executes one modeled live write. | Types clarify intent but do not certify effects. Preserve server enforcement. |
| Compiler and artifacts | 20/20 commands match expected exits. Tag extraction preserves 53 output comparisons. Existing loader matches 11 fixtures; actual Vercel source selector reproduces old omission and fixed retention. | Pure owners and narrow import lint; no package, root or upload migration. |
| Reader behavior | 23 observations, zero unexpected failures. Native taxonomy return validation rejects three malformed variants; generic `Server Error` is currently converted to empty taxonomy. | Keep existing validators and row filtering; remove the error-to-empty taxonomy catch. |
| Reader cost | 48 measured drains, zero errors, identical 256-row output. Selected SQL-row JSON is 94.38% smaller in the 8 KiB fixture; warm medians 62.49/40.88 ms. | Adopt one compact projection. No production savings claim. |
| Tool frame | 21 descriptors under four role labels, 84 identical SSR outputs, zero fetch calls. Generic save-line alternative falsely describes private Playlists as live. | Consolidate heading metadata only. Preserve feature save-line placement and copy. |
| Operator guards | 148/148 existing guard/inventory tests pass. Five authorization refusals have zero fake effects. Partial helper alone admits one fake callback under freeze. | Keep aggregate authorization and command families. A partial helper is not a writer authority. |

Exact commands, producer exits, fixture hashes and remaining acceptance boundaries are in Appendix C. Local scratch scripts and raw receipts are intentionally ignored, retained in this worktree, and not uploaded or committed. The initial historical replays remain reproducible from Appendix B.

## Proposed work, ranked by value

Value is an engineering judgment based on consequence, recurrence, and migration scope. It is not a measured return on investment. A slice is reviewable on its own and ships only after its own evidence is accepted.

| Value rank | Proposed change | Boundary and first scope | Completion evidence | Relative effort and principal risk |
| --- | --- | --- | --- | --- |
| 1 | One article publication owner with revision and retry semantics | Deepen `server/lib/articleLifecycleValidation.ts` and `articleRevisionJournal.ts` behind one article-write entry point. Move admin batch existing-article writes first. | Two independently loaded drafts cannot overwrite each other. Same operation replays once. Changed payload with reused identity fails. Journal and outbox remain in the same transaction. | Largest slice. Preserve batch atomicity, normalization, alias preservation, and existing import ceremonies. |
| 2 | Explicit non-publication actions for leaving an editor | Replace generic `UnsavedWorkEntry.save` plus optional `publishesLive` with intent variants. Pilot behavior in Writing and the staged live editor, while migrating all 28 registrations atomically to the new type or an explicit discard-only reason. No legacy permissive overload. | Old exit-publish condition rejected. The exit API has no publication variant, and its server intent refuses live transitions. Unconfirmed operations retain their original identity and payload. | Medium. A type describes intent but cannot prove an arbitrary callback's effects. Keep handler authorization and explicit publish confirms. |
| 3 | Pure contract entry points and narrow adapter imports | First extract cache tags from `publicData.cache.ts` into one pure owner. Point `lib/next/publicCacheContract.ts` there. Preserve `writeFreezeRefusal.ts` as the pure classifier. | Importing the publication contract outside a Next request does not load `next/cache` or target resolution. Browser/server artifact checks remain effective. Historical upload and React-edge replays stay discriminating. | Small initial slice. Do not create another registry or a barrel exporting hooks and pure contracts together. |
| 4 | Read projections that enrich canonical records and expose read failure | Keep `publicData.readCatalog.ts`. Put effect preview enrichment behind its existing feature owner. Derive summary types from current projections. | Tags and canonical identity survive compact enrichment. Malformed envelopes and read failures reject; malformed library rows retain their existing filter policy, and absent optional summaries remain valid. Existing pagination and stale-refresh limits remain unchanged. | Bounded enrichment and one measured SQL projection. Preserve the existing parser, native validator and readiness distinctions. |
| 5 | Registry-backed tool frames and fewer local UI recipes | Extend existing `devTabRegistry.ts`, `EditorSection`, `SaveLine`, and shared list recipes. Start with heading label and glyph only. Preserve current spacing and feature save-line ownership. | One registry edit updates rail and tool frame. Human review at desktop and phone widths finds no overflow, focus, or touch regression. | Medium spread across callers. Avoid a universal form/controller framework or copy tests. |

### Slice 1 owns article intent, not every database mutation

The first migration moves the admin batch path onto the existing article lifecycle guarantees. Preserve all-or-nothing behavior across its articles, layouts, and changelog. A missing expected article revision fails closed. A new article uses an explicit create-only admission variant and refuses an existing slug or article ID before invoking current canonical ingestion. The follow-up creates one synthetic article and refuses both collision variants with no further row changes. New-article journaling is not being inferred from the existing-article lifecycle.

Use `articleBaseHash`, which hashes the stored document together with its latest journal row identity. Extend authenticated `getEditorBySlug` and `/api/dev/editor-library?slug=...` hydration to return `{ article, baseHash }` from one read transaction, following the existing `articleLifecycle.get` result. Hash the stored document before editor projection. Carry the pair through `useDevArticleHydration`, `useDevArticlesState`, and the staged save. Replace the pair only while pristine. Dirty and recovered work retains its original baseline. A slim library placeholder has no publication baseline; do not reconstruct one from a public projection or fetch a fresh hash at save time. Resolve the actor and enforce freeze and membership before looking up an actor-scoped replay. Follow the existing `articleDraftReceipts` ordering, fingerprint check before baseline check.

Carry one stable batch operation ID. Derive article child IDs and the existing layout `operationId` from it and their stable target identities. Bind the fingerprint to client-controlled semantic article, layout and changelog inputs, not route-generated `entryId`, `createdAt`, or timestamped message text. The current `useSaveArticleMutation` already retains layout IDs by serialized layout payload. Bind that mechanism to the batch identity, instead of claiming the client has no layout IDs. Persist generated server values in the batch receipt once. A lost-response retry reuses them. Changed semantic content under the same ID refuses. Never create parallel layout identities or let a retry recombine old article actions with newer layout edits.

Use a dedicated versioned `articleBatchReceipts` table with a unique `(ownerEmail, operationId)` key, a fingerprint version, and the committed versioned result. A scratch SQL definition admits the same ID for a different actor and refuses a duplicate actor/ID with SQLSTATE `23505`. Keep receipts without automatic expiry; a later retention change must preserve retry identities. The instrument uses the existing child receipt table to exercise runtime transactions; it does not implement the new generated schema or migration.

The entry point resolves the authenticated actor server-side, validates the request against the canonical substance schema, checks operation identity and the current revision inside the transaction, and performs the owned change. It records the article revision and returns a receipt. The existing indexed-mutation boundary continues to maintain public indexes and enqueue the publication outbox. Delivery remains post-commit. Keep one public batch changelog row. Use the existing internal `recordArticleRevision(..., { publicChangelog: false })` option when the enclosing batch owns public history, rather than copying the prototype's two-row history duplication. Do not expose that policy as a browser flag.

Preserve unchanged-article behavior. Blind composition with `writeHandler` raises `ARTICLE_UNCHANGED` and blocks an otherwise valid layout edit. After the correct baseline is checked, return an explicit unchanged article outcome with no article revision or public-history effect; let layouts proceed and retain the batch receipt. The supplemental SQL probe confirms layout success and exact replay under this policy.

Correct both freeze response layers. Default-map `DataWriteFrozenError` in `protectedRouteOperation`, and rethrow it from `/api/save-article`'s inner catch. A wrapper-only prototype still answers 500; the combined patch answers 503 with `DATA_WRITES_FROZEN` and no publication call. Add a strict, batch-correlated success parser to the current `saveArticle` client. Ten of 11 malformed 2xx fixtures currently normalize into success; JSON null throws. Treat unreadable or uncorrelated success as unconfirmed and retain the exact pending envelope. This is a small client-path migration, not a 49-file transport rewrite.

A narrow alias append must preserve unrelated stored identification fields exactly. Keep its stricter replay check against intervening live article changes; do not replace it with unconditional historical replay. `4fa54a309` proves that validating and then storing a broad normalized replacement can strip siblings. Keep validation and the ownership of the stored patch distinct. `f9c39a2d4` proves that a shared reference ID cannot safely identify a source. Reuse its identity logic rather than inventing another reference map.

Next migrate proposal application and inline article writes onto that owner, removing their superseded write branches in the same slice. The follow-up inventory keeps generated sections, molecules and guarded imports under their specialized owners. IUPAC is an article field and joins the shared article patch/journal owner while retaining its field comparison. Generated sections retain target-bound, reviewed section-CAS receipts and only share an accepted patch/journal primitive. Molecules retain their separate entity and depiction rules. Snapshot imports retain their explicit operator ceremony and separately committed statements, with no false whole-import atomicity claim. Molecule state is a separate stored entity even though it contributes to review identity. Do not route a legitimate bulk import through a browser actor contract or weaken its command ceremony. Any remaining writer gets an explicit owner and a reason for its separate contract.

### Slice 2 makes the safe path visible at the call site

The current exit predicate refuses a callback when `publishesLive` is true, but omission leaves a generic callback eligible. A discriminated union removes that optional-flag convention from the supported client shape, but cannot establish the effects of a callback. The exit API accepts discard, save-unpublished, or submit-proposal. Publishing remains an explicit tool action. Make intent mandatory and default-deny it at the handler. Missing or unknown intent refuses before any side effect. For the two callable exit variants, send an explicit non-publication intent to the owning handler. For Writing's `save-unpublished`, the handler requires both stored and requested status to be explicitly draft, before any write. A missing legacy status is potentially public. Keep private article drafts and reusable playlists distinct: their `save-private` intent may operate while the source article is published, and playlists need no publication-status field. Proposal submission remains a separate non-publication operation. A live transition requires explicit publish intent, the current live membership checks, and the existing confirmation. Types and a post-write receipt cannot establish this guarantee by themselves.

Keep `articleLifecycle`, Writing's pending-operation behavior, account-scoped `draftRecovery`, and the keyed three-way merge. Do not replace them with a new global editor state machine. The AST inventory finds 28 registrations in 22 files, including one UI-kit demo. Three save-capable registrations without the live flag are private article drafts, glossary style-guide drafts and Studio playlists. No current live-publication bug is established in them. For Writing, give the controller a separate `saveUnpublished` operation, enforce intent in `upsertWritingArticleHandler`, and supply explicit publish intent from `changeProposalApply.ts` only after its current independent approval. Non-publication paths do not enqueue cache publication or translation. For staged articles, add pending-operation recovery only after slice 1 supplies a stable operation identity. A retry must send the original frozen operation rather than later edits.

### Slice 3 separates pure knowledge from runtime adapters

`lib/next/publicCacheContract.ts` describes itself as pure but imports tags from `publicData.cache.ts`, which imports `next/cache`, crypto, and target resolution. Move the tags and constructors, not the cache implementation. Both the cache adapter and publication contract import that one owner. The scratch extraction preserved 53 publication-output comparisons and loads with zero Next modules and no database target. The current module also loads without a target, so this is a dependency improvement, not a reproduced current load failure. Keep browser-safe types and references separate from server execution modules.

Use the existing ESLint configuration for a narrow prohibited-import rule only where a compiler boundary cannot express the distinction. Its diagnostic must name the supported pure entry point. Do not add architecture tests that inspect source strings. Keep the existing compiled artifact audit as the final check of actual output. The actual Vercel CLI 54.18.1 source selector now reproduces the recovery-source omission and fixed retention against a synthetic file tree. No upload, root or packaging changes are selected. Prebuilt output and deployed artifacts remain separate implementation acceptance, not an open design fork.

### Slice 4 measures work before proposing speedups

The compact-summary replay establishes data loss from replacing a canonical preview with a partial record. It does not establish a performance gain. Prefer a feature-owned enrichment function that owns merge order and canonical fields, with types derived from existing projections. Do not build a generic hydration pipeline.

Adopt the ordinary library-input SQL projection in `dbSubstanceReads.ts`, leaving the actual `projectLibraryInput`, parser, page limits, transaction and cache contracts in place. The synthetic whole-reader experiment returned 256 identical public rows in every one of 48 measured drains, with zero errors. Both variants used eight pages, eight data SELECTs and 24 SQL calls. The compact variant requests 22 columns instead of 26 and narrows two JSONB leaves. It removes materialization and codec work, not round trips.

With six excluded or narrowed synthetic fields carrying 8 KiB each, serialized SQL-row JSON fell from 13,768,214 to 773,384 bytes, 94.38%. Final public JSON remained exactly 544,585 bytes. Warm medians over seven alternating runs were 62.49 ms and 40.88 ms, with ranges 57.77-88.56 and 36.20-64.01 ms. Five first-read runs per side had medians 65.19 and 43.45 ms. These are local PGlite reader measurements with caches bypassed, not HTTP, wire traffic, cold disk or production latency. A separate profile locates removable work in WASM result materialization, `rowToDocument`, `decodeDocumentValue` and `omitUndefinedDeep`. The empty-text fixture has a small, noisy timing difference, so no universal speedup is claimed. Source-matched indexes and both fixture distributions are retained in the report.

Keep the existing row parser policy. Malformed page envelopes and generic query errors reject, but malformed library rows are filtered. The native taxonomy callable already validates its return shape; do not add a duplicate parser based on fake-transport results. Remove the taxonomy read's generic `Server Error` and missing-callable compatibility catches, preserving successful empty results and explicit index-readiness contracts. A missing compact effect summary is legitimate partial hydration. Add only `long_summary_raw`, `long_summary_ast`, `citations` and `subarticles` to canonical previews, preserving their slug, name, tags, short summary, featured state and order. Broader SQL conversion is rejected. Historical glossary timings remain commit-author reports rather than reproduced measurements.

### Slice 5 centralizes decisions already repeated across tools

The registry already owns route, role, save model, label, and glyph. The prototype selects a heading-only frame that supplies the current label and glyph to `EditorSection`. It preserves feature children, spacing and save-line placement. Keep `shellOwnsSaveLine` and feature-specific copy overrides. Do not auto-render a generic `SaveLine` for every tool: the rejected prototype falsely described private Playlists as publishing immediately. The narrow version matched existing SSR markup in all 84 tool/role cases. This is a metadata consolidation, with no claimed layout or accessibility improvement. Add no UI, wording, or class-name tests.

## Usage-first sketch

These are proposed interfaces, not added APIs. Names may change during implementation. Existing schema types and revision functions remain authoritative.

```ts
const receipt = await writeArticle(ctx, actor, {
  kind: "replace-existing",
  slug,
  baseHash: loadedBaseHash,
  changeId,
  article: reviewedDraft,
});

useUnsavedWork({ ...work, kind: "save-unpublished", saveDraft });

<ToolFrame tool="glossary" description={description}>{workspace}</ToolFrame>
```

The proposed article command is a union of `replace-existing`, `append-aliases`, and `create`. Existing-article variants require `baseHash` from the loaded stored document and its latest journal identity. This is a hash string, not a numeric revision or public projection hash. Every variant requires a stable change ID. The actor is a resolved server identity, never a client-supplied role. The result distinguishes applied, replayed and unchanged outcomes, with the resulting revision where appropriate. Revision conflicts are explicit refusals. Conflict handling leaves the editor's draft intact.

The proposed shell union is `discard-only | save-unpublished | submit-proposal`. Here, `save-unpublished` names a non-publication exit action, not an article-status rule. Owner-specific adapters pin the server resource intent. Writing sends `save-unpublished`; private article drafts and reusable playlists send `save-private`. Only the two callable shell variants contain an exit action. All variants retain the existing record identity, dirty state, discard, and tab-switch persistence semantics. No publication variant exists in this interface.

Suggested module map:

```text
server/lib/articleWrite.ts             Proposed article command boundary.
  articleLifecycleValidation.ts        Existing validation and patch ownership.
  articleRevisionJournal.ts            Existing hashes and article revision journal.
  indexedMutation.ts                   Existing index and publication outbox integration.
src/features/dev/components/unsavedWork.tsx
                                       Existing shell registry, narrower exit intents.
lib/data/publicData.cacheTags.ts        Proposed pure tag owner extracted from cache.
lib/data/publicData.cache.ts            Existing Next cache adapter.
lib/next/publicCacheContract.ts         Existing publication identity-to-effect mapping.
src/features/dev/pages/devTabRegistry.ts
                                       Existing tool identity and save-model owner.
```

The article boundary is useful only if it hides revision, replay, patch, journal, and publication responsibilities. A wrapper that simply forwards the same arguments to existing writers adds no value. Do not expose internal load/validate/save stages for callers to coordinate.

## Offline prototypes and decisions

The local command `node tmp/pstack-architecture-plan/replay.mjs` exited 0. Appendix B preserves the executed replay so the evidence survives removal of scratch files. Five historical conditions fail their intended invariant before the fixing commit and pass afterward.

| Experiment | Before | Fixed | Decision and limitation |
| --- | --- | --- | --- |
| Duplicate reference IDs, `f9c39a2d4` | Two unrelated sources retain an ambiguous ID or remap | Distinct IDs, no guessed legacy alias | Keep the existing reference owner. Actual pure modules, synthetic records. |
| Partial effect summary, `458037547` | Canonical tags disappear | Tags survive enrichment | Make enrichment an owned operation. Actual mapping expression, not the full route. |
| Recovery upload, `aa2d0d60a` | Broad ignore rule excludes maintained recovery source | Root-anchored rule retains it | Prefer explicit artifact inputs. Git ignore semantics, not a Vercel upload. |
| Freeze classifier dependency, `76076eb3a` | Direct classifier import loads a React module | Direct classifier import is React-free | Pure contract entry points earn their place. Direct import-edge check, not a compiled dependency audit. |
| Exit action, `535619fd3` | Exit can offer a live save | Explicit live flag suppresses it | Replace the omission-sensitive flag with intent variants. Actual JSX predicate, not rendered UI. |

Proposed state models also ran. Explicit exit intents expose two non-publication action variants and no publish action. A pre-write intent model admits a draft-to-draft save and refuses draft-to-published, published-to-draft, and published-to-published transitions. An article-write model rejects a second draft loaded at revision zero, replays the first operation without another write, and rejects the same identity with changed content. The unguarded model accepts the stale second draft. A third experiment used the actual Node package resolver. An exported entry loaded, an unexported package subpath failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`, and a relative import of the same private file succeeded. Export maps alone therefore do not close source imports. This favors in-place deepening now. The follow-up now tests TypeScript 6.0.3 package exports, isolated composites, project references and declaration imports. Private source imports are rejected only in the isolated case; references and emitted declarations provide bypasses. The selected design uses in-place pure owners and a narrow direct-import rule, rather than packages.

These initial models are retained as historical sketches, not proof of the proposed server enforcement. The follow-up results in Appendix C supersede them with actual handler, local database and compiler experiments. None accepts a future application implementation or deployment.

## Alternatives and synthesis

Two independent sketches explored different whole-repository shapes. Candidate A used in-place module deepening. Candidate B used capability packages with closed exports and an isolated application project. Both concluded that a broad package migration is currently unearned.

Candidate A supplies the base shape. Keep existing owners and remove alternate paths as callers migrate. Adopt its explicit exit intent. Graft Candidate B's category-ready read operation and its distinction between a named export and a real compiler boundary. The separately grounded admin batch gap moves article publication ahead of both candidates' preferred first steps.

| Criterion | In-place deepening | Capability packages | Judgment |
| --- | --- | --- | --- |
| Prevents observed failures | Directly changes write and exit contracts | Can block some import shortcuts, but does not own write semantics | In-place wins for the highest-consequence finding. |
| Preserves safeguards | Keeps runtime, artifact, and operator topology | Requires moving schema producers, imports, and upload inputs | In-place has fewer migration hazards. |
| Reduces caller knowledge | Concentrates operations, with internal import paths still available | Explicit exports improve discovery, but require real project isolation | Packages offer stronger accidental-import enforcement only after isolation. |
| Limits migration scope | Small owner-and-caller slices | Application root and generated paths move | In-place wins. |
| Verification cost | Existing targeted guards plus slice-specific rehearsals | Adds package, resolution, build-order, and upload verification | In-place wins for current evidence. |

These are qualitative judgments. Both the initial Node resolver experiment and the follow-up TypeScript bypass probes support retaining the existing layout. Neither proves an unrestricted compiler boundary.

Reject Candidate A's broad operator and HTTP-client migration for this first plan. Their broader migrations exceed the selected scope. Keep the narrow default `DataWriteFrozenError` response correction with slice 1, since the follow-up probe reproduces its generic 500. Replacing all client and operator callers would distract from the article boundary. Do not adopt its suggestion that a post-write visibility receipt prevents publication. A receipt arrives after any side effect. The final plan keeps pre-write intent enforcement and the existing handler guards. Remove the confirmed generic `server error` catch in `reportDegradedReplicationArtistTaxonomyRead` from slice 4. Preserve explicit index-not-ready handling. Generic transport failure must reject, rather than silently return untagged artists.

Reject Candidate B's full package extraction and application-root move. Keep the category enrichment boundary without introducing another transport or repository layer. No permanent forwarding barrels or duplicated schemas are part of the target shape.

The initial independent cross-judge approved in-place deepening as the direction and found eight required revisions. The follow-up resolves them through prototypes and explicit contracts below. All new delegated follow-up work uses Codex GPT-6.1-Sol, as requested. The earlier Claude review is historical evidence, not a new delegation.

The decision criteria are prevention of a demonstrated failure, preservation of guards, the amount a caller must understand, migration scope, and verification cost. No numeric design score is presented as measured evidence.

## Acceptance and rollback

No implementation is accepted by this document. Each future slice needs a separate review against its final diff and reproduced behavior. For article writes, that includes an isolated local Postgres rehearsal with two stale browser drafts, a lost response, reused operation identity, freeze refusal, role refusal, and atomic rollback if an article or layout fails. Verify index updates and the expected coalesced outbox targets in the same transaction. The exercised changed-article/layout fixture creates three outbox rows; replay must create no further rows. Then drive the relevant editor journeys with synthetic fixtures. Fixture success does not establish production database or deployment acceptance.

Run only the existing tests that cover the changed guards, roles, revision conflicts, secrets, harmful data transforms, or tricky pure logic. Run the applicable type and lint checks. Public/editor boundary changes additionally require separate compiled artifact checks. New architecture conventions belong in types, exports, or narrow lint diagnostics, not new source-text tests. Read the installed Next guides before any future Next code changes.

Keep Postgres runtime truth, `DATA_WRITES_FROZEN`, explicit operator targets, confirmation phrases, intent credentials, Auth.js identity, database-backed roles, human approval, App Paths, and generated-file lineage. Do not hand-edit generated schema, callable registries, theme assets, or other lineage-owned outputs.

Each source slice can be reverted independently before deployment. A revert must keep any new client and handler contracts compatible as a pair. Persisted receipt or schema changes require a separately reviewed compatibility and retention plan. No destructive data rollback is authorized here.

## Evidence limits and review notes

The repository and local Git history are the primary sources. Architecture appendices, contribution rules, the glossary, and the latest test-policy commits were consulted. No external issue tracker, team chat, observability, error tracking, or analytics was queried. PR discussion was not fetched. The investigation does not establish deployed roles, grants, credentials, cache behavior, or incident frequency. Earlier history can be squashed or rewritten, so commit counts are counts in this baseline's graph.

At the end of the initial investigation dependencies were absent, and an attempted Vitest probe failed during configuration loading before tests ran. The follow-up supersedes that probe with installed frozen-lockfile dependencies and recorded local producer results. Lifecycle scripts were disabled during installation. Actual tooling was Node 24.21.0, Bun 1.4.0, TypeScript 6.0.3 and Vitest 4.1.10; the project requests Bun 1.3.5. No production build, deployment, or live-data measurement is claimed. The optional `deslop` skill was unavailable; prose received a manual unslop pass instead.

The principles that changed this recommendation are Laziness Protocol, which favored in-place deepening over a package migration; Type System Discipline, which replaced optional exit safety flags with intent variants; and Prove It Works, which required replays against historical source rather than treating commit subjects as runtime proof.

The proposed first implementation unit is the admin batch article boundary, with its caller migration and stale-save rehearsal. Josie's review determines whether to authorize implementation. Nothing in this plan initiates it.

## Appendix A. Counted corrective work

Each hash resolves in the baseline history. Inspect a patch with `git show <hash>`. This ledger is the complete selected sample. Recount it with the Python snippet below. Classification is a review judgment, not keyword matching.

### UI recipes and vocabulary drift

| Commit | Corrective or consolidation work |
| --- | --- |
| `69e1ec6f4` | Keep the German glossary suggest chip on one line |
| `20a6cff79` | Localize the glossary source-coverage tooltip |
| `69bd25d7e` | Glossary: name the first view Waiting so it no longer shares the Inbox tool's name |
| `6185fab72` | Dev tools redesign: Cleanup: the Glossary's save line no longer splits its heading on phones |
| `29e0cd9e8` | Dev tools redesign: Cleanup: list group headings share one recipe |
| `20294bce1` | Dev tools redesign: Cleanup: one wording for the key line under every list |
| `9cc7d0d60` | Dev tools redesign: Cleanup: list refresh controls all say Refresh |
| `9651a9064` | Dev tools redesign: Cleanup: idle panes use the workspace recipe and the shared save line |
| `2d74e8ca4` | Dev tools redesign: Cleanup: Replication Studio keys and counts follow the shared recipes |
| `71dbd43c5` | Dev tools redesign: Cleanup: every tool heading starts at one height and names the rail's tool |
| `a3423ed8f` | Dev tools redesign: Cleanup: one hold-line wording, registry glyphs on headings, quieter create |
| `59836cd4b` | Dev tools redesign: Cleanup: meta labels use type-meta-label, sentences stay sentence case |
| `81b9611be` | Dev tools redesign: Cleanup: no trailing ellipses in editor copy |
| `4f0c7d513` | Dev tools redesign: Cleanup: Inbox citation rows read as article titles |
| `f7eeab4bb` | Dev tools redesign: Cleanup: AboutCopyEditors keeps only the public panel's layout |
| `78f84c026` | Dev tools redesign: Cleanup: the article preview shrinks when there is no article to draw |
| `c0e7508ad` | Dev tools redesign: Cleanup: EditorList ticks are finger-sized and focus draws one line |
| `38d09e0ff` | Dev tools redesign: Cleanup: the Glossary is called the Glossary everywhere |
| `cf9ce124e` | Dev tools redesign: Cleanup: an inserted paragraph no longer shows a blank removed line |
| `046a889e8` | Dev tools redesign: Cleanup: a disabled accent button no longer reads as live |
| `3bb6c3cd4` | Dev tools: phone layout for switchers, overflow, and the tools sheet |
| `f4ea00a0d` | Glossary progress tracks use a token-layer class |
| `e63038dc0` | Theme tokens: route new dev tool styles through semantic classes |
| `7cf73d64f` | Bring the UI kit primitives onto shared radius, surface, and motion tokens |
| `23149f4e0` | Keep dose and plateau tier row tints out of the surface chroma axis |

### Draft and decision state leaks

| Commit | Corrective or consolidation work |
| --- | --- |
| `e40c01499` | Keep Inbox review notes in the browser and hide citations from All |
| `e32fa4a94` | Clear outgoing draft state before keyboard search navigation |
| `f274df80e` | Dev tools redesign: Cleanup: Studio playlist conflicts offer the latest version; drag shadows use tokens |
| `bf298d520` | Dev tools redesign: Cleanup: editors open the changes before recommending a changed article |
| `34ea76c2f` | Dev tools redesign: Review: open the changes before re-signing a changed article |
| `58ba5ed90` | Review fix: approving a recommendation keeps the recommender and note |
| `76d42231b` | Intake fix: Inbox claims end on decision, expire, and can be taken over |
| `f90707ae6` | Ticket 39: Glossary writes patch one row, and single-key shortcuts cannot publish by accident |
| `535619fd3` | Ticket 03 follow-up: the unsaved-work dialog never publishes live |
| `f979d0e9b` | Ticket 11: Feedback decisions never move the selection under a typed note |
| `57cb6a67c` | Ticket 09: The trip report editor asks before it drops unsaved edits |
| `59d7a123b` | Ticket 05: Cancelling a field edit drops the citation it added |
| `373fbf1a2` | Ticket 08: Trip report status changes keep the existing review note |
| `1e0abe782` | Ticket 17: Copy Studio finds copy by its wording and resets after a proposal |

### Artifact and execution boundary drift

| Commit | Corrective or consolidation work |
| --- | --- |
| `bdeb4a4c2` | Replication Studio: unsaved-work ids no longer look like function calls |
| `aa2d0d60a` | Keep tracked draft recovery modules in Vercel uploads |
| `0d222a6fa` | CSP: pin the DoseWiki theme startup script hash main now ships |
| `76076eb3a` | Dev tools redesign: Cleanup: the production build compiles again (a React-free freeze refusal) |
| `772f2a3c3` | Dev tools redesign: Cleanup: fix the shell hydration mismatch at its root |
| `db2247f55` | Inbox claims test: start each test unfrozen under CI's DATA_WRITES_FROZEN=1 |
| `dfdc4f0f5` | Inbox claims test: approve at the content-derived review revision |
| `15b25e235` | Keep a runner-built artifact's skew ID at request time too |
| `99b88f9a2` | Give runner-built artifacts a skew protection deployment ID |
| `af1885970` | Keep the editor build directory's function files in the prebuilt upload |
| `164913fa9` | Stage each artifact's cron jobs before the remote build |
| `993ac5ff9` | Address review findings on the build diet change |

### Read contracts, freshness, and excess work

| Commit | Corrective or consolidation work |
| --- | --- |
| `07b3334c8` | Faster glossary workbench audits, and a Suggestions view for reader suggestions (#152) |
| `91a6838af` | Speed up Waiting glossary reads and open Terms first |
| `9964d601b` | Send only glossary controls in each locale payload |
| `458037547` | Fix category effect summary hydration and missing tags |
| `0cc5e087a` | Preserve compact localized search summaries on current production |
| `0b8ebd73f` | Fix localized public search, navigation races and CAS lookup |
| `f64f2fa70` | Dev tools redesign: Cleanup: EditorList windows rows of different heights |
| `de808467a` | Ticket 57: Malformed feedback responses are an error, not an empty queue |
| `269a6d574` | Ticket 58: Tell an empty queue from an unknown or stale count |
| `2adc9dbd7` | Ticket 28 follow-up: citation decisions refresh the Citations badge |

### Content integrity and authority

| Commit | Corrective or consolidation work |
| --- | --- |
| `f9c39a2d4` | Fix shared reference ids, legality alias collisions and trip report labels (#155) |
| `52a352418` | Keep approved glossary rows in place and confirm CSV imports first (#156) |
| `4fa54a309` | Preserve exact identification siblings when appending aliases |
| `5154ba6d9` | Check live section hashes before accepting regeneration receipt retries |
| `386aa2185` | Review fix: review staleness derives from stored content, so every write path counts |
| `d04f39704` | Ticket 12: Review sign-off matches the role and undo restores the true state |
| `98e97ffeb` | Ticket 14: Bulk edit checks revisions, confirms, starts clean |
| `a103f54c0` | Ticket 16: Banner scope edits stop publishing unsaved copy |
| `9a96e6b89` | Ticket 15: Publishing changed chemistry shows the diff, needs a typed confirm, and checks revisions |
| `087cd3218` | Ticket 06: Publishing needs an explicit action and reports delivery |
| `41b27db8e` | Ticket 04: Dose and duration fields cannot store a citation marker |
| `8c67053ec` | Intake fix: Reader contact details never reach a feedback search URL |
| `592bce6f8` | Apply review fixes to the write command and outbox follow-ups |

```python
from collections import Counter
from pathlib import Path
import re
import subprocess

text = Path("notes/pstack-architecture-plan.md").read_text()
ledger = text.split("## Appendix A.", 1)[1].split("## Appendix B.", 1)[0]
counts = Counter()
seen = set()
cohort = set(subprocess.check_output([
    "git", "log", "8c8950b8c", "--no-merges", "-250", "--format=%h"
], text=True).splitlines())
category = None
for line in ledger.splitlines():
    if line.startswith("### "):
        category = line[4:]
    match = re.match(r"\| `([0-9a-f]{9})` \|", line)
    if not match:
        continue
    commit = match[1]
    assert commit not in seen
    assert any(value.startswith(commit) or commit.startswith(value) for value in cohort)
    seen.add(commit)
    counts[category] += 1
assert len(seen) == 74
print(dict(counts))
```

## Appendix B. Reproduce the offline experiments

Run the following from the repository root using Node. Save it as `tmp/pstack-architecture-plan/replay.mjs`, creating that ignored directory first. It reads historical source through Git and creates two ignored pattern files under `tmp/pstack-architecture-plan`. It never imports application configuration or opens a database. Expected result is five records with `oldFails: true` and `currentPasses: true`, followed by the optional-flag observation, the proposed-model results, and the package-resolution experiment. Exit status is zero.

```js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const show = (ref, file) => execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
const results = [];
const record = (name, oldFails, currentPasses, detail) => {
  assert(oldFails && currentPasses, name);
  results.push({ name, oldFails, currentPasses, detail });
};
const identityPath = 'lib/citations/referenceIdentity.mjs';
const load = async (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const before = await load(show('f9c39a2d4^', identityPath));
const after = await load(show('8c8950b8c', identityPath));
const refs = [4, 5].map((section) => ({ id: 'legacy', url: `https://example.org/section/${section}`, title: 'Act', authors: [] }));
const valid = (merged) => new Set(merged.references.map((r) => r.id)).size === 2 && !merged.remap.has('legacy');
record('reference identity', !valid(before.mergeReferenceCollections(refs, refs)), valid(after.mergeReferenceCollections(refs, refs)), 'Actual modules, two distinct sources sharing one id.');

const taxonomy = 'lib/next/routeLoaders.taxonomy.ts';
function enrich(source) {
  const expression = source.split('const canonicalEffects = ')[1].split('const effects = locale')[0].trim().replace(/;$/, '');
  return new Function('previews', 'selectedSlugs', 'summaryBySlug', `return ${expression}`);
}
const previews = [{ slug: 'colour-enhancement', name: 'Colour enhancement', tags: ['visual'], summary: 'Brighter colours.' }];
const summaries = new Map([[previews[0].slug, { slug: previews[0].slug, name: previews[0].name, long_summary_raw: 'Detailed colours.' }]]);
const args = [previews, new Set([previews[0].slug]), summaries];
record('compact summary enrichment', !enrich(show('458037547^', taxonomy))(...args)[0].tags, enrich(show('458037547', taxonomy))(...args)[0].tags[0] === 'visual', 'Actual historical expression, synthetic public records.');

const ignoreTarget = 'src/features/dev/recovery/draftRecovery.ts';
function ignored(ref) {
  const file = path.resolve(`tmp/pstack-architecture-plan/${ref.replace('^', '-parent')}.ignore`);
  writeFileSync(file, show(ref, '.vercelignore'));
  const result = spawnSync('git', ['-c', `core.excludesFile=${file}`, 'check-ignore', '--no-index', '-q', ignoreTarget]);
  assert([0, 1].includes(result.status));
  return result.status === 0;
}
record('upload path anchoring', ignored('aa2d0d60a^'), !ignored('aa2d0d60a'), 'Git ignore semantics replay, not a Vercel upload.');

const model = 'src/features/dev/tools/glossary/glossaryModel.ts';
const importedLeaf = (ref) => show(ref, model).match(/import \{ isWriteFreezeRefusal \} from "([^"]+)"/)[1].replace('@/', 'src/') + '.ts';
const hasReact = (source) => /from ["']react["']/.test(source);
record('pure refusal dependency', hasReact(show('76076eb3a^', importedLeaf('76076eb3a^'))), !hasReact(show('76076eb3a', importedLeaf('76076eb3a'))), 'Actual direct import edge replay, not a Next build.');

const unsaved = 'src/features/dev/components/unsavedWork.tsx';
function exitOffersSave(ref, entry) {
  const predicate = show(ref, unsaved).match(/\{(entry\.save(?: && !entry\.publishesLive)?) \? \(/)[1];
  return Boolean(new Function('entry', `return ${predicate}`)(entry));
}
const publishes = { save: async () => {}, publishesLive: true };
record('exit dialog publication', exitOffersSave('535619fd3^', publishes), !exitOffersSave('535619fd3', publishes), 'Actual historical JSX predicate, no rendered browser.');
assert(exitOffersSave('8c8950b8c', { save: async () => {} }));
results.push({ name: 'remaining optional-flag gap', observed: 'A generic save callback with no publishesLive flag still appears as safe to save on exit.' });

const registry = [
  { kind: 'discard-only', discard: () => {} },
  { kind: 'save-unpublished', saveDraft: async () => {}, discard: () => {} },
  { kind: 'submit-proposal', submit: async () => {}, discard: () => {} },
];
const exitAction = (entry) => entry.kind === 'save-unpublished' ? entry.saveDraft : entry.kind === 'submit-proposal' ? entry.submit : undefined;
assert.equal(exitAction({ kind: 'publish', publish: async () => {} }), undefined);
assert.equal(registry.filter((entry) => exitAction(entry)).length, 2);
results.push({ name: 'proposed explicit exit intents', observed: 'Two non-publication variants offer exit actions; publication has no exit action. Model only, not compile-time proof.' });
const permitsOffstage = (beforeStatus, nextStatus) => beforeStatus !== 'published' && nextStatus !== 'published';
assert(permitsOffstage('draft', 'draft'));
for (const [beforeStatus, nextStatus] of [['draft', 'published'], ['published', 'draft'], ['published', 'published']]) {
  assert.equal(permitsOffstage(beforeStatus, nextStatus), false);
}
results.push({ name: 'proposed pre-write exit intent', observed: 'One unpublished save admitted; publishing, unpublishing, and changing a published record refused before write. Model only.' });

function simulate(checked) {
  let article = { revision: 0, summary: 'original' };
  const receipts = new Map();
  let writes = 0;
  function apply(command) {
    if (checked && receipts.has(command.id)) {
      const prior = receipts.get(command.id);
      return prior.request === JSON.stringify(command) ? 'replayed' : 'id-reused';
    }
    if (checked && article.revision !== command.expected) return 'conflict';
    article = { revision: article.revision + 1, summary: command.summary };
    writes++;
    receipts.set(command.id, { request: JSON.stringify(command) });
    return 'applied';
  }
  const first = { id: 'change-a', expected: 0, summary: 'first editor' };
  const second = { id: 'change-b', expected: 0, summary: 'stale second editor' };
  assert.equal(apply(first), 'applied');
  const stale = apply(second);
  if (checked) {
    assert.equal(stale, 'conflict');
    assert.equal(apply(first), 'replayed');
    assert.equal(apply({ ...first, summary: 'different edit' }), 'id-reused');
    assert.equal(writes, 1);
  }
  return { stale, summary: article.summary, writes };
}
const unguarded = simulate(false);
const guarded = simulate(true);
assert.equal(unguarded.summary, 'stale second editor');
assert.equal(guarded.summary, 'first editor');
results.push({ name: 'proposed article write owner', unguarded, guarded, detail: 'Synthetic sequential concurrency model. Not the real transaction implementation or a SQL isolation proof.' });

const packageDir = path.resolve('tmp/pstack-architecture-plan/export-prototype');
mkdirSync(packageDir, { recursive: true });
writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@dosewiki/prototype-domain', type: 'module', exports: { './pure': './pure.mjs' } }));
writeFileSync(path.join(packageDir, 'pure.mjs'), 'export const value = "pure";');
writeFileSync(path.join(packageDir, 'private.mjs'), 'export const value = "private";');
writeFileSync(path.join(packageDir, 'consumer.mjs'), `
import assert from 'node:assert/strict';
assert.equal((await import('@dosewiki/prototype-domain/pure')).value, 'pure');
await assert.rejects(import('@dosewiki/prototype-domain/private.mjs'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
assert.equal((await import('./private.mjs')).value, 'private');
console.log('exported import succeeds; private package subpath fails; relative path bypass succeeds');
`);
const packageOutput = execFileSync(process.execPath, [path.join(packageDir, 'consumer.mjs')], { encoding: 'utf8' }).trim();
assert.equal((await import('./export-prototype/private.mjs')).value, 'private');
results.push({ name: 'package export alternative', observed: packageOutput, detail: 'Actual Node resolver experiment. A relative source import from outside the package also succeeds; no TypeScript compiler boundary was tested.' });
console.log(JSON.stringify(results, null, 2));
```


## Appendix C. Follow-up decisions and reproduction

All empirical design forks identified in the initial plan and review have a selected answer below. These results settle the planned shape, not acceptance of code that has not been implemented. Scratch directories remain ignored under `tmp/pstack-architecture-plan/` in this worktree. Reports and raw receipts are local and ephemeral. This committed appendix preserves the decisions, commands, counts and important limitations without committing scratch code or run logs.

### Article transaction and writer scope

Run `python3 tmp/pstack-architecture-plan/followup-article/run.py` from the repository root. The final parent run exits 0 with 16/16 experiments. The worker's `report.md` describes its initial 12 experiments; `followup-root/article-supplement.md` describes the four parent additions. `followup-article/observations.json`, `run-receipt.json`, `source-hashes.json`, `experiments.test.ts` and `batch-prototype.ts` identify inputs and outputs. The parent independently reran the producer. All 28 unchanged migrations ran against in-memory PGlite 0.5.8 through the unchanged `PostgresClient` transaction executor and a transport shim.

The real batch path overwrites the newer summary with the stale stored summary and leaves zero article revisions. The real lifecycle refuses the stale save, returns the original revision on exact replay and refuses changed content under the same identity. The batch prototype checks semantic fingerprint before baseline. Five changed-request variants refuse, while regenerated server changelog fields do not change the fingerprint. Four failures injected after earlier effects, at a later layout, second article, batch receipt and second outbox insert, each restore the complete pre-request database data hash. Freeze refuses a known replay before any SQL call; a downgraded actor also refuses replay. These tests prove sequential retries and rollback, not simultaneous multi-connection isolation or a real dropped network response.

The parent additions settle three compatibility questions. Naive lifecycle composition refuses `ARTICLE_UNCHANGED` and blocks a valid layout. The selected baseline-checked no-op variant permits that layout, appends zero article revisions or history rows, and exactly replays its batch receipt. A separate SQL key proof rejects duplicate actor/operation identity with `23505` and admits the same ID for another actor. Create-only admission adds one article and refuses both existing-slug and existing-ID variants with unchanged database hashes after refusal. These additions do not implement generated schema, a creation journal or a creation receipt. The enclosing planned batch still owns its retry receipt.

The original success instrument creates three coalesced outbox rows and two public history rows. The parent also executed the selected one-history-row composition. A checked scratch copy of `articleLifecycle.ts` changes only import anchoring, the function name and the existing `publicChangelog: false` argument. Its batch commits one article journal row, one changelog row, one article-history row, two receipts, one layout revision and three outbox rows. Exact replay returns the same result with the entire database hash unchanged. Select this internal history policy; do not expose a browser flag.

The source writer inventory in `followup-article/report.md` is complete for the alternatives raised by the plan. Migrate batch, lifecycle, proposal application, inline article and IUPAC writes into the article owner. Preserve alias replay's stricter current-content check. Keep generated sections under their reviewed, target-bound section-CAS authority, sharing only the accepted patch/journal operation. Keep molecules separate, including the existing optional save baseline, strict rerender baseline and insert-only seed. Keep snapshot import under its guarded operator owner; its statements commit separately and bypass runtime indexes/outbox. None of those distinctions justifies removing role, freeze, confirmation or target guards.

### Exit intent and route outcomes

Run these commands from the repository root:

```sh
python3 tmp/pstack-architecture-plan/followup-exit/run.py prepare
python3 tmp/pstack-architecture-plan/followup-exit/run.py vitest
python3 tmp/pstack-architecture-plan/followup-exit/run.py types
python3 tmp/pstack-architecture-plan/followup-exit/run.py types-negative
python3 tmp/pstack-architecture-plan/followup-exit/run.py type-counterexample
python3 tmp/pstack-architecture-plan/followup-exit/run.py inventory
```

The final Vitest producer passes 40/40 cases with raw exit 0, independently rerun by the parent. Positive compilation exits 0. The negative probe deliberately exits 2 with five diagnostics for four illegal inputs. The callback counterexample compiles, exits 0 and executes one modeled live write. Initial compiler configuration failures and the corrected missing-origin fixture remain in numbered receipts. Do not count those attempts as passing proofs. `source-hashes.json` records 28 source/input identities.

Actual route probes establish that default freeze handling returns 500, a wrapper-only mapping still returns 500, and inner rethrow plus wrapper mapping returns 503 `DATA_WRITES_FROZEN` with no publisher call. Other route fixtures preserve 401, 403, 429, 400, 413, 409 and 404 outcomes and private response headers. Session, capability and rate services are mocked. The actual batch client normalizes 10 of 11 malformed 2xx fixtures into success and throws on null. This establishes a response-validation gap, not that a browser draft was visibly discarded. Require a strict operation-correlated batch response before confirming the pending command.

The executable command model exercises 26 cases, including 19 refusals with zero effects. Missing, unknown and wrong-resource intents default-deny. Writing draft saves require stored and requested status to be explicitly draft. Private article drafts can save while their source is public. Reusable playlists have no publication-status requirement. The actual legacy playlist handler admits an admin without adding publication fields and refuses editor/contributor ownership violations with zero effects. Its auth and indexed wrapper are mocked, so it is not an outbox rehearsal. Trusted proposal application must send explicit publish intent only after independent approval. No post-write receipt can prevent an already performed publication.

The AST inventory has 28 registrations in 22 files, including the UI-kit demo, or 27 product registrations in 21 files. Private article drafts, glossary style-guide drafts and Studio playlists have generic save callbacks without the live flag. Source review establishes no current live-publication bug in those three. Select an atomic shared-type migration, with explicit discard-only entries where a non-publication adapter is not yet owned. Keep no permissive legacy overload. Code-based freeze classification recognizes all seven constructed cases; each message-regex alternative has four false positives and one false negative in that fixture. These are discriminator examples, not production error rates.

### Dependency, compiler and artifact boundaries

Run `python3 tmp/pstack-architecture-plan/followup-boundaries/run.py`. The parent rerun exits 0. `summary.json` records 20 experiments and 20 expected outcomes. Expected negative TypeScript and lint exits are discrimination evidence, not a whole-application green check. See `report.md`, `results.json`, `bundle-results.json`, `upload-results.json`, `publication-outputs.json` and `source-hashes.json`.

TypeScript 6.0.3 rejects an unexported package subpath but accepts a relative private-source import. An isolated composite project rejects outside-source imports. Adding a real project reference permits the private-source import, and importing an emitted private declaration also succeeds. A narrow lint configuration accepts two supported imports and rejects three prohibited direct imports. It does not prove transitive isolation. Select in-place pure owners plus that narrow rule and existing compiled artifact audits. Reject package extraction and application-root movement.

Extracting actual cache-tag declarations preserves 53 comparisons, including 25 publication kinds and saved-path unions. The current bundle has nine modules and Next/cache plus crypto externals; the extraction has eight modules, no externals and no target resolver. Both load with no database target, so there is no reproduced current load failure. The extracted fresh process has two exports and zero Next modules. A dependency-ban resolver rejects the current graph and accepts the extracted graph. Historical hook versus pure-classifier bundles agree on six refusal inputs, while only the hook requires React.

The unchanged public/editor loader matches all 11 synthetic fixtures, including two explicit client-import refusals and five replacements that bundle without the editorial sentinel. This is not a complete Next artifact build. The actual Vercel CLI 54.18.1 exported `buildFileTree` source selector, with `prebuilt: false`, reproduces the historical recovery-source exclusion and its fixed retention on a synthetic tree. Four regular files survive the old rule versus five under fixed/current rules. No upload or deployment was invoked. Preserve the existing ignore rules and root. Prebuilt artifact checks remain future implementation acceptance.

### Whole local reader comparison

Run the following with the worker's environment-allowlisting wrapper. It drops inherited credential variables, uses synthetic unreachable loopback URLs and records exact argv, exit and signal in `commands.jsonl`.

```sh
env -i PATH="$PATH" node tmp/pstack-architecture-plan/followup-reads/run.mjs tmp/pstack-architecture-plan/followup-reads/build.mjs
env -i PATH="$PATH" node tmp/pstack-architecture-plan/followup-reads/run.mjs tmp/pstack-architecture-plan/followup-reads/behaviors.mjs
env -i PATH="$PATH" node tmp/pstack-architecture-plan/followup-reads/run.mjs tmp/pstack-architecture-plan/followup-reads/benchmark.mjs measure-v4 256 8192
env -i PATH="$PATH" node tmp/pstack-architecture-plan/followup-reads/run.mjs tmp/pstack-architecture-plan/followup-reads/benchmark.mjs measure-v4 256 0
env -i PATH="$PATH" node tmp/pstack-architecture-plan/followup-reads/run.mjs tmp/pstack-architecture-plan/followup-reads/benchmark.mjs profile 256 8192
env -i PATH="$PATH" node tmp/pstack-architecture-plan/followup-reads/run.mjs tmp/pstack-architecture-plan/followup-reads/analyze.mjs
```

All six final producer kinds exit 0. The parent independently reran the 23 behavior observations with zero unexpected failures. Earlier exploratory build failures and v1-v3 measurements remain in local receipts. Only v4 supplies the selected timing evidence, with source-matched creation-time indexes. `sources.json` and `analysis.json` identify code, lockfile, package versions and statistics. Canonical measurements are `measure-v4-8192.json`, `measure-v4-0.json` and `explain-8192.json`.

The measured path includes the actual adapter/catalog/drain, runtime callable validation, serial transaction executor, database reader, codec, projection, public parser and consumed final JSON serialization. PGlite replaces pool transport. A scratch registry selects the unchanged ordinary handler or candidate SQL reader. Cache wrappers are identity functions on both sides. Fixture load, module initialization, ANALYZE, output comparison, hashing and profiling are outside timings. Concurrency is one. Five alternating first-read pairs and seven alternating warm pairs per distribution produce 48 measured drains. All return 256 identical rows with zero errors. First-read means a freshly loaded in-memory database, not cold storage or process startup.

The 8 KiB fixture hash is `24f0cb0929d32d96f9b051988b911b5dd4c8803b2d7ed393146437c5e349e1c2`. Final JSON is 544,585 bytes with SHA-256 `bee4191898868fc8cd1ea7fbc5cd3186c9327c1d5344951b976770971ba462d9`. SQL-row JSON falls 94.38%; that is not measured wire traffic. Warm medians are 62.49 and 40.88 ms over seven runs per side, with overlapping ranges. First-read medians are 65.19 and 43.45 ms over five per side. The empty-text fixture hash is `8e00fec5dcd3e32907a5d12bfce292c202e449cb0bf68c855f8976a7f513bbf4`; its warm medians are 39.01 and 36.00 ms and its first-read medians 44.04 and 41.59 ms. Its small gaps are within run-to-run variation. Do not promise a universal or production speedup.

The separate 15-drain profiles locate removable WASM materialization and document decoding work. Warm phase medians in the large-field fixture fall from 32.22 to 17.92 ms for SQL/result materialization and 26.63 to 18.79 ms for remaining runtime/codec/projection work. Public parsing/drain/serialization stays 3.90 versus 3.86 ms. Phase medians do not sum to whole-run medians. Shared-machine load rose from 3.84 to 35.67 on 24 logical CPUs and finished at 27.67. Alternation mitigates that noise but does not remove it. Remote Postgres, production pool behavior, corpus distribution, network, cache hits and cost remain unmeasured. Adopt the bounded projection because it removes observed unused work with identical tested output. Reject broader SQL rewriting.

Behavior probes also close the parser and enrichment questions. The native taxonomy validator rejects all three malformed return variants. Library malformed envelopes reject, while malformed rows retain their existing filter policy. Missing compact summaries remain optional. Select a content-only enrichment whitelist so summaries cannot replace canonical identity or tags. Remove the actual taxonomy `Server Error` and missing-callable compatibility catches, preserving valid empty results and explicit readiness handling.

### UI and operator alternatives

Run `python3 tmp/pstack-architecture-plan/followup-root/run.py`. Its UI, operator and existing-test producers each exit 0. `run-results.json`, `ui-result.json`, `operator-result.json` and `report.md` contain the receipts. Bun receives `--no-env-file`. No database connection opens, and the UI fetch trap records zero calls.

The heading-only frame produces identical SSR markup in 84 cases, 21 registry descriptors under four role labels. This does not assert access to every descriptor for every role. A synthetic label change updates both rail and actual heading. Reject automatic save lines because they describe private Playlists as live; preserve the three shell-owned save-line descriptors and feature overrides. Browser widths, focus and touch are acceptance checks for future implementation, not unobserved improvements claimed here.

Five aggregate operator-authorization refusals produce zero fake effects. A complete synthetic loopback ceremony is accepted, and a dry run performs zero effects. The partial `executeProductionWrite` helper alone invokes one fake callback under freeze. That helper is not the aggregate authorizer; no deployed bypass follows. Keep command families, destructive confirmations and guarded clients. Existing production-write-command and surface-inventory tests pass 13/13 and 135/135, or 148/148 across two files. Do not replace those owners with a universal write wrapper.

### Provenance and remaining acceptance

The final independent Codex review found no blocking issues after inspecting the plan, selected raw receipts, scratch diffs and source manifests. The parent independently reran article, exit, boundary, read-behavior, UI and operator producers. Source manifests pin baseline inputs. All follow-up delegates used Codex GPT-6.1-Sol. Local execution uses synthetic records, isolated PGlite or fakes, sanitized environments and no live corpus. Dependency installation used the frozen lockfile with lifecycle scripts disabled. No application source, lockfile or generated output is part of the commit.

The decisions above leave no design question for Josie to resolve before reviewing the plan. Actual implementation still needs its own generated schema migration, full target checks, relevant application type/lint/build checks, multi-connection local Postgres rehearsal, browser journeys and independent acceptance. No production access, paid API, push, merge or deployment is authorized by this document.
