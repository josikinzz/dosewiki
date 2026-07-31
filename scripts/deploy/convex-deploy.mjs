#!/usr/bin/env node
/**
 * Deploy Convex functions from a workstation, with the working-tree hazard
 * guarded instead of merely documented.
 *
 * `convex deploy` publishes the **working tree**, not git HEAD. Both directions
 * of that have already bitten this repo:
 *
 *   - Tree ahead of HEAD: the deploy publishes uncommitted code, so production
 *     runs something no commit describes and the next clean-checkout deploy
 *     silently reverts it.
 *   - Deployment ahead of tree: a function live in production but absent from
 *     the tree is DELETED, and the deploy still reports success.
 *     (`mergeUnknownTwin`, `repairLegacyMedia` — see docs/agents/deployment.md.)
 *
 * Vercel is immune to the first because its checkout is exactly one commit;
 * a workstation is not. So this script refuses to deploy from a dirty publish
 * surface, and offers `--from-head-worktree` to deploy exactly HEAD out of a
 * detached `git worktree` no matter what the main tree looks like — which is
 * the only mode that is correct while several agents share this checkout.
 *
 * It always runs `check-function-drift --strict` first, which is the guard for
 * the second direction.
 *
 * Usage:
 *   node scripts/deploy/convex-deploy.mjs --prod                      # dry run: gates only
 *   node scripts/deploy/convex-deploy.mjs --prod --confirm            # gates, then deploy
 *   node scripts/deploy/convex-deploy.mjs --prod --from-head-worktree --confirm
 *   node scripts/deploy/convex-deploy.mjs --dev --confirm
 *
 * Without `--confirm` nothing is published: the gates run and the exact command
 * that would have been executed is printed.
 *
 * Exit codes:
 *   0  gates passed (and the deploy succeeded, if --confirm was given)
 *   1  a gate refused, or the deploy failed
 *   2  missing or unusable credentials / bad arguments
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFiles } from "../lib/data-ops-run-context.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Paths whose contents end up inside a Convex deploy. `convex/` is obvious; the
 * functions also import `lib/quoteSections.mjs` and `src/data/config/promptRegistry`,
 * and those get bundled too, so uncommitted edits there are published just as
 * silently.
 */
const PUBLISH_SURFACE = ["convex/", "convex.json", "lib/", "src/data/config/", "package.json"];

const DEPLOY_KEY_VARS = { dev: "CONVEX_DEPLOY_KEY", prod: "CONVEX_DEPLOY_KEY_PROD" };

function parseArgs(argv) {
  const args = { deployment: null, confirm: false, fromHeadWorktree: false, help: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--prod") args.deployment = "prod";
    else if (arg === "--dev") args.deployment = "dev";
    else if (arg === "--confirm") args.confirm = true;
    else if (arg === "--from-head-worktree") args.fromHeadWorktree = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  console.log(
    [
      "Deploy Convex functions with the working-tree-vs-HEAD hazard guarded.",
      "",
      "  --prod | --dev          which deployment to publish to (required)",
      "  --from-head-worktree    publish exactly HEAD from a detached git worktree;",
      "                          uncommitted work is NOT published",
      "  --confirm               actually deploy (without it, gates run and stop)",
      "",
      "Always runs `convex:check-functions --strict` against the target first.",
    ].join("\n"),
  );
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

/** Tracked-or-untracked changes that would ride along on a deploy from this tree. */
function dirtyPublishSurfacePaths() {
  const porcelain = git(["status", "--porcelain", "--untracked-files=all"]);
  const paths = [];
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    // "XY path" or "XY old -> new" for renames.
    const raw = line.slice(3);
    const filePath = raw.includes(" -> ") ? raw.split(" -> ")[1] : raw;
    const normalized = filePath.replace(/^"|"$/g, "");
    if (PUBLISH_SURFACE.some((prefix) => normalized.startsWith(prefix))) {
      paths.push(`${line.slice(0, 2).trim() || "??"} ${normalized}`);
    }
  }
  return paths;
}

function resolveDeployKey(deployment) {
  loadEnvFiles({ rootDir: REPO_ROOT, env: process.env });
  const variable = DEPLOY_KEY_VARS[deployment];
  const value = process.env[variable]?.trim();
  if (!value) {
    console.error(
      `No ${variable} in the environment or .env.local, so there is nothing to deploy with.\n` +
        "See docs/agents/convex-credentials.md. Do not mint a new key to work around this.",
    );
    process.exit(2);
  }
  return { variable, value };
}

function runStrictDriftCheck(deployment, deployKey) {
  console.log(`\n[convex-deploy] Pre-deploy drift check against ${deployment} (--strict)...`);
  const result = spawnSync(
    "node",
    [
      "scripts/convex/check-function-drift.mjs",
      `--deployment=${deployment}`,
      "--strict",
      // MISSING functions are what this deploy publishes; without this the
      // gate deadlocks on any commit that introduces a new function.
      "--about-to-deploy",
    ],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, [DEPLOY_KEY_VARS[deployment]]: deployKey },
      stdio: "inherit",
    },
  );
  return result.status ?? 1;
}

