#!/usr/bin/env node
/**
 * The build command for every Vercel project that builds this repository.
 *
 * Why a wrapper instead of the canonical `npx convex deploy --cmd 'npm run
 * build'`: **two Vercel projects build this same repo and branch with the same
 * `vercel.json`.** `dosewiki-admin` is the full app and owns the write path to
 * production Convex; the Effect Index project (`effectindex.com`) is a
 * deliberately read-only publication deployment whose whole security posture is
 * that it has no write credentials at all (see docs/agents/deployment.md). An
 * unconditional `convex deploy` in the shared build command would either break
 * Effect Index outright or, worse, hand a public marketing deployment a write
 * path into the production database.
 *
 * So the build command is identical for both projects and the *environment*
 * decides what it does — which is exactly how the two projects already differ:
 *
 *   CONVEX_DEPLOY_KEY set    -> deploy Convex functions, then build the app
 *   CONVEX_DEPLOY_KEY unset  -> verify only, then build the app
 *
 * Effect Index simply never gets the key, the same way it never gets
 * `CONVEX_URL` or `CONVEX_ADMIN_KEY`, and it keeps building. Read-only stays
 * read-only by omission, which is the posture the project already relies on.
 *
 * Verify-only mode is not a rubber stamp: it still runs the credential-free
 * half of the drift gate, so a build cannot pass while the app calls a Convex
 * function that does not exist in the checkout at all. It cannot check the
 * deployment's live function list without a key, and it says so out loud rather
 * than reporting a pass it did not earn.
 *
 * Usage (normally only invoked by Vercel via `bun run build:vercel`):
 *   node scripts/deploy/vercel-build.mjs
 *   node scripts/deploy/vercel-build.mjs --plan   # print the decision, build nothing
 *
 * This script never deploys Convex from a workstation. Locally it always takes
 * the verify-only path, because `convex deploy` publishes the WORKING TREE and
 * only a Vercel checkout is guaranteed to be exactly one commit. For local
 * deploys use `npm run convex:deploy`, which guards that hazard explicitly.
 *
 * Exit codes:
 *   0  build succeeded
 *   1  a gate failed, or the build failed
 *   2  the environment is configured in a way that is unsafe to build from
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The real app build. Kept separate so `--cmd` below cannot recurse into this wrapper. */
const APP_BUILD_COMMAND = "bun run build";

/**
 * Convex deploy keys carry their own scope: `prod:<deployment>|<secret>` and
 * `preview:<team>:<project>|<secret>`. The CLI resolves its target from the key
 * ahead of any flag, so the key's class — not `--prod`, not `CONVEX_DEPLOYMENT`
 * — decides what a deploy touches. Classify it before doing anything with it.
 */
function classifyDeployKey(rawKey) {
  const key = rawKey?.trim();
  if (!key) return null;
  const prefix = key.slice(0, key.indexOf(":"));
  if (prefix === "prod" || prefix === "preview" || prefix === "dev") return prefix;
  return "unknown";
}

