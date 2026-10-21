import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TEST_CATEGORIES = Object.freeze({
  "write-guards": "write guards",
  "auth-and-roles": "auth and roles",
  "revision-conflicts": "revision conflicts",
  secrets: "secrets",
  "published-safety-data": "data that feeds published dosage, interaction, or legality information",
});

const TEST_FILE = /\.(?:test|spec)\.(?:js|jsx|mjs|cjs|ts|tsx)$/;
const OUTSIDE_POLICY = ["vendor/"];
const POLICY_PATH = "scripts/test/test-policy.json";

export function readTestPolicy(repoRoot) {
  return JSON.parse(readFileSync(path.join(repoRoot, POLICY_PATH), "utf8"));
}

export function policyFiles(policy) {
  return [...Object.values(policy.tests ?? {}).flat(), ...Object.keys(policy.exceptions ?? {})];
}

export function discoverPolicyTests(repoRoot) {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  const files = result.stdout
    .split("\n")
    .filter((file) => TEST_FILE.test(file))
    .filter((file) => !OUTSIDE_POLICY.some((prefix) => file.startsWith(prefix)))
    .filter((file) => existsSync(path.join(repoRoot, file)));
  return [...new Set(files)].sort();
}

export function testPolicyProblems(policy, discovered) {
  const problems = [];
  for (const category of Object.keys(policy.tests ?? {})) {
    if (!Object.hasOwn(TEST_CATEGORIES, category)) problems.push(`Unknown category "${category}" in ${POLICY_PATH}.`);
  }
  for (const [file, reason] of Object.entries(policy.exceptions ?? {})) {
    if (typeof reason !== "string" || reason.trim().length === 0) problems.push(`Exception ${file} needs a one-line reason.`);
  }
  const listed = policyFiles(policy);
  const counts = new Map();
  for (const file of listed) counts.set(file, (counts.get(file) ?? 0) + 1);
  for (const [file, count] of counts) {
    if (count > 1) problems.push(`${file} is listed ${count} times; give it one category or one exception.`);
  }
  const present = new Set(discovered);
  for (const file of counts.keys()) {
    if (!present.has(file)) problems.push(`${file} is in ${POLICY_PATH} but no such test file exists.`);
  }
  for (const file of discovered) {
    if (!counts.has(file)) problems.push(`${file} has no category in ${POLICY_PATH}. List it under one category, or as an exception with a one-line reason.`);
  }
  return problems;
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const policy = readTestPolicy(repoRoot);
  const discovered = discoverPolicyTests(repoRoot);
  const problems = testPolicyProblems(policy, discovered);
  if (problems.length > 0) {
    const categories = Object.entries(TEST_CATEGORIES).map(([key, label]) => `  ${key}: ${label}`).join("\n");
    process.stderr.write(`${problems.join("\n")}\n\nAGENTS.md allows a test only in these categories:\n${categories}\n`);
    process.exit(1);
  }
  const exceptions = Object.keys(policy.exceptions ?? {}).length;
  process.stdout.write(`Test policy: ${discovered.length} test files classified, ${exceptions} named exceptions.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
