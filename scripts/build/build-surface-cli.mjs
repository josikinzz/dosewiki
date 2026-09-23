#!/usr/bin/env node
/**
 * Workflow entry point for artifact identity (scripts/build/build-surface.mjs).
 * Workflows call this instead of re-encoding the artifact tables in shell.
 * Uses only Node built-ins so it runs before `bun install`.
 *
 * Usage:
 *   node scripts/build/build-surface-cli.mjs outputs <artifact>
 *     Print surface, flavor, dir, and (inside a workflow run) deployment_id
 *     as `key=value` lines for `$GITHUB_OUTPUT`.
 *   node scripts/build/build-surface-cli.mjs public-build-inputs <env file>
 *     Print the file's NEXT_PUBLIC_* and NODE_OPTIONS lines; a missing file
 *     prints nothing.
 *   node scripts/build/build-surface-cli.mjs unignore-build-directories [.vercelignore]
 *     Drop the .next-*\/ rule in place; fails when the rule is gone.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { artifactOutputs, keepPublicBuildInputs, unignoreBuildDirectories } from "./build-surface.mjs";

const USAGE =
  "Usage: build-surface-cli.mjs outputs <artifact> | public-build-inputs <env file> | unignore-build-directories [.vercelignore]";

function readIfPresent(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function main([command, argument]) {
  switch (command) {
    case "outputs":
      process.stdout.write(artifactOutputs(argument));
      return;
    case "public-build-inputs": {
      if (!argument) throw new Error(USAGE);
      const kept = keepPublicBuildInputs(readIfPresent(argument));
      process.stdout.write(kept ? `${kept}\n` : "");
      return;
    }
    case "unignore-build-directories": {
      const file = argument ?? ".vercelignore";
      writeFileSync(file, unignoreBuildDirectories(readFileSync(file, "utf8")));
      return;
    }
    default:
      throw new Error(USAGE);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exit(1);
}
