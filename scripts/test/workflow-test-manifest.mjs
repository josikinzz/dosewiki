import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const workflowTestRoots = Object.freeze(["scripts"]);

function walkTestFiles(repoRoot, relativeDir, files) {
  const directory = path.join(repoRoot, relativeDir);
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules") continue;
    const relativePath = path.join(relativeDir, entry);
    if (relativePath.startsWith(path.join("scripts", "deprecated"))) continue;
    const fullPath = path.join(repoRoot, relativePath);
    if (statSync(fullPath).isDirectory()) {
      walkTestFiles(repoRoot, relativePath, files);
    } else if (/\.(?:test|spec)\.(?:mjs|js|ts|tsx)$/.test(entry)) {
      files.push(relativePath);
    }
  }
}

export function discoverWorkflowTests(repoRoot) {
  const testFiles = [];
  for (const root of workflowTestRoots) walkTestFiles(repoRoot, root, testFiles);
  testFiles.sort();
  const nodeTests = testFiles.filter((file) =>
    readFileSync(path.join(repoRoot, file), "utf8").includes("node:test"),
  );
  const nodeTestPaths = new Set(nodeTests);
  return {
    testFiles,
    nodeTests,
    vitestTests: testFiles.filter((file) => !nodeTestPaths.has(file)),
  };
}
