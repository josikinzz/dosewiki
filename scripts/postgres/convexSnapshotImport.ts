/**
 * The one code path that writes a snapshot ZIP into a Convex deployment:
 * `npx convex import --replace`, scoped to the deployment by a deploy key read
 * from an env file (never from the calling environment, whose CONVEX_* values
 * name production), and gated by `guardConvexTarget`.
 */

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { deploymentNameFrom, guardConvexTarget } from "./convexTargetGuard";

export type ConvexImportOptions = {
  zip: string;
  deployment: string;
  envFile: string;
  allowProduction: boolean;
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

/** Deploy key from `envFile`, refused unless it names `deployment`. */
export function readScratchDeployKey(envFile: string, deployment: string): string {
  if (!fs.existsSync(envFile)) {
    throw new Error(`Deploy key file ${envFile} not found; create it with npx convex deployment token create <name> --deployment <team>:<project>:<ref> --save-env ${envFile}`);
  }
  const match = fs.readFileSync(envFile, "utf8").match(/^CONVEX_DEPLOY_KEY=(.+)$/m);
  const key = match ? match[1].trim() : null;
  const keyed = deploymentNameFrom(key ?? undefined);
  if (!key || keyed !== deployment) throw new Error(`${envFile} carries a key for ${keyed ?? "no deployment"}, not ${deployment}`);
  return key;
}

/** Environment for `npx convex` with every ambient deployment selector removed and the given key in place. */
export function convexCliEnv(deployKey: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, CONVEX_DEPLOY_KEY: deployKey };
  for (const name of ["CONVEX_DEPLOYMENT", "CONVEX_URL", "VITE_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_DEPLOY_KEY_PROD", "CONVEX_PUBLIC_READ_URL"]) delete env[name];
  return env;
}

export function importSnapshotIntoConvex(options: ConvexImportOptions): { status: number | null; stdout: string; stderr: string; ms: number } {
  guardConvexTarget(options.deployment, options.allowProduction, options.env ?? process.env);
  const key = readScratchDeployKey(options.envFile, options.deployment);
  const startedAt = performance.now();
  const result = spawnSync("npx", ["convex", "import", "--replace", "-y", options.zip], {
    cwd: options.cwd,
    encoding: "utf8",
    env: convexCliEnv(key, options.env),
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "").replace(/^\(node:\d+\) ExperimentalWarning.*\n(\(Use .*\n)?/gm, ""),
    ms: Math.round(performance.now() - startedAt),
  };
}
