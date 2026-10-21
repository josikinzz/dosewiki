#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const envFiles = staged.filter((file) => {
  const name = path.posix.basename(file);
  return name.startsWith(".env") && name !== ".env.example";
});
if (envFiles.length > 0) {
  console.error(`Attempting to commit .env files: ${envFiles.join(", ")}`);
  console.error("   Add these to .gitignore or use .env.example for templates");
  process.exit(1);
}

if (staged.length > 0) {
  const lintFiles = path.join(repoRoot, "scripts", "lint", "lint-files.mjs");
  const result = spawnSync(process.execPath, [lintFiles, ...staged], { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    console.error("Lint checks failed on staged files. Fix them before committing.");
    process.exit(1);
  }
}
