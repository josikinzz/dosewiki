#!/usr/bin/env node
/**
 * Guard the one line that decides whether shipping the app also ships the
 * Convex functions it calls.
 *
 * Before this wiring existed, `vercel.json` ran a plain `next build`, so a
 * deploy shipped a UI that called `substanceIndex:setArticleField` while the
 * mutation itself sat undeployed — and production redacts every error to a bare
 * "Server Error", so it took a day to see. The fix is structural: the Vercel
 * build command routes through `scripts/deploy/vercel-build.mjs`, which deploys
 * Convex when the project holds a deploy key and verifies when it does not.
 *
 * That fix is a single string in `vercel.json`. A well-meaning edit back to
 * `bun run build` would silently restore the outage with no test failing, so CI
 * asserts the wiring itself.
 *
 * Read-only. Exits 1 on a broken chain.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXPECTED_BUILD_COMMAND = "bun run build:vercel";
const WRAPPER = "scripts/deploy/vercel-build.mjs";

const problems = [];

const vercelConfig = JSON.parse(readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));

if (vercelConfig.buildCommand !== EXPECTED_BUILD_COMMAND) {
  problems.push(
    `vercel.json buildCommand is ${JSON.stringify(vercelConfig.buildCommand)}, ` +
      `expected ${JSON.stringify(EXPECTED_BUILD_COMMAND)}. ` +
      "Anything else builds the app without deploying or verifying Convex functions.",
  );
}

const buildVercel = packageJson.scripts?.["build:vercel"] ?? "";
if (!buildVercel.includes(WRAPPER)) {
  problems.push(
    `package.json script "build:vercel" is ${JSON.stringify(buildVercel)}, ` +
      `which does not run ${WRAPPER}.`,
  );
}

// The wrapper shells out to `bun run build` for the app build itself, so `build`
// must stay the plain app build and must not point back at the wrapper.
const build = packageJson.scripts?.build ?? "";
if (build.includes(WRAPPER) || build.includes("build:vercel")) {
  problems.push(
    `package.json script "build" is ${JSON.stringify(build)}, which would recurse: ` +
      "the wrapper invokes `bun run build` to perform the app build.",
  );
}

// A correct buildCommand is worthless if the file it names never reaches
// Vercel. `.vercelignore` excludes `scripts/` as operational clutter, and a
// blanket exclusion there once shipped a build whose first line was
// MODULE_NOT_FOUND on a committed file (2026-07-31). So the chain check
// extends to the upload: every file the wrapper transitively executes must
// survive `.vercelignore` filtering. Uses the same `ignore` matcher family
// Vercel's CLI applies to that file.
const { default: createIgnoreMatcher } = await import("ignore");
const WRAPPER_EXECUTION_CHAIN = [
  WRAPPER,
  "scripts/convex/check-function-drift.mjs",
  "scripts/lib/convex-drift-report.mjs",
  "scripts/lib/convex-app-callsites.mjs",
  "scripts/lib/convex-function-inventory.mjs",
  "scripts/lib/data-ops-run-context.mjs",
];
try {
  const vercelignore = readFileSync(path.join(REPO_ROOT, ".vercelignore"), "utf8");
  const matcher = createIgnoreMatcher().add(vercelignore);
  for (const file of WRAPPER_EXECUTION_CHAIN) {
    if (matcher.ignores(file)) {
      problems.push(
        `.vercelignore excludes ${file}, so the Vercel upload will not contain it ` +
          "and the build command fails with MODULE_NOT_FOUND before anything runs.",
      );
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  // No .vercelignore at all means nothing is filtered — the chain uploads.
}

if (problems.length > 0) {
  console.error("Convex-aware build wiring is broken:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nSee docs/agents/deployment.md, 'Shipping the app ships the Convex functions'.");
  process.exit(1);
}

console.log(
  `Build wiring intact: vercel.json -> ${EXPECTED_BUILD_COMMAND} -> ${WRAPPER} -> bun run build`,
);