/**
 * Run `convex deploy` against a detached checkout of HEAD. `node_modules` is
 * symlinked in rather than reinstalled: the bundler only needs to resolve
 * dependencies, and the source it bundles all comes from the worktree.
 */
function deployFromHeadWorktree(deployKey) {
  const head = git(["rev-parse", "HEAD"]).trim();
  const worktree = mkdtempSync(path.join(tmpdir(), "dosewiki-convex-head-"));
  console.log(`[convex-deploy] Deploying HEAD (${head.slice(0, 12)}) from ${worktree}`);
  try {
    git(["worktree", "add", "--detach", worktree, "HEAD"]);
    symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(worktree, "node_modules"), "dir");
    // No `--prod`: the deploy key alone resolves the target, ahead of any flag.
    const result = spawnSync("bunx", ["convex", "deploy"], {
      cwd: worktree,
      env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey, CONVEX_DEPLOYMENT: "" },
      stdio: "inherit",
    });
    return result.status ?? 1;
  } finally {
    try {
      git(["worktree", "remove", "--force", worktree]);
    } catch {
      rmSync(worktree, { recursive: true, force: true });
    }
    try {
      git(["worktree", "prune"]);
    } catch {
      /* best effort */
    }
  }
}

function deployFromWorkingTree(deployKey) {
  const result = spawnSync("bunx", ["convex", "deploy"], {
    cwd: REPO_ROOT,
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey, CONVEX_DEPLOYMENT: "" },
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.deployment) {
    console.error("Pass --prod or --dev. The target is never inferred.");
    process.exit(2);
  }

  const deployKey = resolveDeployKey(args.deployment);
  console.log(`[convex-deploy] target=${args.deployment} via ${deployKey.variable}`);

  const dirty = dirtyPublishSurfacePaths();
  if (dirty.length > 0) {
    console.log(`\n[convex-deploy] ${dirty.length} uncommitted change(s) in the publish surface:`);
    for (const entry of dirty) console.log(`    ${entry}`);
    if (!args.fromHeadWorktree) {
      console.error(
        "\nREFUSING: `convex deploy` publishes the working tree, so these would go live " +
          "without any commit describing them.\n" +
          "  Commit them, or re-run with --from-head-worktree to publish exactly HEAD.",
      );
      process.exit(1);
    }
    console.log(
      "\n[convex-deploy] --from-head-worktree: the changes above will NOT be published.",
    );
  }

  const driftStatus = runStrictDriftCheck(args.deployment, deployKey.value);
  if (driftStatus !== 0) {
    console.error(
      "\nREFUSING: the strict drift check failed.\n" +
        "  AT RISK OF SILENT DELETION means a function is live on the deployment and absent " +
        "here; deploying drops it and still reports success. Resolve each one first.\n" +
        "  MISSING means the app calls something no deployment has — that one deploying fixes.\n" +
        "  See docs/agents/deployment.md.",
    );
    process.exit(1);
  }

  if (!args.confirm) {
    console.log(
      "\n[convex-deploy] Gates passed. Nothing was published (no --confirm).\n" +
        `  Re-run with --confirm${args.fromHeadWorktree ? "" : " (or --from-head-worktree --confirm)"} to deploy.`,
    );
    return;
  }

  const status = args.fromHeadWorktree
    ? deployFromHeadWorktree(deployKey.value)
    : deployFromWorkingTree(deployKey.value);

  if (status !== 0) {
    console.error("[convex-deploy] Deploy failed.");
    process.exit(status);
  }

  console.log(
    "\n[convex-deploy] Deployed. Confirm with:\n" +
      `  npm run convex:check-functions -- --deployment=${args.deployment}`,
  );
}

main();
