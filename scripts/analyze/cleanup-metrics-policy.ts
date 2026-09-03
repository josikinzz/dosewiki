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
  "convex/schema.ts",
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
    file: "convex/citationEvidence.ts",
    maxLoc: 810,
    owner: "citation-evidence-maintainers",
    reason: "Existing Convex citation evidence workflow retained until backend function split.",
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
    file: "src/app/api/save-to-convex/route.test.ts",
    maxLoc: 550,
    owner: "api-maintainers",
    reason: "Save-to-Convex API regression coverage retained with broad auth, validation, and write-path fixtures.",
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
    reason: "Search index builder retained as a consolidated data projection while Convex/public search contracts stabilize.",
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
    file: "scripts/convex/apply-dose-table-tolerance-plagiarism-rewrites.mjs",
    maxLoc: 550,
    owner: "data-ops-maintainers",
    reason: "Plagiarism rewrite application workflow retained as a guarded data operation until the rewrite pipeline is consolidated.",
    reviewDate: "2026-06-21",
  },
  {
    file: "scripts/convex/route-equivalence-fill.mjs",
    maxLoc: 575,
    owner: "data-ops-maintainers",
    reason: "Route-equivalence backfill retained as a guarded migration utility until route normalization is fully centralized.",
    reviewDate: "2026-06-21",
  },
  {
    file: "scripts/convex/apply-subjective-effects-import.ts",
    maxLoc: 750,
    owner: "data-ops-maintainers",
    reason: "Subjective-effects import workflow retained as a guarded Convex data operation pending importer decomposition.",
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
    file: "convex/substanceIndex.ts",
    maxLoc: 650,
    owner: "convex-runtime-maintainers",
    reason: "Substance index reads and guarded mutations remain together while the canonical read model stabilizes.",
    reviewDate: "2026-08-05",
  },
  {
    file: "lib/convex/publicData.reads.ts",
    maxLoc: 826,
    owner: "convex-runtime-maintainers",
    reason: "Public read projections remain consolidated while the shared DoseWiki and Effect Index query surface stabilizes.",
    reviewDate: "2026-07-28",
  },
  {
    file: "src/features/psychoactive-summaries/summaryDefinitions.ts",
    maxLoc: 550,
    owner: "content-model-maintainers",
    reason: "Static psychoactive summary definitions remain colocated as one reviewable content registry.",
    reviewDate: "2026-07-28",
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
  { file: "src/app/_components/AppearanceControls.test.tsx", maxLoc: 746, owner: "ui-system-maintainers", reason: "Appearance-mode regression fixtures remain consolidated pending focused fixture extraction.", reviewDate: "2026-09-01" },
  { file: "src/context/ThemeContext.test.tsx", maxLoc: 546, owner: "ui-system-maintainers", reason: "Theme context behavior and persistence fixtures remain colocated pending test-helper extraction.", reviewDate: "2026-09-01" },
  { file: "src/context/ThemeContext.tsx", maxLoc: 604, owner: "ui-system-maintainers", reason: "Theme state, persistence, and system-preference coordination remain colocated pending context decomposition.", reviewDate: "2026-09-01" },
  { file: "src/data/contributorRoster.test.ts", maxLoc: 537, owner: "replication-index-maintainers", reason: "Contributor identity and alias contract fixtures remain consolidated while the roster projection stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/data/substanceReplicationGallery.test.ts", maxLoc: 595, owner: "replication-index-maintainers", reason: "Substance gallery projection fixtures remain consolidated while public gallery behavior stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/features/dev/tools/molecule-editor/MoleculeEditorTab.interactions.test.tsx", maxLoc: 535, owner: "chemistry-tooling-maintainers", reason: "Molecule editor interaction fixtures remain colocated pending helper extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/dev/tools/replication-studio/GalleryBoardList.tsx", maxLoc: 746, owner: "replication-studio-maintainers", reason: "Gallery board rendering and editing interactions remain together while the studio workflow stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/features/dev/tools/replication-studio/ReplicationAssociationsPanel.tsx", maxLoc: 595, owner: "replication-studio-maintainers", reason: "Replication association editing remains consolidated pending command and presentation extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/dev/tools/replication-studio/ReplicationStudioTab.tsx", maxLoc: 507, owner: "replication-studio-maintainers", reason: "Studio tab orchestration remains one composition surface pending the next workflow split.", reviewDate: "2026-09-01" },
  { file: "src/features/dev/tools/replication-studio/useSubstanceGalleryController.ts", maxLoc: 599, owner: "replication-studio-maintainers", reason: "Gallery editor state and command coordination remain colocated pending controller decomposition.", reviewDate: "2026-09-01" },
  { file: "src/features/effects/gallery/galleryModel.test.ts", maxLoc: 524, owner: "effects-gallery-maintainers", reason: "Effects gallery model coverage remains consolidated pending shared fixture extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/ReplicationsGalleryExplorer.test.tsx", maxLoc: 1413, owner: "replication-index-maintainers", reason: "Gallery filtering, pagination, and navigation fixtures remain consolidated while the public explorer stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/ReplicationsGalleryExplorer.tsx", maxLoc: 1588, owner: "replication-index-maintainers", reason: "Public gallery orchestration remains consolidated pending state, filter, and rendering decomposition.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/components/ReplicationShowcase.test.tsx", maxLoc: 742, owner: "replication-index-maintainers", reason: "Replication showcase media and attribution fixtures remain consolidated pending helper extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/components/ReplicationShowcase.tsx", maxLoc: 752, owner: "replication-index-maintainers", reason: "Showcase media, metadata, and attribution presentation remain colocated while the public card stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationMediaStage.test.tsx", maxLoc: 1341, owner: "replication-viewer-maintainers", reason: "Viewer media fixtures remain consolidated pending media-specific test extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationMediaStage.tsx", maxLoc: 1166, owner: "replication-viewer-maintainers", reason: "Image and video stage behavior remains consolidated pending media-mode component extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationViewerOverlay.test.tsx", maxLoc: 1194, owner: "replication-viewer-maintainers", reason: "Viewer navigation, focus, attribution, and editing fixtures remain consolidated pending helper extraction.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/ReplicationViewerOverlay.tsx", maxLoc: 1464, owner: "replication-viewer-maintainers", reason: "Viewer overlay navigation and presentation remain consolidated pending controller and chrome decomposition.", reviewDate: "2026-09-01" },
  { file: "src/features/replications/viewer/editor/ReplicationViewerEditorPanel.tsx", maxLoc: 677, owner: "replication-viewer-maintainers", reason: "Viewer editor fields and guarded saves remain colocated while the editor contract stabilizes.", reviewDate: "2026-09-01" },
  { file: "src/theme/index.test.ts", maxLoc: 549, owner: "ui-system-maintainers", reason: "Theme token and appearance contract fixtures remain consolidated pending fixture decomposition.", reviewDate: "2026-09-01" },
  { file: "lib/convex/contributorProfileImports.test.ts", maxLoc: 870, owner: "replication-index-maintainers", reason: "Contributor import normalization and collision fixtures remain consolidated while the import contract stabilizes.", reviewDate: "2026-09-01" },
  { file: "convex/lib/contributorProfileImports.ts", maxLoc: 679, owner: "replication-index-maintainers", reason: "Contributor import normalization and collision handling remain colocated pending backend decomposition.", reviewDate: "2026-09-01" },
  { file: "convex/lib/replicationWrites.ts", maxLoc: 792, owner: "replication-index-maintainers", reason: "Shared replication write validation and mutation helpers remain together while the write contract stabilizes.", reviewDate: "2026-09-01" },
  { file: "convex/replicationIdentitySocial.ts", maxLoc: 1088, owner: "replication-index-maintainers", reason: "Identity, verification, and social rollout functions remain consolidated until the completed migration surface is decomposed.", reviewDate: "2026-09-01" },
  { file: "convex/substanceGalleries.ts", maxLoc: 753, owner: "replication-index-maintainers", reason: "Substance gallery reads and guarded mutations remain colocated while the gallery contract stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/citations/verdict-apply.mjs", maxLoc: 559, owner: "citations-maintainers", reason: "Citation verdict application and validation remain together while the guarded workflow stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/citations/verdict-apply.test.mjs", maxLoc: 586, owner: "citations-maintainers", reason: "Citation verdict application fixtures remain consolidated pending shared fixture extraction.", reviewDate: "2026-09-01" },
  { file: "scripts/contributors/upload-replication-index-profile-avatars.test.ts", maxLoc: 709, owner: "replication-index-maintainers", reason: "Avatar upload safety and rollback fixtures remain consolidated while the guarded publisher stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/contributors/upload-replication-index-profile-avatars.ts", maxLoc: 1779, owner: "replication-index-maintainers", reason: "Avatar validation, immutable delivery, Convex update, and rollback handling remain together in the guarded publisher.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/apply-editorial-review-notes-v3.mjs", maxLoc: 592, owner: "replication-index-maintainers", reason: "Versioned editorial review application remains retained for reproducible historical data operations.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/apply-editorial-review-notes.mjs", maxLoc: 632, owner: "replication-index-maintainers", reason: "Editorial review application and validation remain together while the review-note workflow stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/build-current-library-taxonomy.mjs", maxLoc: 662, owner: "replication-index-maintainers", reason: "Current-library taxonomy reconciliation remains consolidated while the deterministic projection stabilizes.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/identity-social/projection.mjs", maxLoc: 660, owner: "replication-index-maintainers", reason: "Identity and social projection remains consolidated to preserve deterministic operation ordering and hashes.", reviewDate: "2026-09-01" },
  { file: "scripts/replications/import-replication-taxonomy.mjs", maxLoc: 562, owner: "replication-index-maintainers", reason: "Replication taxonomy import and validation remain together while the guarded importer stabilizes.", reviewDate: "2026-09-01" },
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
    maxLoc: 450,
    reason: "Keep the renderer registry bounded while Effect Index panel rendering stabilizes.",
  },
  {
    file: "src/features/dev/tools/molecule-editor/OclEditor.tsx",
    maxLoc: 400,
    reason: "Keep the OpenChemLib wrapper separate from pure molecule transformations.",
  },
  {
    file: "src/features/dev/tools/molecule-editor/moleculeTransforms.ts",
    maxLoc: 250,
    reason: "Keep molecule coordinate and bold-bond transformations focused and UI-independent.",
  },
];
