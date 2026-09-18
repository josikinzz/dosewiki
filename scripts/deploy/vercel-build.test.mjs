import assert from "node:assert/strict";
import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "scripts/deploy/vercel-build.mjs");

const DEPLOY_KEYS = [
  "prod:example-target|synthetic-production-secret",
  "dev:local-team|synthetic-development-secret",
  "unrecognized:target|synthetic-unknown-secret",
];

test("the executable wrapper cannot invoke a deploy child for any deploy-key class", async () => {
  const binDir = await mkdtemp(path.join(os.tmpdir(), "dosewiki vercel build "));
  const callsPath = path.join(binDir, "calls.log");
  const wrapperPath = path.join(binDir, "vercel-build.mjs");
  const nodeShim = `#!/bin/sh\nprintf '%s\\n' "$0 $*" >> "$CALLS_PATH"\nexit "\${VERIFY_STATUS:-0}"\n`;
  const commandShim = `#!/bin/sh\nprintf '%s\\n' "$0 $*" >> "$CALLS_PATH"\n`;

  try {
    await Promise.all([
      copyFile(scriptPath, wrapperPath),
      writeFile(path.join(binDir, "node"), nodeShim),
      writeFile(path.join(binDir, "bun"), commandShim),
      writeFile(path.join(binDir, "bunx"), commandShim),
    ]);
    await Promise.all([
      chmod(path.join(binDir, "node"), 0o755),
      chmod(path.join(binDir, "bun"), 0o755),
      chmod(path.join(binDir, "bunx"), 0o755),
    ]);

    for (const deployKey of DEPLOY_KEYS) {
      const baseEnv = {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        CALLS_PATH: callsPath,
        DATA_BACKEND: "postgres",
        VERCEL: "1",
        VERCEL_ENV: "production",
        PROVIDER_DEPLOY_KEY: deployKey,
      };

      await writeFile(callsPath, "");
      const result = spawnSync(process.execPath, [wrapperPath], {
        cwd: repoRoot,
        env: baseEnv,
        encoding: "utf8",
      });

      assert.equal(result.status, 0, result.stderr);
      const calls = await readFile(callsPath, "utf8");
      assert.match(calls, /bun run build/);
      assert.doesNotMatch(calls, /bunx|deploy/);

      await writeFile(callsPath, "");
      const planResult = spawnSync(process.execPath, [wrapperPath, "--plan"], {
        cwd: repoRoot,
        env: baseEnv,
        encoding: "utf8",
      });
      assert.equal(planResult.status, 0, planResult.stderr);
      assert.equal(await readFile(callsPath, "utf8"), "");

      await writeFile(callsPath, "");
      const failedVerification = spawnSync(process.execPath, [wrapperPath], {
        cwd: repoRoot,
        env: { ...baseEnv, VERIFY_STATUS: "1" },
        encoding: "utf8",
      });
      assert.equal(failedVerification.status, 1);
      const failedCalls = await readFile(callsPath, "utf8");
      assert.doesNotMatch(failedCalls, /bun run build|bunx|deploy/);

      const escapedKey = new RegExp(deployKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      for (const output of [
        result.stdout,
        result.stderr,
        planResult.stdout,
        planResult.stderr,
        failedVerification.stdout,
        failedVerification.stderr,
      ]) {
        assert.doesNotMatch(output, escapedKey);
      }
    }
  } finally {
    await rm(binDir, { recursive: true, force: true });
  }
});
