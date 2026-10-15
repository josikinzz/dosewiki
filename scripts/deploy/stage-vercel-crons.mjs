#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveArtifact } from "../build/build-surface.mjs";

const WRITER_CRON_PREFIX = "/api/cron/";

export function stageCronsForArtifact(config, artifact) {
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
