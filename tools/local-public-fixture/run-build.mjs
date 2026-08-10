import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createPublicFixtureCorpus } from "../../src/test/fixtures/publicCorpus.mjs";
import { startPublicReadStub } from "./convexStub.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const tempRoot = await mkdtemp(path.join(tmpdir(), "dosewiki-readiness-"));
const appRoot = path.join(tempRoot, "app");

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`${command} exited from signal ${signal}`));
    else resolve(code ?? 1);
  });
});

const stub = await startPublicReadStub({ corpus: createPublicFixtureCorpus() });
let exitCode = 1;

try {
  const copyCode = await run("rsync", [
    "-a",
    "--exclude=.git",
    "--exclude=.next",
    "--exclude=node_modules",
    "--exclude=.env*",
    `${repoRoot}/`,
    `${appRoot}/`,
  ]);
  if (copyCode !== 0) throw new Error(`rsync failed with exit code ${copyCode}`);

  const modulesCode = await run("cp", ["-al", path.join(repoRoot, "node_modules"), path.join(appRoot, "node_modules")]);
  if (modulesCode !== 0) throw new Error(`node_modules hardlink copy failed with exit code ${modulesCode}`);

  const env = {
    ...process.env,
    NODE_ENV: "production",
    CONVEX_PUBLIC_READ_URL: stub.url,
    CONVEX_URL: "",
    VITE_CONVEX_URL: "",
    NEXT_PUBLIC_CONVEX_URL: "",
    CONVEX_ADMIN_KEY: "",
    TARGET_CONVEX_URL: "",
    SOURCE_CONVEX_URL: "",
    ENABLE_TEST_ENV: "false",
    AUTH_SECRET: "readiness-local-only-not-for-deployment",
    GITHUB_ID: "",
    GITHUB_SECRET: "",
    ADMIN_PASSWORD: "",
  };

  exitCode = await run("npm", ["run", "build"], { cwd: appRoot, env });
  console.log(`Fixture reads: ${stub.requests.length}`);
  for (const name of [...new Set(stub.requests.map(({ path: queryPath }) => queryPath))].sort()) {
    console.log(`- ${name}`);
  }
} finally {
  await stub.close();
  if (exitCode === 0 || process.env.KEEP_READINESS_BUILD !== "1") {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    console.error(`Retained failed readiness build at ${appRoot}`);
  }
}

process.exitCode = exitCode;
