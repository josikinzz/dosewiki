#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const VERCEL_PRO_FUNCTION_LIMITS = { memory: 3008, maxDuration: 300 };
const API_ROUTE_DIR = "src/app/api";
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const API_ROUTE_PATTERNS = [
  [/\beval\s*\(/, "eval() call"],
  [/\bnew\s+Function\s*\(/, "Function constructor"],
  [/\b(?:exec|spawn|execSync|spawnSync)\s*\([^)]*\$\{/, "exec or spawn call with an interpolated argument"],
];

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function vercelFunctionLimitViolations() {
  const configPath = path.join(repoRoot, "vercel.json");
  if (!existsSync(configPath)) return [];
  const functions = JSON.parse(readFileSync(configPath, "utf8")).functions ?? {};
  return Object.entries(functions).flatMap(([pattern, options]) =>
    Object.entries(VERCEL_PRO_FUNCTION_LIMITS)
      .filter(([setting, limit]) => (options?.[setting] ?? 0) > limit)
      .map(([setting, limit]) => `vercel.json functions["${pattern}"].${setting} exceeds the Pro plan limit of ${limit}`),
  );
}

function committedEnvFileViolations() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((file) => {
      const name = path.posix.basename(file);
      return name.startsWith(".env") && name !== ".env.example";
    })
    .map((file) => `${file} is tracked; only .env.example may be committed`);
}

function apiRoutePatternViolations() {
  const apiRoot = path.join(repoRoot, API_ROUTE_DIR);
  return readdirSync(apiRoot, { recursive: true })
    .map((relativePath) => path.join(apiRoot, relativePath))
    .filter((absolutePath) => !TEST_FILE.test(absolutePath) && statSync(absolutePath).isFile())
    .flatMap((absolutePath) => {
      const file = path.relative(repoRoot, absolutePath);
      return readFileSync(absolutePath, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          API_ROUTE_PATTERNS.filter(([pattern]) => pattern.test(line)).map(([, label]) => `${file}:${index + 1}: ${label}`),
        );
    });
}

const POLICIES = [
  ["Vercel function limits", vercelFunctionLimitViolations],
  ["No committed .env files", committedEnvFileViolations],
  ["No dangerous patterns in App Router API routes", apiRoutePatternViolations],
];

for (const [name, findViolations] of POLICIES) {
  const violations = findViolations();
  if (violations.length === 0) {
    console.log(`ok    ${name}`);
    continue;
  }
  console.error(`FAIL  ${name}`);
  for (const violation of violations) console.error(`      ${violation}`);
  process.exitCode = 1;
}
