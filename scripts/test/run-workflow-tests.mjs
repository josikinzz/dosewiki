import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { discoverWorkflowTests } from "./workflow-test-manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

const { testFiles, nodeTests, vitestTests } = discoverWorkflowTests(repoRoot);

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
