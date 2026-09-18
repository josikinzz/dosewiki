#!/usr/bin/env bun
/** Forward the same explicit target and confirmation flags to every producer. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

for (const producer of ["generateSubstanceSocialCards.ts", "generatePageSocialCards.ts", "generateEntitySocialCards.ts"]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(producer, import.meta.url)), ...process.argv.slice(2)], {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
