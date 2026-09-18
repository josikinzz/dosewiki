export type HotspotThreshold = {
  file: string;
  maxLoc: number;
  reason: string;
};

export type CleanupMetricCategory =
  | "activeLogic"
  | "test"
  | "staticRegistry"
  | "cohesiveDocument";

export type CleanupMetricBudget = {
  maxLoc: number;
  reason: string;
};

export type CleanupMetricBudgetException = {
  file: string;
  maxLoc: number;
  owner: string;
  reason: string;
  reviewDate: string;
};

export const CLEANUP_METRIC_CATEGORY_BUDGETS: Record<
  CleanupMetricCategory,
  CleanupMetricBudget
> = {
  activeLogic: {
    maxLoc: 500,
    reason: "Active logic files over 500 LOC require reviewed cleanup exception metadata.",
  },
  test: {
    maxLoc: 500,
    reason: "Test files over 500 LOC require reviewed cleanup exception metadata or focused fixture decomposition.",
  },
  staticRegistry: {
    maxLoc: 500,
    reason: "Static registries over 500 LOC require reviewed ownership and a bounded budget.",
  },
  cohesiveDocument: {
    maxLoc: 500,
    reason: "Cohesive document components over 500 LOC require reviewed ownership and a bounded budget.",
  },
};

export const CLEANUP_METRIC_STATIC_REGISTRY_FILES = new Set([
  "server/schema.ts",
  "src/data/config/sourceFavicons.ts",
  "src/features/psychoactive-summaries/summaryDefinitions.ts",
  "src/features/theme-lab/palettePresets.ts",
  "src/features/theme-lab/paletteTokens.ts",
  "src/schema/substance/sectionCatalog.ts",
]);

export const CLEANUP_METRIC_COHESIVE_DOCUMENT_FILES = new Set([
  "src/app/docs/code/page.tsx",
  "src/app/docs/how/page.tsx",
  "src/app/docs/license/page.tsx",
]);

