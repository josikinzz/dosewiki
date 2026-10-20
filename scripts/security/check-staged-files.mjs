#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const LINTABLE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

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

const lintFiles = staged.filter((file) => LINTABLE.test(file) && !file.startsWith("vendor/openchemlib/"));
if (lintFiles.length > 0) {
  console.log("Linting staged JavaScript and TypeScript files...");
  const eslint = path.join(repoRoot, "node_modules", ".bin", "eslint");
  const result = spawnSync(eslint, ["--no-warn-ignored", "--", ...lintFiles], { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    console.error("ESLint failed. Please fix issues before committing.");
    process.exit(result.status ?? 1);
  }
}
