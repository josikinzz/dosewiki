import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { pathToFileURL } from "url";
import {
  CLEANUP_METRIC_BUDGET_EXCEPTIONS,
  CLEANUP_METRIC_CATEGORY_BUDGETS,
  CLEANUP_METRIC_COHESIVE_DOCUMENT_FILES,
  CLEANUP_METRIC_STATIC_REGISTRY_FILES,
  HOTSPOT_THRESHOLDS,
  type CleanupMetricBudget,
  type CleanupMetricBudgetException,
  type CleanupMetricCategory,
} from "./cleanup-metrics-policy.ts";

const ROOTS = ["src", "lib", "api", "server", "scripts"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED_DIRS = new Set(["node_modules", ".next", "dist", "coverage"]);

type FileMetrics = {
  file: string;
  loc: number;
  generated: boolean;
  configHeavy: boolean;
  deprecated: boolean;
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

function summarizeFiles(files: FileMetrics[]) {
  return {
    files: files.length,
    loc: files.reduce((sum, file) => sum + file.loc, 0),
    gt300: files.filter((file) => file.loc > 300).length,
    gt500: files.filter((file) => file.loc > 500).length,
  };
}

function buildCategorySummary(files: FileMetrics[]) {
  const categories: Record<
    CleanupMetricCategory | "generatedOrConfig" | "deprecated",
    FileMetrics[]
  > = {
    activeLogic: [],
    test: [],
    staticRegistry: [],
    cohesiveDocument: [],
    generatedOrConfig: [],
    deprecated: [],
  };

  for (const file of files) {
    if (file.deprecated) {
      categories.deprecated.push(file);
    } else if (file.generated || file.configHeavy) {
      categories.generatedOrConfig.push(file);
    } else {
      categories[cleanupMetricCategory(file) ?? "activeLogic"].push(file);
    }
  }

  return Object.fromEntries(
    Object.entries(categories).map(([category, categoryFiles]) => [
      category,
      summarizeFiles(categoryFiles),
    ]),
  );
}

function cleanupMetricCategory(file: FileMetrics): CleanupMetricCategory | null {
  if (file.generated || file.configHeavy || file.deprecated) {
    return null;
  }
  if (CLEANUP_METRIC_COHESIVE_DOCUMENT_FILES.has(file.file)) {
    return "cohesiveDocument";
  }
  if (CLEANUP_METRIC_STATIC_REGISTRY_FILES.has(file.file)) {
    return "staticRegistry";
  }
  if (
    file.file.includes("/__tests__/") ||
    /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(file.file)
  ) {
    return "test";
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
  const activeLogicFiles = files.filter(
    (file) => cleanupMetricCategory(file) === "activeLogic",
  );
  const byRoot = bucketByRoot(files);
  const byCategory = buildCategorySummary(files);
  const topActiveFiles = [...activeLogicFiles]
    .sort((left, right) => right.loc - left.loc)
    .slice(0, 20);
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
