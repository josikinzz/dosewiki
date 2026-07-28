#!/usr/bin/env node
/**
 * Report which Convex deployment each URL variable points at, and whether the
 * admin tokens in `.env.local` are the ones the target deployment will actually
 * accept.
 *
 * Why this exists: an admin token is validated inside the Convex function
 * against the value stored on THAT deployment, so a token is only ever valid
 * for the deployment it was minted on. A local `.env.local` copy that has
 * drifted, or was minted against dev and used against prod, fails at the
 * mutation with a generic authorization error — which reads like "the key is
 * missing" and invites minting yet another key. Nothing here prints a secret;
 * tokens are compared by SHA-1 prefix only.
 *
 * Usage:
 *   node scripts/convex/doctor.mjs                # inspect the default deployment
 *   node scripts/convex/doctor.mjs --deployment=prod
 *   node scripts/convex/doctor.mjs --url=https://glad-minnow-656.convex.cloud
 *
 * Read-only. It never writes to Convex and never mutates `.env.local`.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONVEX_URL_KEYS,
  SOURCE_CONVEX_URL_KEYS,
  getAdminIntentEnvVar,
  loadEnvFiles,
} from "../lib/data-ops-run-context.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Every intent a data-ops script can ask for, in the order they appear in the registry. */
const ADMIN_INTENTS = [
  "editorArticleWrite",
  "promptMigrationWrite",
  "quoteMigrationWrite",
  "profileMediaWrite",
  "replicationMaintenance",
  "articleSourceMigration",
  "productionSync",
  "citationEvidenceWrite",
  "citationEvidenceReview",
  "generatedPublicationWrite",
];

/** The fallback every intent silently lands on when its scoped token is absent. */
const LEGACY_ADMIN_KEY = "CONVEX_ADMIN_KEY";

function fingerprint(value) {
  if (!value) return null;
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function deploymentName(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return url;
  }
}

function parseArgs(argv) {
  const args = { deployment: null, url: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--deployment=")) args.deployment = arg.slice("--deployment=".length);
    else if (arg.startsWith("--url=")) args.url = arg.slice("--url=".length);
  }
  return args;
}

/**
 * Ask the deployment itself what it has stored, so local values can be compared
 * against the only copy that matters. Returns null when the CLI cannot reach it
 * — typically because the deploy key in the environment belongs to a different
 * deployment, which is itself the answer to "why was I rejected".
 */
function readDeploymentEnv(name, deployUrl) {
  try {
    const env = { ...process.env };
    if (deployUrl) env.CONVEX_URL = deployUrl;
    const raw = execFileSync("bunx", ["convex", "env", "get", name], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function resolveFirst(keys, env) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  loadEnvFiles({ rootDir: REPO_ROOT, env: process.env });
  const env = process.env;

  console.log("Convex credential doctor — read-only, no secrets printed\n");

  console.log("URL variables (write targets resolve in this order; first non-empty wins)");
  for (const key of CONVEX_URL_KEYS) {
    const value = env[key]?.trim();
    console.log(`  ${key.padEnd(24)} ${value ? deploymentName(value) : "(unset)"}`);
  }
  const target = resolveFirst(CONVEX_URL_KEYS, env);
  console.log(
    `  -> writes target: ${target ? `${deploymentName(target.value)} (via ${target.key})` : "NONE — scripts will refuse to run"}\n`,
  );

  console.log("URL variables (read sources resolve in this order)");
  for (const key of SOURCE_CONVEX_URL_KEYS) {
    const value = env[key]?.trim();
    console.log(`  ${key.padEnd(24)} ${value ? deploymentName(value) : "(unset)"}`);
  }
  const source = resolveFirst(SOURCE_CONVEX_URL_KEYS, env);
  console.log(
    `  -> reads source:  ${source ? `${deploymentName(source.value)} (via ${source.key})` : "NONE"}\n`,
  );

  const inspectUrl = args.url ?? target?.value ?? null;
  const inspectName = deploymentName(inspectUrl);
  console.log(
    `Admin tokens, compared against deployment ${inspectName ?? "(unknown)"}\n` +
      "  A token is only valid on the deployment it was minted on. MISMATCH means the\n" +
      "  script will authenticate locally and then be rejected by the mutation.\n",
  );

  const legacyLocal = env[LEGACY_ADMIN_KEY]?.trim() || null;
  const legacyRemote = readDeploymentEnv(LEGACY_ADMIN_KEY, inspectUrl);
  const remoteReachable = legacyRemote !== null;

  // Mirrors convex/lib/adminIntentTokens.ts: the deployment accepts a token
  // that equals its own scoped var for that intent, OR its legacy admin key.
  // Locally, a script sends the scoped var if set and otherwise the legacy one.
  // A row is only usable when the value actually sent clears one of those.
  const rows = [];
  for (const intent of ADMIN_INTENTS) {
    const envVar = getAdminIntentEnvVar(intent);
    const scopedLocal = env[envVar]?.trim() || null;
    const sent = scopedLocal ?? legacyLocal;
    const scopedRemote = remoteReachable ? readDeploymentEnv(envVar, inspectUrl) : null;

    let status;
    if (!sent) {
      status = "MISSING — no scoped token and no fallback";
    } else if (!remoteReachable) {
      status = scopedLocal ? "unverified" : `via ${LEGACY_ADMIN_KEY}, unverified`;
    } else if (scopedRemote && sent === scopedRemote) {
      status = "OK (scoped)";
    } else if (legacyRemote && sent === legacyRemote) {
      status = `OK (accepted as ${LEGACY_ADMIN_KEY})`;
    } else {
      status = scopedLocal
        ? "REJECTED — value matches neither the deployment's scoped nor legacy key"
        : `REJECTED — ${LEGACY_ADMIN_KEY} does not match this deployment`;
    }

    rows.push({ intent, envVar, local: fingerprint(sent), status });
  }

  const width = Math.max(...rows.map((row) => row.envVar.length));
  for (const row of rows) {
    console.log(
      `  ${row.envVar.padEnd(width)}  ${(row.local ?? "-").padEnd(12)}  ${row.status}`,
    );
  }

  console.log(
    `\n  ${LEGACY_ADMIN_KEY.padEnd(width)}  ${(fingerprint(legacyLocal) ?? "-").padEnd(12)}  ` +
      (legacyLocal && legacyRemote
        ? legacyLocal === legacyRemote
          ? "OK — matches the deployment"
          : "MISMATCH — the usual cause of a rejected write, and of minting another key"
        : remoteReachable
          ? "not set on deployment"
          : "unverified — could not read deployment env"),
  );

  if (!remoteReachable) {
    console.log(
      `\nCould not read ${inspectName ?? "the deployment"}'s stored env via the Convex CLI.\n` +
        "The deploy key in this environment probably belongs to a different deployment,\n" +
        "so local tokens could not be verified. Statuses above are local presence only.",
    );
  }

  console.log("\nTo fix a MISMATCH, copy the deployment's own value rather than minting a new key:");
  console.log("  bunx convex env get CONVEX_ADMIN_KEY        # the value that deployment accepts");
  console.log("  bunx convex env set CONVEX_ADMIN_TOKEN_<INTENT> <value>   # scope it per intent");
  console.log("\nSee docs/agents/convex-credentials.md for the full map.");
}

main();
