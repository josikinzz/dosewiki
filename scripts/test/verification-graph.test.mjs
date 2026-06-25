import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readText(pathname) {
  return readFileSync(resolve(repoRoot, pathname), "utf8");
}

function readPackageScripts() {
  return JSON.parse(readText("package.json")).scripts;
}

function assertScriptIncludes(script, expectedCommands) {
  for (const expectedCommand of expectedCommands) {
    assert.match(script, new RegExp(`(?:^|&&\\s*)${expectedCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*&&|$)`));
  }
}

test("package verification graph composes the documented validation commands", () => {
  const scripts = readPackageScripts();

  assertScriptIncludes(scripts["verify:app"], [
    "npm run test",
    "npm run lint",
    "npm run lint:api",
    "npm run typecheck",
    "npm run build",
  ]);
  assertScriptIncludes(scripts["verify:workflow"], [
    "npm run test:workflow",
    "npm run lint:scripts",
    "npm run typecheck:scripts",
    "npm run typecheck:convex",
    "npm run cleanup:metrics -- --check",
    "npm run provenance:check",
  ]);
  assertScriptIncludes(scripts["verify:all"], [
    "npm run verify:app",
    "npm run verify:workflow",
  ]);
});

test("GitHub Actions delegates to the canonical verification graph", () => {
  const workflow = readText(".github/workflows/vercel-policy-checks.yml");

  assert.match(workflow, /run:\s*bun run verify:all/);
  assert.doesNotMatch(workflow, /run:\s*bun run lint(?:\s|$)/);
  assert.doesNotMatch(workflow, /run:\s*bunx tsc --noEmit/);
  assert.doesNotMatch(workflow, /run:\s*bun run build(?:\s|$)/);
});

test("API guardrails target active App Router API routes, not retired root API routes", () => {
  const scripts = readPackageScripts();
  const eslintConfig = readText("eslint.config.mjs");
  const workflow = readText(".github/workflows/vercel-policy-checks.yml");

  assert.match(scripts["lint:api"], /^eslint src\/app\/api\/?(?:\s|$)/);
  assert.match(eslintConfig, /files:\s*\[\s*['"]src\/app\/api\/\*\*\/\*\.\{ts,tsx\}['"]\s*\]/);
  assert.doesNotMatch(eslintConfig, /files:\s*\[\s*['"]api\/\*\*\/\*\.js['"]\s*\]/);
  assert.doesNotMatch(workflow, /(?:^|[\s"'`])api\//);
  assert.match(workflow, /src\/app\/api/);
});

test("active script and Convex verification have broad lint and typecheck coverage", () => {
  const scripts = readPackageScripts();

  assert.match(scripts["lint:scripts"], /^eslint scripts(?:\s|$)/);
  assert.match(scripts["lint:scripts"], /--ignore-pattern ['"]scripts\/deprecated\/\*\*['"]/);
  assert.match(scripts["lint:scripts"], /--ignore-pattern ['"]scripts\/\*\*\/archive\/\*\*['"]/);
  assert.equal(scripts["typecheck:scripts"], "tsc --noEmit -p tsconfig.scripts.json");
  assert.equal(scripts["typecheck:convex"], "tsc --noEmit -p tsconfig.convex.json");

  const scriptsTsconfig = JSON.parse(readText("tsconfig.scripts.json"));
  assert.deepEqual(scriptsTsconfig.include, ["scripts/**/*.ts"]);
  assert.match(scriptsTsconfig.exclude.join("\n"), /scripts\/deprecated/);
  assert.match(scriptsTsconfig.exclude.join("\n"), /scripts\/\*\*\/archive/);

  const convexTsconfig = JSON.parse(readText("tsconfig.convex.json"));
  assert.deepEqual(convexTsconfig.include, ["convex/**/*.ts"]);
  assert.match(convexTsconfig.exclude.join("\n"), /convex\/_generated/);
});
