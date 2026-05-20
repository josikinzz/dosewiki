import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptsRoot = path.join(repoRoot, "scripts");

function walkTestFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relativePath = path.relative(repoRoot, fullPath);

    if (relativePath.startsWith("scripts/deprecated")) {
      continue;
    }

    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walkTestFiles(fullPath, files);
      continue;
    }

    if (/\.(?:test|spec)\.(?:mjs|js|ts|tsx)$/.test(entry)) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const testFiles = walkTestFiles(scriptsRoot);
const nodeTests = testFiles.filter((file) => {
  const content = readFileSync(path.join(repoRoot, file), "utf8");
  return content.includes("node:test");
});
const vitestTests = testFiles.filter((file) => !nodeTests.includes(file));

if (nodeTests.length > 0) {
  console.log(`\nRunning node workflow tests (${nodeTests.length})`);
  run(process.execPath, ["--test", ...nodeTests]);
}

if (vitestTests.length > 0) {
  const vitestBin = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vitest.cmd" : "vitest",
  );

  console.log(`\nRunning vitest workflow tests (${vitestTests.length})`);
  run(vitestBin, [
    "run",
    "--config",
    "scripts/test/vitest.workflow.config.ts",
    ...vitestTests,
  ]);
}

if (testFiles.length === 0) {
  console.log("No workflow tests found.");
}
