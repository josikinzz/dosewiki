#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commentScope } from "../lib/comment-scope.mjs";
import { isScannedFile } from "./em-dash-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = process.argv
  .slice(2)
  .filter((arg) => arg !== "--")
  .map((file) => path.relative(repoRoot, path.resolve(file)));

const checks = [
  {
    name: "ESLint",
    command: [path.join(repoRoot, "node_modules", ".bin", "eslint"), "--no-warn-ignored", "--"],
    accepts: (file) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file),
  },
  {
    name: "CSS comment check",
    command: [process.execPath, path.join(repoRoot, "scripts", "lint", "check-css-comments.mjs")],
    accepts: commentScope(repoRoot, /\.css$/),
  },
  {
    name: "Em dash check",
    command: [process.execPath, path.join(repoRoot, "scripts", "lint", "check-em-dashes.mjs")],
    accepts: isScannedFile,
  },
];

let failed = false;
for (const { name, command: [executable, ...args], accepts } of checks) {
  const selected = files.filter(accepts);
  if (selected.length === 0) continue;
  const result = spawnSync(executable, [...args, ...selected], { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`${name} failed on ${selected.length} file(s).`);
    failed = true;
  }
}
if (failed) process.exit(1);