function run(command, args, { env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function banner(lines) {
  const width = Math.max(...lines.map((line) => line.length));
  const rule = "-".repeat(width + 4);
  console.log(`\n${rule}`);
  for (const line of lines) console.log(`| ${line.padEnd(width)} |`);
  console.log(`${rule}\n`);
}

/**
 * The half of the drift gate that needs no credential: every Convex function the
 * app names must exist in this checkout. Typecheck covers the `api.*` form but
 * not the untyped string form used for public reads, so this is the only static
 * coverage those names have. Runs in BOTH modes.
 */
function checkCallsitesResolve() {
  console.log("[vercel-build] Checking every Convex call site resolves in this checkout...");
  return run("node", ["scripts/convex/check-function-drift.mjs", "--checkout-only"]);
}

/**
 * Compare the checkout against the deployment the key points at. `--strict` also
 * fails on the silent-deletion direction: a function live on the deployment but
 * absent from this checkout, which `convex deploy` would drop while still
 * reporting success. On Vercel the checkout is exactly one commit, so a hit here
 * means someone published a function that was never committed.
 */
function checkDeploymentDrift(deployKey, { strict }) {
  const args = ["scripts/convex/check-function-drift.mjs", "--prod"];
  if (strict) args.push("--strict");
  return run("node", args, {
    env: { ...process.env, CONVEX_DEPLOY_KEY_PROD: deployKey },
  });
}

/**
 * Decide what this environment is allowed to do. Returns a plan; performs
 * nothing. Keeping the decision in one pure-ish function is what makes the
 * two-projects-one-build-command argument reviewable.
 */
export function planBuild(env) {
  const vercelEnv = env.VERCEL_ENV?.trim() || null;
  const onVercel = Boolean(env.VERCEL) || Boolean(vercelEnv);
  const keyClass = classifyDeployKey(env.CONVEX_DEPLOY_KEY);
  const allowDeletion = env.CONVEX_DEPLOY_ALLOW_FUNCTION_DELETION === "1";

  if (!keyClass) {
    return {
      mode: "verify",
      reason: onVercel
        ? "CONVEX_DEPLOY_KEY is not set on this Vercel project, so it has no write path " +
          "into Convex. This is the read-only publication posture (Effect Index)."
        : "CONVEX_DEPLOY_KEY is not set. Local builds never deploy Convex.",
      deployKey: null,
      strictPreDeployCheck: false,
    };
  }

  if (!onVercel) {
    return {
      mode: "verify",
      reason:
        "CONVEX_DEPLOY_KEY is set but this is not a Vercel build. `convex deploy` " +
        "publishes the WORKING TREE, not HEAD, and only a Vercel checkout is " +
        "guaranteed to be exactly one commit. Use `npm run convex:deploy` instead.",
      deployKey: null,
      strictPreDeployCheck: false,
    };
  }

  if (vercelEnv === "production") {
    if (keyClass === "preview") {
      return {
        mode: "refuse",
        reason:
          "This is a PRODUCTION Vercel build but CONVEX_DEPLOY_KEY is a preview key. " +
          "The key decides the target, so the release would publish its functions to a " +
          "throwaway preview deployment while the app talks to production. Set a " +
          "production deploy key on the Production environment.",
      };
    }
    return {
      mode: "deploy",
      reason: `Production Vercel build with a ${keyClass} deploy key.`,
      deployKey: env.CONVEX_DEPLOY_KEY.trim(),
      strictPreDeployCheck: !allowDeletion,
    };
  }

  // Preview / development Vercel builds.
  if (keyClass === "preview") {
    return {
      mode: "deploy",
      reason: `Vercel ${vercelEnv ?? "preview"} build with a preview deploy key; ` +
        "Convex will provision or update its own preview deployment.",
      deployKey: env.CONVEX_DEPLOY_KEY.trim(),
      // A preview deployment may not exist yet, so there is nothing to diff against.
      strictPreDeployCheck: false,
    };
  }

  return {
    mode: "verify",
    reason:
      `This is a Vercel ${vercelEnv ?? "non-production"} build but CONVEX_DEPLOY_KEY is a ` +
      `${keyClass} key, which targets production. Deploying would publish an unreleased ` +
      "branch's functions to production. Downgraded to verify-only.",
    // Still usable read-only, to warn about drift without publishing anything.
    deployKey: null,
    warnAgainstProductionUsing: env.CONVEX_DEPLOY_KEY.trim(),
    strictPreDeployCheck: false,
  };
}

function main() {
  const planOnly = process.argv.includes("--plan");
  const plan = planBuild(process.env);

  if (plan.mode === "refuse") {
    banner(["REFUSING TO BUILD", ...plan.reason.split(". ").map((s) => s.trim()).filter(Boolean)]);
    process.exit(2);
  }

  banner([
    plan.mode === "deploy"
      ? "Convex functions WILL be deployed by this build"
      : "Convex functions will NOT be deployed by this build",
    plan.reason,
  ]);

  if (planOnly) return;

  const callsiteStatus = checkCallsitesResolve();
  if (callsiteStatus !== 0) {
    console.error(
      "[vercel-build] The app calls a Convex function this checkout does not define. " +
        "Deploying or building would ship a call that can never resolve.",
    );
    process.exit(1);
  }

  if (plan.mode === "deploy") {
    if (plan.strictPreDeployCheck) {
      console.log(
        "[vercel-build] Comparing this commit against the target deployment before deploying...",
      );
      const driftStatus = checkDeploymentDrift(plan.deployKey, { strict: true });
      if (driftStatus !== 0) {
        console.error(
          "[vercel-build] Pre-deploy drift check failed.\n" +
            "  Functions listed as AT RISK OF SILENT DELETION are live on the deployment " +
            "but absent from this commit; `convex deploy` would drop them and still report " +
            "success. Commit them, or confirm they are disposable and set " +
            "CONVEX_DEPLOY_ALLOW_FUNCTION_DELETION=1 on this Vercel environment to proceed.\n" +
            "  See docs/agents/deployment.md.",
        );
        process.exit(1);
      }
    }

    console.log(`[vercel-build] bunx convex deploy --cmd '${APP_BUILD_COMMAND}'`);
    const status = run("bunx", ["convex", "deploy", "--cmd", APP_BUILD_COMMAND]);
    process.exit(status);
  }

  if (plan.warnAgainstProductionUsing) {
    console.log(
      "[vercel-build] Read-only drift report against production (advisory, cannot fail this build):",
    );
    checkDeploymentDrift(plan.warnAgainstProductionUsing, { strict: false });
  }

  console.log(
    "[vercel-build] NOT VERIFIED: the deployment's live function list was not read " +
      "(no deploy key). Only checkout-internal call-site integrity was enforced.",
  );
  console.log(`[vercel-build] ${APP_BUILD_COMMAND}`);
  const status = run("bun", ["run", "build"]);
  process.exit(status);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
