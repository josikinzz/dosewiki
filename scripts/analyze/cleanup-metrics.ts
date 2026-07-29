import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { pathToFileURL } from "url";

const ROOTS = ["src", "lib", "api", "convex", "scripts", "eslint-plugins"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED_DIRS = new Set(["node_modules", ".next", "dist", "coverage"]);

type FileMetrics = {
  file: string;
  loc: number;
  generated: boolean;
  configHeavy: boolean;
  deprecated: boolean;
};

type HotspotThreshold = {
  file: string;
  maxLoc: number;
  reason: string;
};

type CleanupMetricCategory = "activeLogic";

type CleanupMetricBudget = {
  maxLoc: number;
  reason: string;
};

type CleanupMetricBudgetException = {
  file: string;
  maxLoc: number;
  owner: string;
  reason: string;
  reviewDate: string;
};

type CleanupMetricBudgetResult = {
  file: string;
  category: CleanupMetricCategory;
  actualLoc: number;
  budgetLoc: number;
  status: "PASS" | "FAIL";
  reason: string;
  owner?: string;
  reviewDate?: string;
};

export const CLEANUP_METRIC_CATEGORY_BUDGETS: Record<CleanupMetricCategory, CleanupMetricBudget> = {
  activeLogic: {
    maxLoc: 500,
    reason: "Active logic files over 500 LOC require reviewed cleanup exception metadata.",
  },
};

export const CLEANUP_METRIC_BUDGET_EXCEPTIONS: CleanupMetricBudgetException[] = [
  {
    file: "scripts/citations/formal-citations-core.mjs",
    maxLoc: 1200,
    owner: "citations-maintainers",
    reason: "Existing formal citation orchestration hotspot retained until TN-031 decomposition.",
    reviewDate: "2026-05-28",
  },
  {
    file: "scripts/citations/formal-citations-source-resolver.mjs",
    maxLoc: 850,
    owner: "citations-maintainers",
    reason: "Existing citation source resolver hotspot retained until TN-031 decomposition.",
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
    file: "scripts/citations/workbench-draft-adapter.test.mjs",
    maxLoc: 675,
    owner: "citations-maintainers",
    reason: "Workbench adapter regression fixtures remain colocated while subsection-scoped citation coverage stabilizes.",
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
    file: "src/lib/citations/formalCitationsCore.test.ts",
    maxLoc: 560,
    owner: "citations-maintainers",
    reason: "Formal citation core regression coverage retained with implementation hotspot.",
    reviewDate: "2026-05-28",
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
    file: "src/features/dev/tools/citation-review/CitationReviewTab.tsx",
    maxLoc: 550,
    owner: "dev-tools-maintainers",
    reason: "Existing citation review tab hotspot retained pending dev tools decomposition.",
    reviewDate: "2026-05-28",
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
    file: "src/features/dev/tools/trip-report-submissions/TripReportSubmissionReviewTab.tsx",
    maxLoc: 550,
    owner: "reports-maintainers",
    reason: "Trip report submission moderation surface retained as one editor workflow until queue actions and list presentation are split.",
    reviewDate: "2026-07-03",
  },
  {
    file: "src/features/dev/tools/molecule-editor/MoleculeEditorTab.tsx",
    maxLoc: 1425,
    owner: "chemistry-tooling-maintainers",
    reason: "Molecule editor retains fine-rotation settings with the SVG override workflow while generated molecule review tooling is still changing.",
    reviewDate: "2026-07-18",
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
    file: "src/components/common/GlobalSearch.tsx",
    maxLoc: 800,
    owner: "search-maintainers",
    reason: "Shared public search control retained until route-specific search presentation split.",
    reviewDate: "2026-06-21",
  },
  {
    file: "src/components/dev/PaletteLab/PaletteLab.tsx",
    maxLoc: 1350,
    owner: "ui-system-maintainers",
    reason: "Interactive palette inspection surface retained as one dev-only tool until post-launch panel decomposition.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/components/dev/PaletteLab/palettePresets.ts",
    maxLoc: 925,
    owner: "ui-system-maintainers",
    reason: "Palette preset definitions remain colocated while the dev-only palette workflow is still evolving.",
    reviewDate: "2026-07-26",
  },
  {
    file: "src/components/dev/PaletteLab/paletteTokens.ts",
    maxLoc: 800,
    owner: "ui-system-maintainers",
    reason: "Palette token registry retained with Palette Lab while theme token migration remains active.",
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
    file: "scripts/analyze/cleanup-metrics.ts",
    maxLoc: 700,
    owner: "repo-maintainers",
    reason: "Cleanup budget policy and reviewed exception metadata retained in one self-auditing script until external policy config is extracted.",
    reviewDate: "2026-07-28",
  },
  {
    file: "src/features/article/components/sections/LegalitySection.tsx",
    maxLoc: 550,
    owner: "article-section-maintainers",
    reason: "Country legality presentation remains colocated while the section's structured status and citation rendering are being stabilized.",
    reviewDate: "2026-07-12",
  },
  {
    file: "lib/next/routeLoaders.tsx",
    maxLoc: 650,
    owner: "next-runtime-maintainers",
    reason: "Route-loader orchestration remains consolidated while publication-specific route composition stabilizes.",
    reviewDate: "2026-07-28",
  },
  {
    file: "lib/next/routeLoaders.test.tsx",
    maxLoc: 700,
    owner: "next-runtime-maintainers",
    reason: "Route-loader coverage stays consolidated around the server rendering boundary.",
    reviewDate: "2026-07-28",
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
  {
    file: "scripts/lib/data-ops-run-context.test.mjs",
    maxLoc: 550,
    owner: "data-ops-maintainers",
    reason: "The run-context contract coverage remains colocated with its guarded production-write behavior.",
    reviewDate: "2026-07-12",
  },
];

const HOTSPOT_THRESHOLDS: HotspotThreshold[] = [
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
    file: "src/features/dev/forms/pharmacologyApplyGenerated.ts",
    maxLoc: 250,
    reason: "Prevent generated-pharmacology application logic from regrowing inside the form flow.",
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
];

function isSourceFile(pathname: string) {
  const extension = pathname.slice(pathname.lastIndexOf("."));
  return SOURCE_EXTENSIONS.has(extension);
}

function walk(dir: string, results: string[] = []) {
  if (!existsSync(dir)) {
    return results;
  }

  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, results);
    } else if (stats.isFile() && isSourceFile(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function countLoc(contents: string) {
  return contents
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}

function collectFileMetrics(file: string): FileMetrics {
  const relativeFile = relative(process.cwd(), file);
  return {
    file: relativeFile,
    loc: countLoc(readFileSync(file, "utf8")),
    generated: relativeFile.includes(".generated."),
    configHeavy: relativeFile.endsWith("fieldOverrides.ts"),
    deprecated: relativeFile.includes("/deprecated/"),
  };
}

function bucketByRoot(files: FileMetrics[]) {
  return ROOTS.reduce<Record<string, { files: number; loc: number; gt300: number; gt500: number }>>(
    (accumulator, root) => {
      const inRoot = files.filter((file) => file.file === root || file.file.startsWith(`${root}/`));
      accumulator[root] = {
        files: inRoot.length,
        loc: inRoot.reduce((sum, file) => sum + file.loc, 0),
        gt300: inRoot.filter((file) => file.loc > 300).length,
        gt500: inRoot.filter((file) => file.loc > 500).length,
      };
      return accumulator;
    },
    {},
  );
}

function formatTableRow(columns: Array<string | number>) {
  return `| ${columns.join(" | ")} |`;
}

function buildCategorySummary(files: FileMetrics[]) {
  const generatedOrConfig = files.filter((file) => file.generated || file.configHeavy);
  const deprecated = files.filter((file) => file.deprecated);
  const activeLogic = files.filter(
    (file) => !file.generated && !file.configHeavy && !file.deprecated,
  );

  return {
    activeLogic: {
      files: activeLogic.length,
      loc: activeLogic.reduce((sum, file) => sum + file.loc, 0),
      gt300: activeLogic.filter((file) => file.loc > 300).length,
      gt500: activeLogic.filter((file) => file.loc > 500).length,
    },
    generatedOrConfig: {
      files: generatedOrConfig.length,
      loc: generatedOrConfig.reduce((sum, file) => sum + file.loc, 0),
      gt300: generatedOrConfig.filter((file) => file.loc > 300).length,
      gt500: generatedOrConfig.filter((file) => file.loc > 500).length,
    },
    deprecated: {
      files: deprecated.length,
      loc: deprecated.reduce((sum, file) => sum + file.loc, 0),
      gt300: deprecated.filter((file) => file.loc > 300).length,
      gt500: deprecated.filter((file) => file.loc > 500).length,
    },
  };
}

function cleanupMetricCategory(file: FileMetrics): CleanupMetricCategory | null {
  if (file.generated || file.configHeavy || file.deprecated) {
    return null;
  }

  return "activeLogic";
}

function hasReviewedExceptionMetadata(exception: CleanupMetricBudgetException) {
  return Boolean(exception.owner?.trim() && exception.reason?.trim() && exception.reviewDate?.trim());
}

export function evaluateCleanupMetricBudgets(
  files: FileMetrics[],
  {
    budgets = CLEANUP_METRIC_CATEGORY_BUDGETS,
    exceptions = CLEANUP_METRIC_BUDGET_EXCEPTIONS,
  }: {
    budgets?: Record<CleanupMetricCategory, CleanupMetricBudget>;
    exceptions?: CleanupMetricBudgetException[];
  } = {},
): CleanupMetricBudgetResult[] {
  return files.flatMap<CleanupMetricBudgetResult>((file) => {
    const category = cleanupMetricCategory(file);
    if (!category) {
      return [];
    }

    const categoryBudget = budgets[category];
    if (!categoryBudget || file.loc <= categoryBudget.maxLoc) {
      return [];
    }

    const exception = exceptions.find((candidate) => candidate.file === file.file);
    if (!exception) {
      return [
        {
          file: file.file,
          category,
          actualLoc: file.loc,
          budgetLoc: categoryBudget.maxLoc,
          status: "FAIL",
          reason: categoryBudget.reason,
        },
      ];
    }

    const hasMetadata = hasReviewedExceptionMetadata(exception);
    return [
      {
        file: file.file,
        category,
        actualLoc: file.loc,
        budgetLoc: exception.maxLoc,
        status: hasMetadata && file.loc <= exception.maxLoc ? "PASS" : "FAIL",
        reason: hasMetadata
          ? exception.reason
          : "Reviewed exception is missing owner, reason, or reviewDate.",
        owner: exception.owner,
        reviewDate: exception.reviewDate,
      },
    ];
  });
}

export function evaluateHotspotThresholds(files: FileMetrics[]) {
  return HOTSPOT_THRESHOLDS.map((threshold) => {
    const match = files.find((file) => file.file === threshold.file);
    return {
      ...threshold,
      actualLoc: match?.loc ?? 0,
      status: match && match.loc <= threshold.maxLoc ? "PASS" : "FAIL",
    };
  });
}

export function collectCleanupMetricCheckFailures({
  hotspotThresholds = [],
  budgetReport = [],
}: {
  hotspotThresholds?: Array<{ status: string }>;
  budgetReport?: Array<{ status: string }>;
}) {
  return [
    ...hotspotThresholds.filter((threshold) => threshold.status === "FAIL"),
    ...budgetReport.filter((result) => result.status === "FAIL"),
  ];
}

export function main() {
  const rootDir = process.cwd();
  const files = ROOTS.flatMap((root) => walk(join(rootDir, root))).map(collectFileMetrics);
  const activeLogicFiles = files.filter((file) => !file.generated && !file.configHeavy && !file.deprecated);
  const byRoot = bucketByRoot(files);
  const byCategory = buildCategorySummary(files);
  const topActiveFiles = [...activeLogicFiles].sort((left, right) => right.loc - left.loc).slice(0, 20);
  const hotspotThresholds = evaluateHotspotThresholds(files);
  const budgetReport = evaluateCleanupMetricBudgets(files);
  const shouldCheck = process.argv.includes("--check");

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          totals: {
            files: files.length,
            loc: files.reduce((sum, file) => sum + file.loc, 0),
            activeLogicFilesOver500: activeLogicFiles.filter((file) => file.loc > 500).length,
            generatedOrConfigFilesOver500: files.filter(
              (file) => (file.generated || file.configHeavy) && file.loc > 500,
            ).length,
          },
          byRoot,
          byCategory,
          hotspotThresholds,
          budgetReport,
          topActiveFiles,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("# Cleanup Metrics\n");
  console.log(
    formatTableRow(["Area", "Files", "LOC", "Files >300 LOC", "Files >500 LOC"]),
  );
  console.log(formatTableRow(["---", "---", "---", "---", "---"]));
  for (const [area, metrics] of Object.entries(byRoot)) {
    console.log(formatTableRow([area, metrics.files, metrics.loc, metrics.gt300, metrics.gt500]));
  }

  console.log("\n## File Categories\n");
  console.log(formatTableRow(["Category", "Files", "LOC", "Files >300 LOC", "Files >500 LOC"]));
  console.log(formatTableRow(["---", "---", "---", "---", "---"]));
  for (const [category, metrics] of Object.entries(byCategory)) {
    console.log(formatTableRow([category, metrics.files, metrics.loc, metrics.gt300, metrics.gt500]));
  }

  console.log("\n## Hotspot Thresholds\n");
  console.log(formatTableRow(["File", "Actual LOC", "Budget", "Status", "Reason"]));
  console.log(formatTableRow(["---", "---", "---", "---", "---"]));
  for (const threshold of hotspotThresholds) {
    console.log(
      formatTableRow([
        threshold.file,
        threshold.actualLoc,
        threshold.maxLoc,
        threshold.status,
        threshold.reason,
      ]),
    );
  }

  console.log("\n## Category Budget Exceptions\n");
  console.log(formatTableRow(["File", "Category", "Actual LOC", "Budget", "Status", "Owner", "Review Date", "Reason"]));
  console.log(formatTableRow(["---", "---", "---", "---", "---", "---", "---", "---"]));
  for (const result of budgetReport) {
    console.log(
      formatTableRow([
        result.file,
        result.category,
        result.actualLoc,
        result.budgetLoc,
        result.status,
        result.owner ?? "",
        result.reviewDate ?? "",
        result.reason,
      ]),
    );
  }

  console.log("\n## Largest Active Logic Files\n");
  console.log(formatTableRow(["File", "LOC"]));
  console.log(formatTableRow(["---", "---"]));
  for (const file of topActiveFiles) {
    console.log(formatTableRow([file.file, file.loc]));
  }

  if (shouldCheck) {
    const failures = collectCleanupMetricCheckFailures({ hotspotThresholds, budgetReport });
    if (failures.length > 0) {
      console.error(
        `\ncleanup-metrics check failed: ${failures.length} cleanup budget or hotspot threshold(s) exceeded.`,
      );
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
