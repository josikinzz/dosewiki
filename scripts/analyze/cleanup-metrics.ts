import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

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
    maxLoc: 300,
    reason: "Keep the renderer registry bounded as new tags are added.",
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

function evaluateHotspotThresholds(files: FileMetrics[]) {
  return HOTSPOT_THRESHOLDS.map((threshold) => {
    const match = files.find((file) => file.file === threshold.file);
    return {
      ...threshold,
      actualLoc: match?.loc ?? 0,
      status: match && match.loc <= threshold.maxLoc ? "PASS" : "FAIL",
    };
  });
}

function main() {
  const rootDir = process.cwd();
  const files = ROOTS.flatMap((root) => walk(join(rootDir, root))).map(collectFileMetrics);
  const activeLogicFiles = files.filter((file) => !file.generated && !file.configHeavy && !file.deprecated);
  const byRoot = bucketByRoot(files);
  const byCategory = buildCategorySummary(files);
  const topActiveFiles = [...activeLogicFiles].sort((left, right) => right.loc - left.loc).slice(0, 20);
  const hotspotThresholds = evaluateHotspotThresholds(files);
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

  console.log("\n## Largest Active Logic Files\n");
  console.log(formatTableRow(["File", "LOC"]));
  console.log(formatTableRow(["---", "---"]));
  for (const file of topActiveFiles) {
    console.log(formatTableRow([file.file, file.loc]));
  }

  if (shouldCheck) {
    const failingThresholds = hotspotThresholds.filter((threshold) => threshold.status === "FAIL");
    if (failingThresholds.length > 0) {
      console.error(
        `\ncleanup-metrics check failed: ${failingThresholds.length} hotspot threshold(s) exceeded.`,
      );
      process.exitCode = 1;
    }
  }
}

main();
