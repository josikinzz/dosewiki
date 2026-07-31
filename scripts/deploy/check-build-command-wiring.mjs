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

if (problems.length > 0) {
  console.error("Convex-aware build wiring is broken:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nSee docs/agents/deployment.md, 'Shipping the app ships the Convex functions'.");
  process.exit(1);
}

console.log(
  `Build wiring intact: vercel.json -> ${EXPECTED_BUILD_COMMAND} -> ${WRAPPER} -> bun run build`,
);
