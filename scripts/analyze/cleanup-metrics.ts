import { readdirSync, readFileSync, statSync } from "fs";
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

function isSourceFile(pathname: string) {
  const extension = pathname.slice(pathname.lastIndexOf("."));
  return SOURCE_EXTENSIONS.has(extension);
}

function walk(dir: string, results: string[] = []) {
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

function main() {
  const rootDir = process.cwd();
  const files = ROOTS.flatMap((root) => walk(join(rootDir, root))).map(collectFileMetrics);
  const activeLogicFiles = files.filter((file) => !file.generated && !file.configHeavy && !file.deprecated);
  const byRoot = bucketByRoot(files);
  const topActiveFiles = [...activeLogicFiles].sort((left, right) => right.loc - left.loc).slice(0, 20);

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

  console.log("\n## Largest Active Logic Files\n");
  console.log(formatTableRow(["File", "LOC"]));
  console.log(formatTableRow(["---", "---"]));
  for (const file of topActiveFiles) {
    console.log(formatTableRow([file.file, file.loc]));
  }
}

main();