// Reviewed file-specific budgets and focused post-decomposition thresholds follow.
export const CLEANUP_METRIC_BUDGET_EXCEPTIONS: CleanupMetricBudgetException[] = [
  {
    file: "scripts/citations/formal-citations-core.mjs",
    maxLoc: 1200,
    owner: "citations-maintainers",
    reason: "Existing formal citation orchestration hotspot retained until TN-031 decomposition.",
    reviewDate: "2026-05-28",
  },
  {
    file: "scripts/citations/formal-citations-contract.mjs",
    maxLoc: 800,
    owner: "citations-maintainers",
    reason: "Existing citation contract hotspot retained until TN-031 decomposition.",
    reviewDate: "2026-05-28",
  },
  {
    file: "scripts/citations/wikipedia-source-enrichment.mjs",
    maxLoc: 525,
    owner: "citations-maintainers",
    reason: "Existing citation enrichment workflow retained until citation tooling decomposition.",
    reviewDate: "2026-05-28",
  },
  {
    file: "scripts/citations/workbench-draft-adapter.mjs",
    maxLoc: 600,
    owner: "citations-maintainers",
    reason: "Workbench draft adaptation remains consolidated while subsection-scoped apply and validation behavior stabilizes.",
    reviewDate: "2026-07-26",
  },
  {
    file: "lib/parserContracts.test.ts",
    maxLoc: 800,
    owner: "parser-maintainers",
    reason: "Broad parser contract fixture coverage retained while parser families are consolidated.",
    reviewDate: "2026-05-28",
  },
  {
    file: "src/schema/substance/sectionCatalog.ts",
    maxLoc: 725,
    owner: "schema-maintainers",
    reason: "Central section catalog retained as one explicit domain registry.",
    reviewDate: "2026-05-28",
  },
  {
    file: "server/citationEvidence.ts",
    maxLoc: 810,
    owner: "citation-evidence-maintainers",
    reason: "Existing Postgres citation evidence workflow retained until backend function split.",
    reviewDate: "2026-06-04",
  },
  {
    file: "src/components/common/ArticleSection.tsx",
    maxLoc: 550,
    owner: "ui-system-maintainers",
    reason: "Shared article lane primitives retained together until the next component ownership split.",
    reviewDate: "2026-06-04",
  },
  {
    file: "src/components/layout/Header.tsx",
    maxLoc: 675,
    owner: "ui-system-maintainers",
    reason: "Accessible desktop dropdown and mobile accordion navigation remain colocated while shared route chrome stabilizes.",
    reviewDate: "2026-07-29",
  },
  {
    file: "lib/citations/citationPlacement.mjs",
    maxLoc: 600,
    owner: "citations-maintainers",
    reason: "Shared citation placement logic retained as a compatibility helper for CommonJS script consumers.",
    reviewDate: "2026-06-01",
  },
  {
    file: "scripts/citations/formal-citations-source-resolver.test.mjs",
    maxLoc: 600,
    owner: "citations-maintainers",
    reason: "Source resolver fixture coverage retained while citation source matching remains evidence-sensitive.",
    reviewDate: "2026-06-01",
  },
  {
    file: "src/app/docs/how/page.tsx",
    maxLoc: 3400,
    owner: "public-docs-maintainers",
    reason: "Long-form public workflow explainer retained as a single scroll narrative until docs content is split into data-driven sections.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/app/docs/code/page.tsx",
    maxLoc: 1550,
    owner: "public-docs-maintainers",
    reason: "Long-form public codebase explainer retained as a single visual document until reusable docs section composition is extracted.",
    reviewDate: "2026-07-03",
  },
  {
    file: "src/app/docs/license/page.tsx",
    maxLoc: 1250,
    owner: "public-docs-maintainers",
    reason: "Long-form public license/provenance explainer retained together while licensing copy and generated provenance display stabilize.",
    reviewDate: "2026-07-03",
  },
  {
    file: "src/app/api/save-article/route.test.ts",
    maxLoc: 550,
    owner: "api-maintainers",
    reason: "Save-to-Postgres API regression coverage retained with broad auth, validation, and write-path fixtures.",
    reviewDate: "2026-07-03",
  },
  {
    file: "src/features/dev/tools/molecule-editor/MoleculeEditorTab.tsx",
    maxLoc: 1550,
    owner: "chemistry-tooling-maintainers",
    reason: "Molecule editor retains fine-rotation settings with the SVG override workflow while generated molecule review tooling is still changing.",
    reviewDate: "2026-08-05",
  },
  {
    file: "src/features/dev/tools/citation-review/CitationReviewPanels.tsx",
    maxLoc: 525,
    owner: "dev-tools-maintainers",
    reason: "Citation review panel collection retained until citation evidence dashboard panels are split by responsibility.",
    reviewDate: "2026-07-03",
  },
  {
    file: "src/features/dev/pages/useDevModeSaveActions.tsx",
    maxLoc: 575,
    owner: "dev-tools-maintainers",
    reason: "Existing dev save-action orchestration retained until document-owned write command extraction.",
    reviewDate: "2026-06-12",
  },
  {
    file: "src/features/article/components/sections/SectionHotspots.test.tsx",
    maxLoc: 628,
    owner: "article-section-maintainers",
    reason: "Cross-section regression coverage stays consolidated while hotspot behavior remains shared across article sections.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/features/reports/submissions/TripReportSubmissionPage.tsx",
    maxLoc: 1250,
    owner: "reports-maintainers",
    reason: "Public trip report intake flow retained as one launch surface pending post-release form-section extraction.",
    reviewDate: "2026-06-12",
  },
  {
    file: "src/features/theme-lab/ThemeLab.tsx",
    maxLoc: 1350,
    owner: "ui-system-maintainers",
    reason: "Interactive palette surface retained as one public community tool until post-launch panel decomposition.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/features/theme-lab/palettePresets.ts",
    maxLoc: 925,
    owner: "ui-system-maintainers",
    reason: "Palette preset definitions remain colocated while the palette workflow is still evolving.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/features/theme-lab/paletteTokens.ts",
    maxLoc: 800,
    owner: "ui-system-maintainers",
    reason: "Palette token registry retained with Theme Lab while theme token migration remains active.",
    reviewDate: "2026-07-03",
  },
  {
    file: "src/data/builders/search.ts",
    maxLoc: 925,
    owner: "search-maintainers",
    reason: "Search index builder retained as a consolidated data projection while Postgres/public search contracts stabilize.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/data/builders/search.test.ts",
    maxLoc: 700,
    owner: "search-maintainers",
    reason: "Search builder regression fixture coverage retained with the oversized projection module.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/data/config/sourceFavicons.ts",
    maxLoc: 1300,
    owner: "data-config-maintainers",
    reason: "Large static source favicon mapping retained until generated/source-owned metadata replaces the hand-maintained registry.",
    reviewDate: "2026-06-12",
  },
  {
    file: "scripts/data/generate-further-reading-favicons.mjs",
    maxLoc: 600,
    owner: "data-config-maintainers",
    reason: "Favicon generation workflow retained while source metadata and public citation references are consolidated.",
    reviewDate: "2026-06-12",
  },
  {
    file: "scripts/build/generateEntitySocialCards.ts",
    maxLoc: 982,
    owner: "build-systems-maintainers",
    reason: "Entity social-card reads, media fallback, digesting, and atomic manifest publication remain colocated while the four generated card families stabilize.",
    reviewDate: "2026-08-25",
  },
  {
    file: "scripts/review/build-review-plan.ts",
    maxLoc: 625,
    owner: "data-ops-maintainers",
    reason: "Review-plan orchestration remains consolidated while the deterministic transformation and refusal workflow stabilizes.",
    reviewDate: "2026-08-18",
  },
  {
    file: "scripts/research/collect-psychonautwiki-2015-subjective-effects.mjs",
    maxLoc: 650,
    owner: "research-tooling-maintainers",
    reason: "One-off subjective-effects research collector retained for reproducible provenance until archived or decomposed.",
    reviewDate: "2026-06-21",
  },
  {
    file: "scripts/data-ops/apply-dose-table-tolerance-plagiarism-rewrites.mjs",
    maxLoc: 550,
    owner: "data-ops-maintainers",
    reason: "Plagiarism rewrite application workflow retained as a guarded data operation until the rewrite pipeline is consolidated.",
    reviewDate: "2026-06-21",
  },
  {
    file: "scripts/data-ops/route-equivalence-fill.mjs",
    maxLoc: 575,
    owner: "data-ops-maintainers",
    reason: "Route-equivalence backfill retained as a guarded migration utility until route normalization is fully centralized.",
    reviewDate: "2026-06-21",
  },
  {
    file: "scripts/data-ops/apply-subjective-effects-import.ts",
    maxLoc: 750,
    owner: "data-ops-maintainers",
    reason: "Subjective-effects import workflow retained as a guarded Postgres data operation pending importer decomposition.",
    reviewDate: "2026-06-21",
  },
  {
    file: "scripts/analyze/public-prose-artifact-language-core.mjs",
    maxLoc: 550,
    owner: "content-quality-maintainers",
    reason: "Public prose artifact and named-source audit core retained together while generated-section remediation remains active.",
    reviewDate: "2026-06-21",
  },
  {
    file: "scripts/analyze/plagiarism-audit-core.mjs",
    maxLoc: 575,
    owner: "content-quality-maintainers",
    reason: "Shared plagiarism audit core retained as one workflow module while citation-backed rewrite tooling stabilizes.",
    reviewDate: "2026-06-21",
  },
  {
    file: "src/features/article/components/sections/LegalitySection.tsx",
    maxLoc: 625,
    owner: "article-section-maintainers",
    reason: "Country legality presentation remains colocated while the section's structured status and citation rendering are being stabilized.",
    reviewDate: "2026-08-01",
  },
  {
    file: "src/features/article/components/sections/DosageDurationSection.routes.test.tsx",
    maxLoc: 635,
    owner: "article-section-maintainers",
    reason: "Route-level dosage and duration regression coverage remains consolidated around the shared section contract.",
    reviewDate: "2026-08-01",
  },
  {
    file: "src/features/article/components/sections/PilotSectionCitations.test.tsx",
    maxLoc: 606,
    owner: "article-section-maintainers",
    reason: "Pilot citation rendering fixtures remain colocated while section citation behavior stabilizes.",
    reviewDate: "2026-08-01",
  },
  {
    file: "server/substanceIndex.ts",
    maxLoc: 650,
    owner: "data-runtime-maintainers",
    reason: "Substance index reads and guarded mutations remain together while the canonical read model stabilizes.",
    reviewDate: "2026-08-05",
  },
  {
    file: "lib/data/publicData.reads.ts",
    maxLoc: 826,
    owner: "data-runtime-maintainers",
    reason: "Public read projections remain consolidated while the shared DoseWiki and Effect Index query surface stabilizes.",
    reviewDate: "2026-07-28",
  },
  {
    file: "src/features/psychoactive-summaries/summaryDefinitions.ts",
    maxLoc: 558,
    owner: "content-model-maintainers",
    reason: "One typed route/content registry keeps translated prose keys, selection metadata and cross-links reviewable together; rendering and translation runtime remain outside this static definition.",
    reviewDate: "2026-09-13",
  },
  {
    file: "scripts/lib/data-ops-run-context.mjs",
    maxLoc: 550,
    owner: "data-ops-maintainers",
    reason: "Production write safeguards and deployment-target validation remain together until the shared operation contract is decomposed.",
    reviewDate: "2026-07-12",
  },
  // Reviewed 2026-09-01 baseline. Caps equal the measured LOC, so retained
  // cleanup debt cannot grow without another explicit review.
  { file: "src/app/_components/AppearanceControls.test.tsx", maxLoc: 829, owner: "ui-system-maintainers", reason: "Reviewed accessible controls, shared-provider interaction, publication locks and pointer/keyboard fixtures remain together; incidental CSS-token and class-forwarding assertions were removed.", reviewDate: "2026-09-12" },
  {"file": "src/context/ThemeContext.test.tsx", "maxLoc": 683, "owner": "ui-system-maintainers", "reason": "The suite exercises the ThemeProvider consumer contract across publication policy, hydration, persistence, migrations, locked axes, palette coordinates, and deferred writes; its size is driven by stateful browser fixtures and boundary coverage rather than unrelated ownership.", "reviewDate": "2026-09-12"},
  { file: "src/data/contributorRoster.test.ts", maxLoc: 537, owner: "replication-index-maintainers", reason: "Contributor identity and alias contract fixtures remain consolidated while the roster projection stabilizes.", reviewDate: "2026-09-01" },
  {"file": "src/data/substanceReplicationGallery.test.ts", "maxLoc": 635, "owner": "replication-index-maintainers", "reason": "The suite is one substance-gallery projection contract covering target parsing, canonical title identity, eligibility and ordering, digest parity, curated merging, direct associations, and curation normalization.", "reviewDate": "2026-09-12"},
  { file: "src/features/dev/tools/molecule-editor/MoleculeEditorTab.interactions.test.tsx", maxLoc: 535, owner: "chemistry-tooling-maintainers", reason: "Molecule editor interaction fixtures remain colocated pending helper extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/dev/tools/replication-studio/ReplicationAssociationsPanel.tsx", maxLoc: 595, owner: "replication-studio-maintainers", reason: "Replication association editing remains consolidated pending command and presentation extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/dev/tools/replication-studio/useSubstanceGalleryController.ts", maxLoc: 599, owner: "replication-studio-maintainers", reason: "Gallery editor state and command coordination remain colocated pending controller decomposition.", reviewDate: "2026-09-01" },
  { file: "src/features/effects/gallery/galleryModel.test.ts", maxLoc: 739, owner: "effects-gallery-maintainers", reason: "Shared replication fixtures defend grouping, identity, ordering, filtering, URL keys and counts across focused model modules; six additional import lines reflect the semantic source split, not new test cases.", reviewDate: "2026-09-13" },
  { file: "src/features/replications/ReplicationsGalleryExplorer.test.tsx", maxLoc: 1478, owner: "replication-index-maintainers", reason: "Shared corpus, native-history, viewer and deferred-fetch fixtures defend one gallery navigation contract; assertions now observe resulting URLs while preserving push/replace and pending-action semantics, not CSS or forwarding tuples.", reviewDate: "2026-09-12" },
  { file: "src/features/replications/ReplicationsGalleryExplorer.tsx", maxLoc: 1588, owner: "replication-index-maintainers", reason: "Public gallery orchestration remains consolidated pending state, filter, and rendering decomposition.", reviewDate: "2026-09-01" },
  {"file": "src/features/replications/components/ReplicationShowcase.test.tsx", "maxLoc": 804, "owner": "replication-index-maintainers", "reason": "The suite coherently covers the article/effect showcase contract from projection and ordering through rail interaction, attribution, media control, lazy collection completion, and shared-viewer handoff.", "reviewDate": "2026-09-12"},
  { file: "src/features/replications/components/ReplicationShowcase.tsx", maxLoc: 752, owner: "replication-index-maintainers", reason: "Showcase media, metadata, and attribution presentation remain colocated while the public card stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationMediaStage.test.tsx", maxLoc: 1341, owner: "replication-viewer-maintainers", reason: "Viewer media fixtures remain consolidated pending media-specific test extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationMediaStage.tsx", maxLoc: 1166, owner: "replication-viewer-maintainers", reason: "Image and video stage behavior remains consolidated pending media-mode component extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationViewerOverlay.test.tsx", maxLoc: 1194, owner: "replication-viewer-maintainers", reason: "Viewer navigation, focus, attribution, and editing fixtures remain consolidated pending helper extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationViewerOverlay.tsx", maxLoc: 1464, owner: "replication-viewer-maintainers", reason: "Viewer overlay navigation and presentation remain consolidated pending controller and chrome decomposition.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/editor/ReplicationViewerEditorPanel.tsx", maxLoc: 677, owner: "replication-viewer-maintainers", reason: "Viewer editor fields and guarded saves remain colocated while the editor contract stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/theme/index.test.ts", maxLoc: 605, owner: "ui-system-maintainers", reason: "Executable pre-paint restoration, migration, stylesheet adoption and publication-lock scenarios share browser fixtures; generated-source scans and incidental manifest inventories were removed.", reviewDate: "2026-09-12" },
  { file: "lib/data/contributorProfileImports.test.ts", maxLoc: 870, owner: "replication-index-maintainers", reason: "Contributor import normalization and collision fixtures remain consolidated while the import contract stabilizes.", reviewDate: "2026-09-01" },
  {"file": "server/lib/contributorProfileImports.ts", "maxLoc": 698, "owner": "replication-index-maintainers", "reason": "Reviewed contributor-profile import and its exact rollback remain one evidence-bound reversible mutation workflow, with shared canonicalization, collision checks, validators, and stored snapshots kept together.", "reviewDate": "2026-09-12"},
  { file: "server/lib/replicationWrites.ts", maxLoc: 792, owner: "replication-index-maintainers", reason: "Shared replication write validation and mutation helpers remain together while the write contract stabilizes.", reviewDate: "2026-09-01" },
  { file: "server/replicationIdentitySocial.ts", maxLoc: 1088, owner: "replication-index-maintainers", reason: "Identity, verification, and social rollout functions remain consolidated until the completed migration surface is decomposed.", reviewDate: "2026-09-01" },
  { file: "server/substanceGalleries.ts", maxLoc: 753, owner: "replication-index-maintainers", reason: "Substance gallery reads and guarded mutations remain colocated while the gallery contract stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/citations/verdict-apply.mjs", maxLoc: 559, owner: "citations-maintainers", reason: "Citation verdict application and validation remain together while the guarded workflow stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/citations/verdict-apply.test.mjs", maxLoc: 586, owner: "citations-maintainers", reason: "Citation verdict application fixtures remain consolidated pending shared fixture extraction.", reviewDate: "2026-09-01" },
  { file: "scripts/contributors/upload-replication-index-profile-avatars.test.ts", maxLoc: 709, owner: "replication-index-maintainers", reason: "Avatar upload safety and rollback fixtures remain consolidated while the guarded publisher stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/contributors/upload-replication-index-profile-avatars.ts", maxLoc: 1779, owner: "replication-index-maintainers", reason: "Avatar validation, immutable delivery, Postgres update, and rollback handling remain together in the guarded publisher.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/apply-editorial-review-notes-v3.mjs", maxLoc: 592, owner: "replication-index-maintainers", reason: "Versioned editorial review application remains retained for reproducible historical data operations.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/apply-editorial-review-notes.mjs", maxLoc: 632, owner: "replication-index-maintainers", reason: "Editorial review application and validation remain together while the review-note workflow stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/build-current-library-taxonomy.mjs", maxLoc: 662, owner: "replication-index-maintainers", reason: "Current-library taxonomy reconciliation remains consolidated while the deterministic projection stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/identity-social/projection.mjs", maxLoc: 660, owner: "replication-index-maintainers", reason: "Identity and social projection remains consolidated to preserve deterministic operation ordering and hashes.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/import-replication-taxonomy.mjs", maxLoc: 562, owner: "replication-index-maintainers", reason: "Replication taxonomy import and validation remain together while the guarded importer stabilizes.", reviewDate: "2026-09-01" },
  {"file": "lib/postgres/runtime/db.ts", "maxLoc": 520, "owner": "postgres-runtime-maintainers", "reason": "The Postgres-compatible database reader/writer is retained as one transaction-local semantic implementation; separating its query expression, index-range, and row-conversion machinery would expose or duplicate private runtime contracts.", "reviewDate": "2026-09-12"},
  {"file": "server/schema.ts", "maxLoc": 600, "owner": "schema-maintainers", "reason": "The authoritative Postgres table-and-index registry remains centralized so generated ownership, relation names, private/public storage boundaries, and write-safety indexes are reviewed atomically.", "reviewDate": "2026-09-12"},
  {"file": "scripts/translation/freeodwiki-pages.mjs", "maxLoc": 545, "owner": "translation-maintainers", "reason": "FreeODwiki page builders are retained as one output-format renderer registry sharing the same assembly, escaping, link-resolution, prose, and citation context.", "reviewDate": "2026-09-12"},
  {"file": "scripts/postgres/rehearse-reports-feedback.ts", "maxLoc": 550, "owner": "data-ops-maintainers", "reason": "The report-intake, promotion, publication-update, privacy, and feedback checks remain one scratch-data rehearsal because transaction rollback and cleanup evidence depend on a single tagged lifecycle.", "reviewDate": "2026-09-12"},
  {"file": "scripts/postgres/rehearse-release.ts", "maxLoc": 700, "owner": "data-ops-maintainers", "reason": "The release rehearsal is intentionally one lifecycle: prove writes before freeze, global refusal and drain during freeze, backend rollback, reopening, flavor/privacy invariants, recovery evidence, measurements, sweep accounting, and guaranteed scratch cleanup in one report.", "reviewDate": "2026-09-12"},
  {"file": "src/features/dev/tools/molecule-editor/OclEditor.tsx", "maxLoc": 575, "owner": "chemistry-tooling-maintainers", "reason": "The OpenChemLib instance lifecycle, shadow-DOM toolbar bridge, source synchronization, and bond-pick overlay form one imperative adapter contract; the pure molecule operations and toolbar geometry are already isolated in moleculeTransforms.ts and oclToolbar.ts.", "reviewDate": "2026-09-12"},
  {"file": "src/features/dev/tools/molecule-editor/MoleculeEditorWorkbench.tsx", "maxLoc": 518, "owner": "chemistry-tooling-maintainers", "reason": "Canvas availability, transform controls, tracing overlay, responsive preview/settings, chemistry guard, and save controls are one molecule-editing workbench composition contract; stateful chemistry and rendering logic already live in sibling modules.", "reviewDate": "2026-09-12"},
  {"file": "src/features/dev/tools/feedback/FeedbackReviewQueue.tsx", "maxLoc": 550, "owner": "dev-tools-maintainers", "reason": "The generic feedback source adapter, race-safe load/selection state, draft guard, transition confirmation, and master-detail rendering jointly implement one reusable feedback-review lifecycle for article and site feedback.", "reviewDate": "2026-09-12"},
  {"file": "src/features/dev/pages/DevModeChangeLogTab.tsx", "maxLoc": 525, "owner": "dev-tools-maintainers", "reason": "Filtering, loaded-window disclosure, expansion state, entry actions, and diff rendering are one controller-driven save-history browsing contract; data fetching and filter/action state are already extracted.", "reviewDate": "2026-09-12"},
  {"file": "src/features/replications/viewer/ViewerMediaTrack.tsx", "maxLoc": 596, "owner": "replication-viewer-maintainers", "reason": "The fixed five-slot media pool, each slot's media-element custody, neighbor preparation, and two-axis gesture commit protocol form one lifecycle invariant: slots stay mounted and rotate identities without replacing the active player. Keep this implementation together at its measured bound.", "reviewDate": "2026-09-12"},
  {"file": "src/features/replications/viewer/ViewerTransport.tsx", "maxLoc": 790, "owner": "replication-viewer-maintainers", "reason": "The transport is the single owner of gesture-safe playback intent and accessible chrome for the currently active pooled element. Buffering, sound custody, seek state, visibility/focus recovery, and the rendered controls must remain synchronized to one element binding; retain them together at the measured bound.", "reviewDate": "2026-09-12"},
  {"file": "src/features/article/components/sections/HeroSection.tsx", "maxLoc": 544, "owner": "article-section-maintainers", "reason": "This is one cohesive article-introduction document section: molecule placement, title and identification, classification, chemistry disclosure, categories, and summary share the same editable article fields and responsive hero layout. Retain it at the current measured bound.", "reviewDate": "2026-09-12"},
  {"file": "src/features/replications/viewer/ViewerTransport.test.tsx", "maxLoc": 625, "owner": "replication-viewer-maintainers", "reason": "The file is a single transport consumer-contract suite whose size comes from media-element state, imperative-handle, accessibility, recovery, chrome, seek, rotation, fullscreen, and pooled-node edge coverage.", "reviewDate": "2026-09-12"},
  {"file": "lib/dataChangeProposals.test.ts", "maxLoc": 527, "owner": "article-editor-maintainers", "reason": "The suite coherently exercises the server-visible change-proposal lifecycle: submission, baseline hashing and provenance, authorization, validation, listings, detail privacy, comments, identities, and derived targets.", "reviewDate": "2026-09-12"},
  { file: "src/middleware.test.ts", maxLoc: 813, owner: "platform-maintainers", reason: "One request-boundary matrix covers interacting host, role, redirect, rewrite, CSP, cache, framing and publication-flavor policies with shared request/session fixtures. Reviewed locale category cases preserve App Paths and query state on mirror hosts without rewriting English-host routes.", reviewDate: "2026-09-13" },
  { file: "lib/data/publicData.replications.test.ts", maxLoc: 608, owner: "replication-index-maintainers", reason: "Public replication reads share corpus and deployment-fallback fixtures; query-forwarding and warning pins were removed. Completeness, ordering and publishability remain observable contracts, including 176-artist and 205-work regressions across cache batches under constrained checkout capacity.", reviewDate: "2026-09-13" },
];
export const HOTSPOT_THRESHOLDS: HotspotThreshold[] = [
  {
    file: "scripts/parsers/base.ts",
    maxLoc: 250,
    reason: "Keep the parser facade thin after the domain split.",
  },
  {
    file: "scripts/batch/batch-generate-pharmacology.mjs",
    maxLoc: 250,
    reason: "Keep the batch entrypoint thin after pipeline extraction.",
  },
  {
    file: "src/features/dev/pages/DevModePage.tsx",
    maxLoc: 120,
    reason: "Keep the `/dev` shell as a thin composition layer.",
  },
  {
    file: "src/features/dev/pages/useDevModePageController.ts",
    maxLoc: 450,
    reason: "Track controller growth while the remaining `/dev` hotspots are still being decomposed.",
  },
  {
    file: "src/features/effects/vcode/VCodeRenderer.tsx",
    maxLoc: 150,
    reason: "Keep recursion/orchestration separate from renderer definitions.",
  },
  {
    file: "src/features/effects/vcode/renderers.tsx",
    maxLoc: 467,
    reason: "Bound the exhaustive renderer registry at its reviewed measured size; new VCode node semantics require another explicit review rather than silently growing beyond the registry's current scope.",
  },
  {
    file: "src/features/dev/tools/molecule-editor/OclEditor.tsx",
    maxLoc: 575,
    reason: "Keep the imperative OpenChemLib adapter bounded at its reviewed size; pure molecule transformations and toolbar geometry must remain in moleculeTransforms.ts and oclToolbar.ts.",
  },
  {
    file: "src/features/dev/tools/molecule-editor/moleculeTransforms.ts",
    maxLoc: 250,
    reason: "Keep molecule coordinate and bold-bond transformations focused and UI-independent.",
  },
];
