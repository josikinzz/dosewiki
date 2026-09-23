#!/usr/bin/env node
// Stages the root vercel.json for one release artifact. The root file carries
// every project's cron jobs; each artifact keeps only the jobs its project
// owns (docs/operations/deployment.md, cron ownership table). Writer jobs
// under /api/cron/ belong to the editor alone.
//
// Usage: node scripts/deploy/stage-vercel-crons.mjs <public|editor|effectindex> [vercel.json]
// Rewrites the file in place and prints the staged cron paths.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveArtifact } from "../build/build-surface.mjs";

const WRITER_CRON_PREFIX = "/api/cron/";

export function stageCronsForArtifact(config, artifact) {
  // Throws on an unknown artifact name; ownership comes from artifact identity.
  const keepWriters = resolveArtifact(artifact).ownsWriterCrons;
  const crons = (config.crons ?? []).filter(
    (cron) => cron.path.startsWith(WRITER_CRON_PREFIX) === keepWriters,
  );
  return { ...config, crons };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [artifact, file = "vercel.json"] = process.argv.slice(2);
  const staged = stageCronsForArtifact(JSON.parse(readFileSync(file, "utf8")), artifact);
  writeFileSync(file, `${JSON.stringify(staged, null, 2)}\n`);
  for (const cron of staged.crons) console.log(`${cron.schedule}\t${cron.path}`);
}
