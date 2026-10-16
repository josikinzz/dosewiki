import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

import {
  keepPublicBuildInputs,
} from "./build-surface.mjs";

test("only NEXT_PUBLIC_* and NODE_OPTIONS lines survive as build inputs", () => {
  const pulled = [
    'NEXT_PUBLIC_SITE_FLAVOR="effectindex"',
    'POSTGRES_POOLED_URL="postgres://secret"',
    'NODE_OPTIONS="--max-old-space-size=8192"',
    'DATA_ADMIN_KEY="secret"',
    'NEXT_PUBLIC_lower="kept only when upper case"',
    'NEXT_PUBLIC_SITE_URL="https://dose.wiki"',
    '# NEXT_PUBLIC_COMMENTED="no"',
    ' NEXT_PUBLIC_INDENTED="no"',
    'NODE_OPTIONS_EXTRA="no"',
  ].join("\n");
  assert.equal(
    keepPublicBuildInputs(pulled),
    [
      'NEXT_PUBLIC_SITE_FLAVOR="effectindex"',
      'NODE_OPTIONS="--max-old-space-size=8192"',
      'NEXT_PUBLIC_SITE_URL="https://dose.wiki"',
    ].join("\n"),
  );
  assert.equal(keepPublicBuildInputs(""), "");
});

test("remote builds withhold database credentials and production promotion", async () => {
  const remote = parse(await readFile(new URL("../../.github/workflows/remote-build.yml", import.meta.url), "utf8"));
  const remoteSteps = remote.jobs.build.steps;
  const remoteRuns = remoteSteps.map((step) => step.run ?? "").join("\n");
  const deploy = remoteSteps.find((step) => step.id === "deploy");
  assert.match(deploy.run, /deploy --archive=tgz --yes \$prod_flags/);
  assert.match(deploy.run, /prod_flags="--prod --skip-domain"/);
  assert.doesNotMatch(remoteRuns, /--prebuilt|vercel\S* build|bun run build/);
  assert.doesNotMatch(remoteRuns, /VERCEL_CLI" (promote|alias)|vercel (promote|alias)/);
  assert.doesNotMatch(JSON.stringify(remote), /POSTGRES/);
});
