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
    maxLoc: 750,
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
    file: "src/features/dev/tools/review-mode/ReviewExperience.tsx",
    maxLoc: 1850,
    owner: "dev-tools-maintainers",
    reason: "Dedicated review route orchestration remains consolidated while queue navigation, settings, and completion feedback stabilize.",
    reviewDate: "2026-08-05",
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
    maxLoc: 575,
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
    file: "src/features/theme-lab/PaletteLab.tsx",
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
    maxLoc: 625,
    owner: "article-section-maintainers",
    reason: "Route-level dosage and duration regression coverage remains consolidated around the shared section contract.",
    reviewDate: "2026-08-01",
  },
  {
    file: "src/features/article/components/sections/PilotSectionCitations.test.tsx",
    maxLoc: 575,
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
    maxLoc: 775,
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
