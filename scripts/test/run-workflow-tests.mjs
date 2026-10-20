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

function fail(message) {
  console.error(`${message}\nUsage: bun run test:workflow [-- <scripts test file>...]`);
  process.exit(1);
}

const requested = process.argv.slice(2).filter((arg) => arg !== "--");
const options = requested.filter((arg) => arg.startsWith("-"));
if (options.length > 0) fail(`Unknown option: ${options.join(" ")}`);

const discovered = discoverWorkflowTests(repoRoot);
const selected = new Set(requested.map((arg) => path.relative(repoRoot, path.resolve(arg))));
const unknown = [...selected].filter((file) => !discovered.testFiles.includes(file));
if (unknown.length > 0) fail(unknown.map((file) => `Not a discovered workflow test: ${file}`).join("\n"));

const pick = (files) => (selected.size === 0 ? files : files.filter((file) => selected.has(file)));
const testFiles = pick(discovered.testFiles);
const nodeTests = pick(discovered.nodeTests);
const vitestTests = pick(discovered.vitestTests);

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
